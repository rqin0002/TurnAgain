/**
 * The one error the auth repository and the auth store throw. The code
 * is the only channel to the views; the message is user-facing copy chosen here, never a Firebase
 * string (the SDK ships `Firebase: Error (auth/<code>).`). `account-disabled` is a
 * `logout(reason)` value and a `?reason=` query, not a code.
 */

import { GENERIC_FAILURE } from '@/shared/domain/errorCopy.js'

import { PASSWORD_MIN_LENGTH } from '../domain/authValidation.js'

export const AUTH_ERROR_CODES = Object.freeze([
  'invalid-credentials',
  'email-unverified',
  'email-already-in-use',
  'weak-password',
  'invalid-email',
  'too-many-requests',
  'requires-recent-login',
  'network',
  'offline',
  'profile-unavailable',
  'unknown',
])

const MESSAGES = Object.freeze({
  'invalid-credentials': 'Email or password is incorrect.',
  'email-unverified':
    'Verify your email address before signing in. We have sent the verification email again: open the link in it, then sign in. Check your spam folder if it does not arrive.',
  'email-already-in-use':
    'An account already exists for this email address. Sign in, or reset your password from the sign-in page.',
  'weak-password': `Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.`,
  'invalid-email': 'Enter a valid email address.',
  'too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'requires-recent-login':
    'This change needs a recent sign-in. Sign out, sign in again, then retry.',
  network: 'The service could not be reached. Check your connection and try again.',
  offline: 'You appear to be offline. Check your connection and try again.',
  'profile-unavailable': "Couldn't load your account. Try again in a moment.",
  unknown: GENERIC_FAILURE,
})

/**
 * Firebase Auth codes to public codes. Wrong password, unknown user and the
 * enumeration-protected `invalid-credential` are one user-facing case; a disabled user signing
 * in is told the same (non-disclosing), the store detects a disabled *session* through
 * `endedSessionReason` instead.
 */
const FIREBASE_CODES = Object.freeze({
  'auth/invalid-credential': 'invalid-credentials',
  'auth/invalid-login-credentials': 'invalid-credentials',
  'auth/user-not-found': 'invalid-credentials',
  'auth/wrong-password': 'invalid-credentials',
  'auth/user-disabled': 'invalid-credentials',
  'auth/email-already-in-use': 'email-already-in-use',
  'auth/weak-password': 'weak-password',
  'auth/invalid-email': 'invalid-email',
  'auth/missing-email': 'invalid-email',
  'auth/too-many-requests': 'too-many-requests',
  'auth/requires-recent-login': 'requires-recent-login',
})

export class AuthError extends Error {
  /**
   * @param {string} code - one of AUTH_ERROR_CODES; anything else collapses to 'unknown'
   * @param {{ cause?: unknown }} [options]
   */
  constructor(code, { cause } = {}) {
    const safeCode = AUTH_ERROR_CODES.includes(code) ? code : 'unknown'
    super(MESSAGES[safeCode])
    this.name = 'AuthError'
    this.code = safeCode
    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

export const isAuthError = (error) => error instanceof AuthError

// A hint only: the failed request decides, the flag picks the wording.
const isBrowserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** @param {unknown} error - anything rejected by the Firebase Auth SDK */
export function toAuthError(error) {
  if (isAuthError(error)) {
    return error
  }
  const code = String(error?.code ?? '')
  if (code === 'auth/network-request-failed') {
    return new AuthError(isBrowserOffline() ? 'offline' : 'network', { cause: error })
  }
  return new AuthError(FIREBASE_CODES[code] ?? 'unknown', { cause: error })
}

/**
 * Why the SDK ended a session on its own: a disabled Auth user or a
 * revoked refresh token makes `reload()` / `getIdToken(true)` reject and clears `currentUser`.
 *
 * @param {unknown} error - an AuthError (its cause is read) or the raw Firebase error
 * @returns {'account-disabled' | 'session-expired' | null}
 */
export function endedSessionReason(error) {
  const source = isAuthError(error) ? error.cause : error
  const code = String(source?.code ?? '')
  if (code === 'auth/user-disabled') {
    return 'account-disabled'
  }
  if (code === 'auth/user-token-expired') {
    return 'session-expired'
  }
  return null
}
