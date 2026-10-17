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
  reauthenticate,
  reloadUser,
  requestEmailChange as requestAuthEmailChange,
  requestPasswordReset as requestAuthPasswordReset,
  sendVerification,
  signIn,
  signOut,
  updatePassword,
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
 * Owns who is signed in. Firebase Auth proves the identity; users/{uid} supplies the name,
 * role, status and saved services. The status becomes 'signed-in' only after the Auth email is
 * verified and an active profile has been read (or created on the first verified sign-in).
 * An unverified account is signed out again at once, and is sent a verification email only when
 * none went to its address since the page loaded or when the person asks for another.
 * The profile is re-read after each navigation to a signed-in page (at most once a minute), on
 * each new staff page, when the tab becomes visible and after a denied request, so a role change
 * or a disabled account takes effect without a reload. Results that arrive after the identity
 * changed are dropped, and a sign-in gives up after SIGN_IN_TIMEOUT_MS instead of waiting on.
 * When reading the account failed for want of a connection (offline, or loading it timed out),
 * the store tries again once the browser reports the connection back.
 * main.js passes the router to init() so this module never imports it (no import cycle).
 */

export const READY_TIMEOUT_MS = 8000
export const PROFILE_CACHE_MS = 60_000
/**
 * The longest login() waits, from the call until the store has settled on the identity: the SDK
 * sign-in, then a reload, an email and a sign-out (unverified) or the profile read and first
 * write (verified). Past it the sign-in ends with a retryable error instead of waiting on.
 */
export const SIGN_IN_TIMEOUT_MS = 20_000

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

/**
 * The lastError values a returning connection can cure. A network failure is recorded as
 * 'offline' (see READ_FAILURES); 'timeout' means the account did not load within READY_TIMEOUT_MS.
 */
const CONNECTION_FAILURES = new Set(['offline', 'timeout'])

/**
 * The outcomes of a resolution that found the account unverified and signed it out again;
 * login() rejects with the AuthError of the same code.
 */
const UNVERIFIED_OUTCOMES = new Set([
  'email-unverified',
  'verification-sent',
  'verification-recently-sent',
  'verification-unsent',
])

/**
 * What an unverified resolution says about the verification email: nothing was sent (one already
 * went to the address), one was sent, Firebase refused another as too soon after the last (so an
 * email went out a short time ago), or the send failed for another reason.
 *
 * @param {boolean} attempted - whether this resolution tried to send the email
 * @param {unknown} sendFailure - what the send rejected with (an AuthError), or null
 */
