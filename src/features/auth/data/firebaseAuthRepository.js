import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  verifyBeforeUpdateEmail,
} from 'firebase/auth'

import { firebaseAuth, getCleanupAuth } from '@/firebase/firebaseAuthClient.js'
import { normalizeEmail } from '@/shared/domain/catalogueValidation.js'

import { toAuthError } from './AuthError.js'

/**
 * Plain wrappers over Firebase Auth (spec 9.2, decision M6): one function per SDK call, every
 * rejection mapped to AuthError, no profile logic (that is userRepository.js and the store),
 * no factory.
 */

/**
 * A reset request never reveals whether an account exists: the emulator rejects an unknown
 * address (facts.md 1f) while production resolves, so both answer the same way here.
 */
const SILENT_RESET_CODES = new Set([
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/invalid-credential',
])

/**
 * Verification links return to the sign-in page with `?verified=1` (spec 9.2). The origin is the
 * running site's: localhost and the emulator are authorised by default; `turnagain.pages.dev` is
 * added to the Auth authorised domains when Pages exists (docs/DEPLOYMENT.md, spec 12.3). When the
 * registration had one, the link also carries its already-resolved `redirect` (spec 7.4).
 */
const continueSettings = (redirect = null) => {
  if (typeof window === 'undefined') return undefined
  const signInUrl = `${window.location.origin}/login?verified=1`
  return { url: redirect ? `${signInUrl}&redirect=${encodeURIComponent(redirect)}` : signInUrl }
}

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
 * Creates the account and folds `updateProfile` (spec 9.1); the SDK signs the new user in. When
 * the name cannot be stored the registration fails as a whole: the nameless account is signed
 * out and removed (removeNamelessAccount) so its profile is never created as 'Member', and the
 * caller sees the name failure's code whether or not the removal succeeds.
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
      await sendPasswordResetEmail(firebaseAuth, normalizeEmail(email))
    } catch (error) {
      if (!SILENT_RESET_CODES.has(error?.code)) {
        throw error
      }
    }
  })
}

/** `verifyBeforeUpdateEmail` (spec 9.4): the Auth email changes when the link is opened. */
export function requestEmailChange(user, newEmail) {
  return guarded(() => verifyBeforeUpdateEmail(user, normalizeEmail(newEmail)))
}

/** Refreshes `emailVerified` and `email` from the server; the same User object is updated in place. */
export function reloadUser(user) {
  return guarded(async () => {
    await user.reload()
    return user
  })
}

/** `force` refreshes the ID token so the rules see new claims (facts.md 2.1). */
export function getIdToken(user, force = false) {
  return guarded(() => user.getIdToken(force))
}

export function currentUser() {
  return firebaseAuth.currentUser
}

/** The single auth subscription (spec 9.1); returns the SDK's unsubscribe function. */
export function onAuthChanged(callback) {
  return onAuthStateChanged(firebaseAuth, callback)
}
