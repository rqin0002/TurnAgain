/**
 * The one error the auth repository and the auth store throw. The code
 * is the only channel to the views; the message is user-facing copy chosen here, never a Firebase
 * string (the SDK ships `Firebase: Error (auth/<code>).`). `account-disabled` is a
 * `logout(reason)` value and a `?reason=` query, not a code. Of whatever the SDK rejected with,
 * only its Firebase code is kept (`cause.code`), so a failure can be diagnosed while the error
 * never carries the SDK's message, its custom data, a token or a link. The only address a message
 * ever names is the one its caller passes for an unverified sign-in: where the verification email
 * went.
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
  'continue-url-refused',
  'account-created-email-unsent',
  'verification-unsent',
  'verification-sent',
  'verification-recently-sent',
  'sign-in-timeout',
  'unknown',
])

/**
 * Public code -> user-facing copy. The three outcomes of an unverified sign-in are functions of the
 * address the verification email went to: 'email-unverified' (this attempt sent nothing, because
 * an email already went to that address), 'verification-sent' (this attempt sent one) and
 * 'verification-recently-sent' (Firebase refused another as too soon after the last, so the
 * last one is the email to open).
 */
const MESSAGES = Object.freeze({
  'invalid-credentials': 'Email or password is incorrect.',
  'email-unverified': (to) =>
    `Your email address is not verified yet. Open the link in the verification email already sent to ${to}, then sign in again. Check your junk mail if you cannot find it.`,
  'verification-sent': (to) =>
    `Your email address is not verified yet. We have sent a verification email to ${to}: open the link in it, then sign in again. Check your junk mail if it does not arrive.`,
  'verification-recently-sent': (to) =>
    `Your email address is not verified yet. A verification email was sent to ${to} a short time ago: open the link in that one, then sign in again. Check your junk mail if you cannot find it. You can ask for another in a few minutes.`,
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
  'continue-url-refused':
    "This web address is not yet allowed to send verification emails. The site's administrator needs to add it to the sign-in settings.",
  'account-created-email-unsent':
    'Your account was created, but the verification email could not be sent. Do not register again: sign in with this email address and password, and we will try to send it again.',
  'verification-unsent':
    'Your email address is not verified yet, and the verification email could not be sent.',
  'sign-in-timeout':
    'Signing in is taking longer than expected. Check your connection, then try signing in again.',
  unknown: GENERIC_FAILURE,
})

/**
 * The send failures a 'verification-unsent' message names in words after its own sentence. A send
 * refused as too soon after the last ('too-many-requests') is not one of them: it is the
 * 'verification-recently-sent' outcome, which points to the email already sent.
 */
const SEND_FAILURE_REASONS = new Set(['continue-url-refused', 'network', 'offline'])

/**
 * Messages that do not say in words which call failed. They end with the Firebase code, so a
 * screenshot of the page is enough to diagnose the failure.
 */
const CODE_SHOWN = new Set(['unknown', 'account-created-email-unsent', 'verification-unsent'])

// The only text ever printed after a message: a Firebase Auth code, nothing longer or stranger.
const FIREBASE_AUTH_CODE = /^auth\/[a-z0-9-]{1,64}$/

/**
 * Firebase Auth codes to public codes. Wrong password, unknown user and the
 * enumeration-protected `invalid-credential` are one user-facing case; a disabled user signing
 * in is told the same (non-disclosing), the store detects a disabled *session* through
 * `endedSessionReason` instead. A refused continue address (a verification link back to a host
 * that is not on the project's authorised domains) has its own copy. A re-authentication whose
 * credential is not the signed-in account (`user-mismatch`, which the SDK also answers for an
 * account deleted meanwhile) can only be put right by signing in again.
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
  'auth/user-mismatch': 'requires-recent-login',
  'auth/unauthorized-continue-uri': 'continue-url-refused',
  'auth/invalid-continue-uri': 'continue-url-refused',
})

/**
 * The part of a rejected value an AuthError keeps: its string `code` and nothing else. An
 * AuthError given as the cause hands on the code it kept itself.
 *
 * @param {unknown} error
 * @returns {Readonly<{ code: string }> | undefined}
 */
const keptCause = (error) => {
  const source = error?.name === 'AuthError' ? error.cause : error
  const code = source?.code
  return typeof code === 'string' && code !== '' ? Object.freeze({ code }) : undefined
}

/**
 * The address an unverified sign-in's message names: the given one, trimmed, or "your email
 * address" when none was given.
 *
 * @param {unknown} email
 * @returns {string}
 */
const addressee = (email) =>
  typeof email === 'string' && email.trim() !== '' ? email.trim() : 'your email address'

export class AuthError extends Error {
  /**
   * @param {string} code - one of AUTH_ERROR_CODES; anything else collapses to 'unknown'
   * @param {{ cause?: unknown, reason?: string, email?: string }} [options] - `cause`: what was
   *   rejected, of which only the Firebase code is kept; `reason`: the public code of a failed
   *   send, read by 'verification-unsent' only (any other code or reason is ignored); `email`:
   *   the address the verification email went to, which only the three unverified sign-in
   *   messages name (no other message and no property of the error holds it)
   */
  constructor(code, { cause, reason, email } = {}) {
    const safeCode = AUTH_ERROR_CODES.includes(code) ? code : 'unknown'
    const kept = keptCause(cause)
    const namedReason =
      safeCode === 'verification-unsent' && SEND_FAILURE_REASONS.has(reason) ? reason : null
    const copy = MESSAGES[safeCode]
    const parts = [typeof copy === 'function' ? copy(addressee(email)) : copy]
    if (namedReason !== null) {
      parts.push(MESSAGES[namedReason])
    }
    if (kept !== undefined && CODE_SHOWN.has(safeCode) && FIREBASE_AUTH_CODE.test(kept.code)) {
      parts.push(`Error code: ${kept.code}.`)
    }
    super(parts.join(' '))
    this.name = 'AuthError'
    this.code = safeCode
    if (kept !== undefined) {
      this.cause = kept
    }
    if (namedReason !== null) {
      this.reason = namedReason
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
 * @param {unknown} error - an AuthError (its kept cause code is read) or the raw Firebase error
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