const unverifiedOutcome = (attempted, sendFailure) => {
  if (!attempted) {
    return 'email-unverified'
  }
  if (sendFailure === null) {
    return 'verification-sent'
  }
  return sendFailure?.code === 'too-many-requests'
    ? 'verification-recently-sent'
    : 'verification-unsent'
}

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
  // True while the promise behind `ready` has not resolved yet.
  let readyPending = false
  /**
   * Counts identity changes inside this store: +1 when a resolution or logout() starts.
   * handleAuthEvent (for resolveUser), login, revalidateProfile, writeSaved and register capture it
   * and check it again before they change store state, sign out or navigate, so a slow result for
   * one identity never lands on the next. It is private: pages holding their own private data
   * watch identityEpoch or identitySignal instead.
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
  // What the last unverified resolution's send rejected with, or null; login() keeps its code as
  // the cause of a 'verification-unsent' or 'verification-recently-sent' outcome.
  let verificationFailure = null
  // The addresses (normalised) a verification email went to since the page loaded, from
  // register() or an unverified sign-in, plus those Firebase refused another for as too soon
  // after the last. An unverified sign-in to one of them sends nothing and points to that email:
  // Firebase refuses a second send shortly after the first.
  const verificationSentTo = new Set()
  // The address whose unverified sign-in sends an email even so: set by resendVerification() for
  // the length of its sign-in, because the person asked for another.
  let resendRequestedFor = null
  // The last resolution that ended on an unverified account, recorded before its own sign-out.
  // That sign-out fires the null event that replaces it, so lastEvent never holds it; a login()
  // that receives its user from the SDK only once that sign-out has begun finds the outcome here
  // instead of waiting for another event.
  let unverifiedEvent = { session: 0, uid: null, outcome: null }
  let loggingOut = false
  const waiters = []

  /**
   * Moves to a new identity epoch: aborts the current identitySignal, hands out a fresh one and
   * adds 1 to identityEpoch. A request that took the old signal can stop early and code that
   * recorded the old epoch can drop a late result; nothing is cancelled unless the caller checks.
   * Runs when a different uid (or the first) signs in, on sign-out, and when a re-read profile
   * changes role, revision or email.
   */
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

  /**
   * Whether a disabled account still gets the 'account-disabled' sign-out. The SDK signs such an
   * account out before the failing call rejects, so its null event has usually started a newer
   * session by then; the notice is still due while nobody else is signed in. Once another identity
   * holds the SDK, the result is stale and must not sign it out.
   */
  const owesDisabledNotice = (ended, stillCurrent) =>
    ended === 'account-disabled' && (stillCurrent || currentUser() === null)

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

  /**
   * Starts waiting for the account again: the next current resolution, or READY_TIMEOUT_MS from
   * now, resolves `ready`. While an earlier promise is still pending (a navigation may be awaiting
   * it), that same promise is kept and only its timeout restarts, so no waiter is left behind.
   */
  const armReady = () => {
    clearTimeout(readyTimer)
    if (!readyPending) {
      readyPending = true
      readyPromise.value = new Promise((resolve) => {
        settleReady = () => {
          clearTimeout(readyTimer)
          readyPending = false
          resolve()
        }
      })
    }
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
      // An ended session goes to the caller even when it is stale: the caller decides whether a
      // disabled account is still owed its notice.
      if (endedSessionReason(error) !== null) {
        throw error
      }
      if (!isCurrent()) {
        return profile
      }
      // Signed in with the old address on screen until Retry succeeds.
      lastError.value = readFailure(error)
      return profile
    }
  }

  /**
   * The state machine. `isCurrent()` turns false once a newer resolution or a
   * logout has started, so a slow resolution never commits, signs out or navigates over it. The one
   * exception is a disabled account the SDK has already signed out (see owesDisabledNotice).
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
          // One email per address unless the person asks for another; the outcome says which
          // email to open, and the sign-out happens whatever the send did.
          const address = normalizeEmail(firebaseUser.email)
          const attempted = address === resendRequestedFor || !verificationSentTo.has(address)
          let sendFailure = null
          if (attempted) {
            try {
              await sendVerification(firebaseUser)
            } catch (error) {
              sendFailure = error
            }
          }
          const outcome = unverifiedOutcome(attempted, sendFailure)
          if (outcome !== 'verification-unsent') {
            verificationSentTo.add(address)
          }
          // signOut() acts on whoever the SDK holds now: never for a newer identity.
          if (!isCurrent()) {
            return 'stale'
          }
          // Still current, so `session` is this resolution's own.
          unverifiedEvent = { session, uid: firebaseUser.uid, outcome }
          verificationFailure = sendFailure
          await signOut()
          return outcome
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
      const ended = endedSessionReason(error)
      if (owesDisabledNotice(ended, isCurrent())) {
        await logout('account-disabled')
        return 'account-disabled'
      }
      if (!isCurrent()) {
        return 'stale'
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
   * (the latest current one, or an unverified one its own sign-out replaced); `null` when the
   * identity has moved on to somebody else or nobody.
   */
  const resolutionFor = (uid, sinceSession) => {
    if (resolving !== null && resolvingUid === uid) {
      return resolving
    }
    if (lastEvent.session > sinceSession && lastEvent.uid === uid) {
      return Promise.resolve(lastEvent.outcome)
    }
    if (unverifiedEvent.session > sinceSession && unverifiedEvent.uid === uid) {
      return Promise.resolve(unverifiedEvent.outcome)
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
      // The connection came back after reading the account failed for want of it: try again now,
      // as Retry would, so the account loads (or a pending email change finishes) without the
      // person pressing it. A failure of another kind is left to the Retry control.
      window.addEventListener('online', () => {
        if (!CONNECTION_FAILURES.has(lastError.value)) {
          return
        }
        if (status.value === 'error') {
          void retry()
        } else if (status.value === 'signed-in') {
          void revalidateProfile({ reason: 'online' })
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
   * moved on changes nothing; one older than the profile already held (a lower revision, read
   * before the person's own save landed) leaves the user and the epoch as they are.
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
        // The revision only ever grows, so a lower one is a snapshot read before the person's own
        // save landed: adopting it would undo that save on screen and drop in-flight requests.
        if (profile.revision < user.value.revision) {
          return
        }
        const roleChanged = profile.role !== user.value.role
        // A revision or email change bumps the epoch even for the same account, so a page that
        // guards an in-flight request on the epoch drops its result as it would for a new account.
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
        const ended = endedSessionReason(error)
        if (owesDisabledNotice(ended, isCurrent())) {
          await logout('account-disabled')
          return
        }
        if (!isCurrent()) {
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

  /**
   * Signs in with email and password and waits until the store has settled on that identity.
   * Resolves with the signed-in user once the profile is committed, or with null when the session
   * moved on without it (a disabled account, a sign-out or a newer sign-in); the store has then
   * already replaced the route. Rejects with an AuthError when the sign-in is refused; while the
   * email is not verified (the account is signed out again) with 'email-unverified' (nothing sent:
   * an email already went to the address since the page loaded), 'verification-sent' (sent now),
   * 'verification-recently-sent' (Firebase refused another as too soon after the last) or
   * 'verification-unsent' (the send failed otherwise, named as its reason), the first three
   * naming the account's address; or with 'offline' or 'profile-unavailable' when the profile
   * could not be read.
   */
  const signInAndSettle = async ({ email, password }) => {
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
    if (UNVERIFIED_OUTCOMES.has(outcome)) {
      throw new AuthError(outcome, {
        email: firebaseUser.email,
        cause: verificationFailure,
        reason: verificationFailure?.code,
      })
    }
    if (outcome === 'error') {
      throw new AuthError(lastError.value === 'offline' ? 'offline' : 'profile-unavailable')
    }
    // 'account-disabled', 'signed-out', 'stale': the session moved on; a replace already happened.
    return null
  }

  /**
   * signInAndSettle with a deadline: after SIGN_IN_TIMEOUT_MS it rejects with AuthError
   * 'sign-in-timeout', so a sign-in form's submit always ends. The deadline changes no store
   * state (the status is never set to 'signed-out' for it). A resolution that finishes later
   * still commits whoever the SDK holds, but this call has already settled, so its caller never
   * navigates on that late answer.
   */
  const login = (credentials) => {
    let timer = null
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new AuthError('sign-in-timeout')), SIGN_IN_TIMEOUT_MS)
    })
    return Promise.race([signInAndSettle(credentials), deadline]).finally(() => clearTimeout(timer))
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
   * A createAccount() failure rejects with its own error. Once the account exists, an email that
   * could not be sent rejects with AuthError 'account-created-email-unsent' (the send failure as
   * its cause), after the same sign-out: the person is told the account exists and that signing
   * in sends the email again, never to register again. A failed sign-out is not reported over
   * either outcome: the store never committed the new account, and the next time the app
   * resolves it (a sign-in or a page load) the unverified account is signed out again. A sent
   * email is remembered, so signing in before its link is opened points to it instead of sending
   * another; after a failed one, signing in sends it.
   */
  const register = async ({ email, password, displayName, redirect = null }) => {
    const startedIn = session
    registration = { email: normalizeEmail(email), uid: null }
    try {
      const created = await createAccount({ email, password, displayName })
      registration.uid = created.uid
      let sendFailure = null
      try {
        await sendVerification(created, { redirect })
        verificationSentTo.add(normalizeEmail(created.email))
      } catch (error) {
        sendFailure = error
      }
      // Only the account this call created is signed out, and only while no newer identity
      // event has begun: otherwise the SDK's current user is somebody else's session.
      const ownsSession = currentUser()?.uid === created.uid && startedIn === session
      if (ownsSession) {
        await signOut().catch(() => undefined)
      }
      if (sendFailure !== null) {
        throw new AuthError('account-created-email-unsent', { cause: sendFailure })
      }
      return ownsSession ? 'registered' : 'superseded'
    } finally {
      registration = null
    }
  }

  /**
   * "Send the verification email again": a sign-in attempt that sends the email even when one
   * already went to this address. Resolves 'sent' once it went out, 'signed-in' when the account
   * turned out to be verified, 'ended' when the session moved on; otherwise rejects with the
   * sign-in's AuthError ('verification-recently-sent' when Firebase refused another as too soon
   * after the last).
   */
  const resendVerification = async ({ email, password }) => {
    resendRequestedFor = normalizeEmail(email)
    try {
      const signedIn = await login({ email, password })
      return signedIn === null ? 'ended' : 'signed-in'
    } catch (error) {
      if (isAuthError(error) && error.code === 'verification-sent') {
        return 'sent'
      }
      throw error
    } finally {
      resendRequestedFor = null
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

  /**
   * Changes the signed-in user's password: re-authenticates the account the SDK holds with the
   * current password, then sets the new one. Each step runs only while the SDK still holds the
   * account the store shows (same uid, no newer store session), checked before each step, so a
   * sign-in from another tab stops the change before anything is updated. Neither step changes
   * the uid, so no listener event follows: the user, the epoch and the page stay as they are and
   * the SDK keeps this tab signed in with fresh tokens. The passwords are passed through, never
   * kept.
   * Resolves once Auth has confirmed the new password. Rejects with AuthError
   * 'invalid-credentials' for a wrong current password; 'requires-recent-login' when nobody or
   * another account is signed in, or the session ended (a revoked session or a disabled account
   * also leaves the page, as the profile re-check does); otherwise the failure of the step that
   * failed ('too-many-requests', 'weak-password', 'network', 'offline', 'unknown').
   */
  const changePassword = async ({ currentPassword, newPassword }) => {
    const startedIn = session
    const uid = user.value?.uid ?? null
    const firebaseUser = currentUser()
    const holdsSameAccount = () =>
      startedIn === session &&
      isSignedIn.value &&
      user.value?.uid === uid &&
      currentUser()?.uid === uid
    if (uid === null || firebaseUser === null || !holdsSameAccount()) {
      throw new AuthError('requires-recent-login')
    }
    try {
      await reauthenticate(firebaseUser, currentPassword)
      if (!holdsSameAccount()) {
        throw new AuthError('requires-recent-login')
      }
      await updatePassword(firebaseUser, newPassword)
    } catch (error) {
      const ended = endedSessionReason(error)
      if (ended === null) {
        throw error
      }
      // The SDK has already signed out. A disabled account leaves with its notice, as the profile
      // re-check does, and is never told that its password was wrong; a revoked session leaves
      // here only when the SDK's null event has not done so already.
      if (owesDisabledNotice(ended, startedIn === session)) {
        await logout('account-disabled')
      } else if (startedIn === session) {
        settleSignedOut()
        leaveProtectedRoute()
      }
      throw new AuthError('requires-recent-login', { cause: error })
    }
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
    changePassword,
    revalidateProfile,
    saveService,
    unsaveService,
  }
})
