const AUTH_ERROR_MESSAGES = Object.freeze({
  'email-in-use':
    'An account already exists for this email address. If you forgot your password, reset it from Sign in.',
  'invalid-credentials': 'Email or password is incorrect.',
  'email-unverified':
    'Please verify your email address before signing in. A new verification email has been sent. Open the link in your email. Check your spam folder if needed.',
  'verification-unavailable':
    'Please verify your email address before signing in.',
  'invalid-input': 'The authentication input is invalid.',
  'recovery-unavailable': 'Password recovery is temporarily unavailable. Try again later.',
  'registration-incomplete':
    'Your account exists, but registration could not finish. Try registering again with your original password, or sign in to continue.',
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
