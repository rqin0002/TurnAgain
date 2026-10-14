import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword as firebaseUpdatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
} from 'firebase/auth'

import { firebaseAuth, getCleanupAuth } from '@/firebase/firebaseAuthClient.js'
import { normalizeEmail } from '@/shared/domain/catalogueValidation.js'

import { toAuthError } from './AuthError.js'

/**
 * The app's only door to Firebase Auth: sign-in, sign-out, registration, verification, password
 * reset, email change, re-authentication, password change and the ID token. Each export wraps the
 * SDK calls it needs and turns every rejection into an AuthError; profile documents are not
 * handled here (userRepository.js and the auth store do that). Registration is the one export that
 * runs several SDK calls: it creates the account, stores the typed name and, if the name cannot be
 * stored, removes the new account again.
 */

/**
 * A reset request never reveals whether an account exists: the emulator rejects an unknown
 * address while production resolves, so both answer the same way here.
 */
const SILENT_RESET_CODES = new Set([
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/invalid-credential',
])

/**
 * Verification links return to the sign-in page with `?verified=1` on the running site's origin.
 * Firebase Auth sends the email only when that host, localhost included, is on the project's
 * authorised domains list (Firebase console, Authentication settings); otherwise the send is
 * refused with `auth/unauthorized-continue-uri`, which AuthError reports in its own words. When
 * the registration had one, the link also carries its already-resolved `redirect`.
 */
const continueSettings = (redirect = null) => {
  if (typeof window === 'undefined') return undefined
  const signInUrl = `${window.location.origin}/login?verified=1`
  return { url: redirect ? `${signInUrl}&redirect=${encodeURIComponent(redirect)}` : signInUrl }
}

/**
 * Password-reset and change-email links end on the sign-in page of the running site, where the
 * person signs in with the new password or address. No continue URL is sent without a window.
 */
const signInContinueSettings = () =>
  typeof window === 'undefined' ? undefined : { url: `${window.location.origin}/login` }

const guarded = async (run) => {
  try {
    return await run()
  } catch (error) {
    throw toAuthError(error)
  }
}

/** @returns {Promise<import('firebase/auth').User>} */
export function signIn(email, password) {
  return guarded(async () => {
    const credential = await signInWithEmailAndPassword(
      firebaseAuth,
      normalizeEmail(email),
      password,
    )
    return credential.user
  })
}

export function signOut() {
  return guarded(() => firebaseSignOut(firebaseAuth))
}

/**
 * The typed name can only travel on the Auth user: the profile is written at the first verified
 * sign-in, and the rules refuse it before then. One retry absorbs a transient failure.
 */
const nameNewUser = async (user, displayName) => {
  try {
    await updateProfile(user, { displayName })
  } catch {
    await updateProfile(user, { displayName })
  }
}

/**
 * Removes the account a failed registration created, without ever touching another identity's
 * session. The uid check and the shared sign-out run with nothing awaited between them: once the
 * shared instance no longer holds this account (a newer sign-in, or none), the account is left as
 * it is. The delete runs on the cleanup instance because the SDK's delete ends with a sign-out of
 * the instance that holds the user. If that sign-in or delete fails, the nameless, unverified
 * account stays (it signs in as 'Member' once verified).
 */
const removeNamelessAccount = async (user, email, password) => {
  if (firebaseAuth.currentUser?.uid !== user.uid) {
    return
  }
  await firebaseSignOut(firebaseAuth)
  const cleanupAuth = getCleanupAuth()
  await signInWithEmailAndPassword(cleanupAuth, email, password)
  await deleteUser(cleanupAuth.currentUser)
}

/**
 * Creates the Auth account (the SDK signs it in) and stores the typed display name on it.
 * If the name cannot be stored, this rejects with that error and removeNamelessAccount tries to
 * delete the account without signing out a newer session. The removal is skipped when another
 * identity already holds the session, and it can fail; the unverified, nameless account then
 * remains and would be named 'Member' if it is verified later.
 */
export function createAccount({ email, password, displayName }) {
  return guarded(async () => {
    const normalizedEmail = normalizeEmail(email)
    const credential = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, password)
    try {
      await nameNewUser(credential.user, displayName)
    } catch (error) {
      await removeNamelessAccount(credential.user, normalizedEmail, password).catch(() => undefined)
      throw error
    }
    return credential.user
  })
}

export function sendVerification(user, { redirect = null } = {}) {
  return guarded(() => sendEmailVerification(user, continueSettings(redirect)))
}

export function requestPasswordReset(email) {
  return guarded(async () => {
    try {
      await sendPasswordResetEmail(firebaseAuth, normalizeEmail(email), signInContinueSettings())
    } catch (error) {
      if (!SILENT_RESET_CODES.has(error?.code)) {
        throw error
      }
    }
  })
}

/** `verifyBeforeUpdateEmail`: the Auth email changes when the link is opened. */
export function requestEmailChange(user, newEmail) {
  return guarded(() =>
    verifyBeforeUpdateEmail(user, normalizeEmail(newEmail), signInContinueSettings()),
  )
}

/**
 * Proves the signed-in user's password again (re-authentication), which Auth asks for before a
 * password change. The credential is built from this user's own Auth email, so only the account
 * the user object holds can be re-authenticated; a wrong password rejects 'invalid-credentials'.
 * The uid does not change, so no sign-in event reaches the auth listener.
 */
export function reauthenticate(user, currentPassword) {
  return guarded(async () => {
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, currentPassword),
    )
  })
}

/**
 * Sets a new password on the signed-in user. Auth answers with fresh tokens for this browser, so
 * the session here continues; the uid does not change, so no sign-in event fires.
 */
export function updatePassword(user, newPassword) {
  return guarded(() => firebaseUpdatePassword(user, newPassword))
}

/** Refreshes `emailVerified` and `email` from the server; the same User object is updated in place. */
export function reloadUser(user) {
  return guarded(async () => {
    await user.reload()
    return user
  })
}

/**
 * The user's ID token. With `force` it asks Auth for a new one, so the token carries the current
 * email and email_verified claims the rules read; roles are not claims (they live in users/{uid}).
 */
export function getIdToken(user, force = false) {
  return guarded(() => user.getIdToken(force))
}

export function currentUser() {
  return firebaseAuth.currentUser
}

/** The single auth subscription; returns the SDK's unsubscribe function. */
export function onAuthChanged(callback) {
  return onAuthStateChanged(firebaseAuth, callback)
}
