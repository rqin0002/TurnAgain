const AUTH_ERROR_MESSAGES = Object.freeze({
  'email-in-use':
    'An account already exists for this email address. Sign in or reset your password.',
  'invalid-credentials': 'Email or password is incorrect.',
  'email-unverified':
    'Please verify your email address before signing in. We have sent a new verification email. Check your inbox and spam folder.',
  'verification-unavailable':
    'Your email address is not verified. We could not send a verification email. Check your inbox for an earlier email, or try signing in again later.',
  'invalid-input': 'The authentication input is invalid.',
  'recovery-unavailable': 'Password recovery is temporarily unavailable. Try again later.',
  'registration-incomplete':
    'Your account was created, but setup could not finish. Sign in to complete setup.',
  'session-expired': 'Your session has expired. Sign in again.',
  unexpected: 'Authentication is temporarily unavailable.',
})

/**
 * Authentication failure with a stable, non-sensitive public code and message.
 * Unsupported provider errors collapse to a generic message so implementation details cannot escape.
 */
export class AuthError extends Error {
  /**
   * @param {string} code - One of the supported public authentication error codes.
   */
  constructor(code) {
    const safeCode = Object.hasOwn(AUTH_ERROR_MESSAGES, code) ? code : 'unexpected'
    super(AUTH_ERROR_MESSAGES[safeCode])
    this.name = 'AuthError'
    this.code = safeCode
  }
}
