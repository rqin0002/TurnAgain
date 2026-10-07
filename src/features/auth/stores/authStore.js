import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import {
  PERMISSION_DENIED_EVENT,
  RepositoryError,
  isRepositoryError,
} from '@/shared/data/RepositoryError.js'
import { normalizeEmail } from '@/shared/domain/catalogueValidation.js'

import { AuthError, endedSessionReason, isAuthError } from '../data/AuthError.js'
import {
  createAccount,
  currentUser,
  getIdToken,
  onAuthChanged,
  reloadUser,
  requestEmailChange as requestAuthEmailChange,
  requestPasswordReset as requestAuthPasswordReset,
  sendVerification,
  signIn,
  signOut,
} from '../data/firebaseAuthRepository.js'
import {
  createProfile,
  fetchProfile,
  saveService as saveServiceRecord,
  syncEmail,
  unsaveService as unsaveServiceRecord,
  upgradeProfile,
} from '../data/userRepository.js'
import { decideRouteAccess } from '../router/routeAccess.js'

/**
 * The only Pinia store. One `onAuthStateChanged` listener feeds
 * `resolveUser`, the single state machine; navigation, tab visibility and denied repository calls
 * re-validate the profile. The router is handed in by `main.js` (`init({ router })`) and kept in
 * a module variable, never imported, so router -> guard -> store -> router is not a cycle.
 */

export const READY_TIMEOUT_MS = 8000
export const PROFILE_CACHE_MS = 60_000

/** RepositoryError.code -> lastError. The 8-second race sets 'timeout' itself. */
export const READ_FAILURES = Object.freeze({
  network: 'offline',
  offline: 'offline',
  permission: 'profile-unavailable',
  unavailable: 'profile-unavailable',
  'invalid-data': 'profile-unavailable',
  'not-found': 'profile-unavailable',
  conflict: 'profile-unavailable',
})

const readFailure = (error) => {
  if (isRepositoryError(error)) {
    return READ_FAILURES[error.code] ?? 'profile-unavailable'
  }
  if (isAuthError(error) && (error.code === 'offline' || error.code === 'network')) {
    return 'offline'
  }
  return 'profile-unavailable'
}

// `profile.uid` is the requested uid: the repository refuses a record that names another one,
// so the identity is never patched over here.
const toUser = (firebaseUser, profile) =>
  Object.freeze({
    uid: profile.uid,
    email: profile.email,
    emailVerified: firebaseUser.emailVerified === true,
    displayName: profile.displayName,
    role: profile.role,
    status: profile.status,
    revision: profile.revision,
    savedServiceIds: Object.freeze([...profile.savedServiceIds]),
  })

let router = null

export const useAuthStore = defineStore('auth', () => {
  const status = ref('restoring')
  const user = shallowRef(null)
  const lastError = ref(null)
  const identityEpoch = ref(0)
  let controller = new AbortController()
  const identitySignal = shallowRef(controller.signal)
  const emailSyncPending = ref(false)
  const profileReadAt = ref(null)
  // A promise is never made reactive (a proxied `then` breaks `await`); shallowRef keeps it raw.
  const readyPromise = shallowRef(Promise.resolve())
  const ready = computed(() => readyPromise.value)

  const isSignedIn = computed(() => status.value === 'signed-in' && user.value !== null)
  const role = computed(() => user.value?.role ?? null)
  const canAccess = (allowedRoles) =>
    user.value !== null && Array.isArray(allowedRoles) && allowedRoles.includes(user.value.role)

  let unsubscribe = null
  let settleReady = () => undefined
  let readyTimer = null
  /**
   * The session counter: +1 at the start of every resolution and of `logout()`. Every
   * async entry point captures it and, after each await, stops when it has moved on, so work
   * begun for one identity never writes state, signs out or navigates for the next one.
   */
  let session = 0
  let resolving = null
  let resolvingUid = null
  let lastEvent = { session: 0, uid: null, outcome: 'signed-out' }
  // What the listener last reported: the SDK notifies identity changes only.
  let lastEventUid = null
  let listenerEvents = 0
  let revalidating = null
  // The account register() is creating: `{ email, uid }`, the uid known once createAccount()
  // returns; its transient signed-in event is the only event the store ignores.
  let registration = null
  // Why the last 'verification-unsent' outcome could not resend the email; login() rethrows it.
  let verificationFailure = null
  let loggingOut = false
  const waiters = []

  /** Every identity change aborts the previous signal so late requests are discarded. */
  const bumpEpoch = () => {
    controller.abort()
    controller = new AbortController()
    identitySignal.value = controller.signal
    identityEpoch.value += 1
  }

  const commitUser = (firebaseUser, profile) => {
    const next = toUser(firebaseUser, profile)
    const identityChanged = user.value === null || user.value.uid !== next.uid
    user.value = next
    status.value = 'signed-in'
    if (!emailSyncPending.value) {
      lastError.value = null
    }
    profileReadAt.value = Date.now()
    if (identityChanged) {
      bumpEpoch()
    }
  }

  const settleSignedOut = () => {
    const hadIdentity = user.value !== null
    user.value = null
    status.value = 'signed-out'
    lastError.value = null
    emailSyncPending.value = false
    profileReadAt.value = null
    if (hadIdentity) {
      bumpEpoch()
    }
  }

  /** A protected page whose session ended goes back through the guard. */
  const leaveProtectedRoute = () => {
    const route = router?.currentRoute.value
    if (route?.meta.requiresAuth) {
      void router.replace({ name: 'login', query: { redirect: route.fullPath } })
    }
  }

  /**
   * The guard's decision, re-run for the page that is showing: a protected route
   * entered while the status was 'error' rendered the retry panel, so the role is checked here
   * once the identity is known. The navigation is fired, never awaited; the guard resolves it.
   */
  const enforceRouteAccess = () => {
    const route = router?.currentRoute.value
    if (route && decideRouteAccess(route.meta, user.value) === 'forbidden') {
      void router.replace({ name: 'forbidden' })
    }
  }

  const armReady = () => {
    clearTimeout(readyTimer)
    readyPromise.value = new Promise((resolve) => {
      settleReady = () => {
        clearTimeout(readyTimer)
        resolve()
      }
    })
    readyTimer = setTimeout(() => {
      // Never signed-out on a timeout: protected routes render the retry panel.
      if (status.value === 'restoring' || status.value === 'error') {
        status.value = 'error'
        lastError.value = 'timeout'
      }
      settleReady()
    }, READY_TIMEOUT_MS)
  }

  /**
   * Refresh the token, then write the Auth email into the profile. Until the write
   * succeeds the banner stays up and every profile write is refused; Retry runs this again. A
   * result that lands after the identity moved on changes nothing.
   */
  const syncEmailFor = async (firebaseUser, profile, isCurrent) => {
    emailSyncPending.value = true
    try {
      await getIdToken(firebaseUser, true)
      const synced = await syncEmail(firebaseUser.uid, firebaseUser.email)
      if (!isCurrent()) {
        return profile
      }
      emailSyncPending.value = false
      lastError.value = null
      return synced
    } catch (error) {
      if (!isCurrent()) {
        return profile
      }
      if (endedSessionReason(error) !== null) {
        throw error
      }
      // Signed in with the old address on screen until Retry succeeds.
      lastError.value = readFailure(error)
      return profile
    }
  }

  /**
   * The state machine. `isCurrent()` turns false once a newer resolution or a
   * logout has started, so a slow resolution never commits, signs out or navigates over it.
   */
  const resolveUser = async (firebaseUser, isCurrent) => {
    if (firebaseUser === null) {
      settleSignedOut()
      // logout() navigates itself (with ?reason=); its null event must not add a second replace.
      if (!loggingOut) {
        leaveProtectedRoute()
      }
      return 'signed-out'
    }
    try {
      if (firebaseUser.emailVerified !== true) {
        await reloadUser(firebaseUser)
        if (!isCurrent()) {
          return 'stale'
        }
        if (firebaseUser.emailVerified !== true) {
          // 'email-unverified' tells the user the email went out again, so a failed resend (rate
          // limit, offline) is reported with its own code instead; the sign-out happens either way.
          let sendFailure = null
          try {
            await sendVerification(firebaseUser)
          } catch (error) {
            sendFailure = error
          }
          // signOut() acts on whoever the SDK holds now: never for a newer identity.
          if (!isCurrent()) {
            return 'stale'
          }
          await signOut()
          if (sendFailure !== null) {
            verificationFailure = sendFailure
            return 'verification-unsent'
          }
          return 'email-unverified'
        }
        // reload() flips emailVerified locally only; the rules read the token, so refresh it before
        // the first profile read or write.
        await getIdToken(firebaseUser, true)
      }
      if (!isCurrent()) {
        return 'stale'
      }
      const authEmail = normalizeEmail(firebaseUser.email)
      let profile = await fetchProfile(firebaseUser.uid)
      if (!isCurrent()) {
        return 'stale'
      }
      if (profile === null) {
        profile = await createProfile({
          uid: firebaseUser.uid,
          email: authEmail,
          displayName: firebaseUser.displayName,
        })
      } else if (profile.needsUpgrade) {
        try {
          profile = await upgradeProfile({ uid: firebaseUser.uid, email: authEmail })
        } catch (error) {
          // A refused migration is not fatal: sign in with the legacy projection and let the
          // next listener event retry the write.
          if (!isRepositoryError(error) || error.code !== 'permission') {
            throw error
          }
        }
      }
      if (!isCurrent()) {
        return 'stale'
      }
      if (profile.status !== 'active') {
        await logout('account-disabled')
        return 'account-disabled'
      }
      if (profile.email !== authEmail) {
        profile = await syncEmailFor(firebaseUser, profile, isCurrent)
        if (!isCurrent()) {
          return 'stale'
        }
      }
      commitUser(firebaseUser, profile)
      return 'signed-in'
    } catch (error) {
      if (!isCurrent()) {
        return 'stale'
      }
      const ended = endedSessionReason(error)
      if (ended === 'account-disabled') {
        await logout('account-disabled')
        return 'account-disabled'
      }
      if (ended === 'session-expired') {
        settleSignedOut()
        leaveProtectedRoute()
        return 'signed-out'
      }
      // A read failure keeps `user` untouched; the retry panel takes over.
      status.value = 'error'
      lastError.value = readFailure(error)
      return 'error'
    }
  }

  /**
   * The identity a running registration created. The SDK reports the new account before
   * `createAccount()` resolves with its uid, so until then it is known by its email.
   */
  const isRegistrationIdentity = (firebaseUser) =>
    registration !== null &&
    firebaseUser !== null &&
    (firebaseUser.uid === registration.uid ||
      normalizeEmail(firebaseUser.email) === registration.email)

  /**
   * One resolution per session: the listener, `retry()` and a same-identity `login()` all enter
   * here. A resolution that a newer one replaced hands nothing to the waiters or to `ready`.
   */
  const handleAuthEvent = async (firebaseUser) => {
    if (isRegistrationIdentity(firebaseUser)) {
      // The SDK signs the account register() just created in; register() signs it out again. The
      // event moves nothing, not even the session, so that sign-out stays current; every other
      // identity, including one signed in from a second tab meanwhile, resolves as usual.
      return 'ignored'
    }
    const startedIn = ++session
    const isCurrent = () => startedIn === session
    const uid = firebaseUser?.uid ?? null
    // A new session never inherits the previous identity's unfinished email sync.
    emailSyncPending.value = false
    resolvingUid = uid
    const run = resolveUser(firebaseUser, isCurrent)
    resolving = run
    const outcome = await run
    if (resolving !== run) {
      return outcome
    }
    resolving = null
    resolvingUid = null
    lastEvent = { session: startedIn, uid, outcome }
    settleReady()
    if (outcome === 'signed-in') {
      enforceRouteAccess()
    }
    for (const waiter of waiters.splice(0)) {
      waiter.resolve(waiter.uid === uid ? outcome : 'stale')
    }
    return outcome
  }

  /**
   * The resolution for `uid` that is running now, or the one that finished after `sinceSession`
   * (the latest current one); `null` when the identity has moved on to somebody else or nobody.
   */
  const resolutionFor = (uid, sinceSession) => {
    if (resolving !== null && resolvingUid === uid) {
      return resolving
    }
    if (lastEvent.session > sinceSession && lastEvent.uid === uid) {
      return Promise.resolve(lastEvent.outcome)
    }
    return null
  }

  /** `resolutionFor`, or the outcome of the next listener resolution when there is none yet. */
  const waitForResolution = (uid, sinceSession) =>
    resolutionFor(uid, sinceSession) ??
    new Promise((resolve) => {
      waiters.push({ uid, resolve })
    })

  /** Idempotent; called once from main.js before the router is installed. */
  const init = ({ router: appRouter } = {}) => {
    if (appRouter) {
      router = appRouter
    }
    if (unsubscribe !== null) {
      return
    }
    armReady()
    unsubscribe = onAuthChanged((firebaseUser) => {
      listenerEvents += 1
      lastEventUid = firebaseUser?.uid ?? null
      void handleAuthEvent(firebaseUser)
    })
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void revalidateProfile({ reason: 'visibility' })
        }
      })
    }
    if (typeof window !== 'undefined') {
      window.addEventListener(PERMISSION_DENIED_EVENT, (event) => {
        // The store's own profile writes report through their promise.
        if (event.detail?.source !== 'users') {
          void revalidateProfile({ reason: 'permission-denied' })
        }
      })
    }
  }

  /**
   * Re-runs the resolution for the current SDK user and re-arms the timeout. Before
   * the first listener event the SDK is still reloading the persisted user and `currentUser()` is
   * null whoever is signed in, so Retry only waits again: resolving that null would sign a member
   * on a slow link out and park them on the sign-in page when their real event lands.
   */
  const retry = () => {
    armReady()
    if (listenerEvents === 0) {
      status.value = 'restoring'
      lastError.value = null
      return readyPromise.value
    }
    void handleAuthEvent(currentUser())
    return readyPromise.value
  }

  /**
   * Re-read users/{uid} and reconcile. Waits for a running resolution first; a 'navigation'
   * re-check is skipped for 60 s after a read, while every other reason re-reads,
   * 'staff-navigation' included (a staff or admin route); the Auth user is reloaded before
   * comparing emails; a failed read keeps status and user; a result that lands after the identity
   * moved on changes nothing.
   */
  const revalidateProfile = async ({ reason = 'manual' } = {}) => {
    if (resolving !== null) {
      await resolving
    }
    if (status.value !== 'signed-in' || user.value === null) {
      return
    }
    const fresh =
      profileReadAt.value !== null && Date.now() - profileReadAt.value < PROFILE_CACHE_MS
    if (reason === 'navigation' && fresh && !emailSyncPending.value) {
      return
    }
    if (revalidating !== null) {
      return revalidating
    }
    const startedIn = session
    const uid = user.value.uid
    const isCurrent = () => startedIn === session
    const run = (async () => {
      const firebaseUser = currentUser()
      if (firebaseUser === null || firebaseUser.uid !== uid) {
        return
      }
      try {
        await reloadUser(firebaseUser)
        if (!isCurrent()) {
          return
        }
        const authEmail = normalizeEmail(firebaseUser.email)
        let profile = await fetchProfile(uid)
        if (!isCurrent()) {
          return
        }
        if (profile === null || profile.status !== 'active') {
          await logout('account-disabled')
          return
        }
        if (profile.email !== authEmail) {
          profile = await syncEmailFor(firebaseUser, profile, isCurrent)
          if (!isCurrent()) {
            return
          }
        }
        profileReadAt.value = Date.now()
        if (status.value !== 'signed-in' || user.value === null || user.value.uid !== uid) {
          return
        }
        const roleChanged = profile.role !== user.value.role
        const changed =
          roleChanged ||
          profile.revision !== user.value.revision ||
          profile.email !== user.value.email
        if (changed) {
          user.value = toUser(firebaseUser, profile)
          bumpEpoch()
        }
        if (roleChanged) {
          // The page stays mounted; only a route the new role may not see is left.
          enforceRouteAccess()
        }
        if (!emailSyncPending.value) {
          lastError.value = null
        }
      } catch (error) {
        if (!isCurrent()) {
          return
        }
        const ended = endedSessionReason(error)
        if (ended === 'account-disabled') {
          await logout('account-disabled')
          return
        }
        if (ended === 'session-expired') {
          settleSignedOut()
          leaveProtectedRoute()
          return
        }
        lastError.value = readFailure(error)
      }
    })()
    revalidating = run
    void run.finally(() => {
      if (revalidating === run) {
        revalidating = null
      }
    })
    return run
  }

  /** Resolves with the user once the resolution has committed the profile. */
  const login = async ({ email, password }) => {
    const sinceSession = session
    const eventsBefore = listenerEvents
    const uidBefore = lastEventUid
    const firebaseUser = await signIn(email, password)
    // The SDK reports identity changes only: signing in as the uid of the last listener event (a
    // failed profile read left the Auth session in place) fires no event, so the resolution runs
    // from here. Any other sign-in waits for the listener's resolution.
    const sameIdentity = listenerEvents === eventsBefore && firebaseUser.uid === uidBefore
    let outcome = sameIdentity
      ? await handleAuthEvent(firebaseUser)
      : await waitForResolution(firebaseUser.uid, sinceSession)
    if (sameIdentity && outcome === 'stale') {
      // This run was superseded. While the newest resolution is still this uid's (the SDK fired
      // its own event after all, or a retry is running) it owns the outcome; once another
      // identity, B or null, has taken over, no event for this uid is coming and this sign-in
      // ends with nothing rather than waiting forever.
      const takeover = resolutionFor(firebaseUser.uid, sinceSession)
      outcome = takeover === null ? 'stale' : await takeover
    }
    if (outcome === 'signed-in') {
      return user.value
    }
    if (outcome === 'email-unverified') {
      throw new AuthError('email-unverified')
    }
    if (outcome === 'verification-unsent') {
      throw verificationFailure
    }
    if (outcome === 'error') {
      throw new AuthError(lastError.value === 'offline' ? 'offline' : 'profile-unavailable')
    }
    // 'account-disabled', 'signed-out', 'stale': the session moved on; a replace already happened.
    return null
  }

  /**
   * `reason` becomes the `?reason=` query the sign-in page renders. The SDK delivers
   * the null listener event before `signOut()` resolves; `loggingOut` keeps `resolveUser` from
   * issuing its own `replace` so the one below is the only navigation. The session counter moves
   * first, so anything still running for the identity that is leaving stops at its next await.
   */
  const logout = async (reason) => {
    session += 1
    loggingOut = true
    try {
      await signOut()
    } catch {
      // The local session ends either way; the SDK clears its persistence regardless.
    }
    settleSignedOut()
    if (router) {
      void router.replace({ name: 'login', query: reason ? { reason } : {} })
    }
    loggingOut = false
  }

  /**
   * Creates the account, sends the verification email and signs out; never a silent sign-in.
   * Resolves 'registered', or 'superseded' when another identity took over while the email was
   * sending (a sign-in from a second tab): that identity is left signed in and untouched.
   */
  const register = async ({ email, password, displayName, redirect = null }) => {
    const startedIn = session
    registration = { email: normalizeEmail(email), uid: null }
    try {
      const created = await createAccount({ email, password, displayName })
      registration.uid = created.uid
      let ownsSession = false
      try {
        await sendVerification(created, { redirect })
      } finally {
        // Only the account this call created is signed out, and only while no newer identity
        // event has begun: otherwise the SDK's current user is somebody else's session.
        ownsSession = currentUser()?.uid === created.uid && startedIn === session
        if (ownsSession) {
          await signOut()
        }
      }
      return ownsSession ? 'registered' : 'superseded'
    } finally {
      registration = null
    }
  }

  /** "Send the verification email again": a sign-in attempt does exactly that. */
  const resendVerification = async ({ email, password }) => {
    try {
      const signedIn = await login({ email, password })
      return signedIn === null ? 'ended' : 'signed-in'
    } catch (error) {
      if (isAuthError(error) && error.code === 'email-unverified') {
        return 'sent'
      }
      throw error
    }
  }

  const requestPasswordReset = (email) => requestAuthPasswordReset(email)

  const requestEmailChange = async (newEmail) => {
    const firebaseUser = currentUser()
    if (firebaseUser === null || !isSignedIn.value) {
      throw new AuthError('requires-recent-login')
    }
    await requestAuthEmailChange(firebaseUser, newEmail)
  }

  const requireWritableProfile = () => {
    if (!isSignedIn.value) {
      throw new AuthError('profile-unavailable')
    }
    if (emailSyncPending.value) {
      throw new RepositoryError(
        'conflict',
        'Your email change is still finishing. Try again in a moment.',
        { details: { code: 'email-sync-pending' } },
      )
    }
    return user.value.uid
  }

  const applyProfile = (profile) => {
    const firebaseUser = currentUser()
    if (
      firebaseUser === null ||
      firebaseUser.uid !== profile.uid ||
      user.value === null ||
      user.value.uid !== profile.uid
    ) {
      return
    }
    // The store's own write: updated in place, no epoch bump.
    user.value = toUser(firebaseUser, profile)
    profileReadAt.value = Date.now()
  }

  const writeSaved = async (write, serviceId) => {
    const uid = requireWritableProfile()
    const startedIn = session
    try {
      const profile = await write(uid, serviceId)
      if (startedIn === session) {
        applyProfile(profile)
      }
    } catch (error) {
      // A denied own write is not fed back through the window event; re-read here.
      if (startedIn === session && isRepositoryError(error) && error.code === 'permission') {
        void revalidateProfile({ reason: 'write-denied' })
      }
      throw error
    }
  }

  const saveService = (serviceId) => writeSaved(saveServiceRecord, serviceId)
  const unsaveService = (serviceId) => writeSaved(unsaveServiceRecord, serviceId)

  return {
    status,
    user,
    lastError,
    identityEpoch,
    identitySignal,
    emailSyncPending,
    profileReadAt,
    ready,
    isSignedIn,
    role,
    canAccess,
    init,
    retry,
    login,
    logout,
    register,
    resendVerification,
    requestPasswordReset,
    requestEmailChange,
    revalidateProfile,
    saveService,
    unsaveService,
  }
})
