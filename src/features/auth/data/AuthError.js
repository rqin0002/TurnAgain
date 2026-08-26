const AUTH_ERROR_MESSAGES = Object.freeze({
  'crypto-unavailable': 'Password protection is unavailable.',
  'email-in-use': 'An account already exists for this email address.',
  'invalid-credentials': 'Email or password is incorrect.',
  'invalid-input': 'The authentication input is invalid.',
  'invalid-password-record': 'The saved password record is invalid.',
  'session-expired': 'Your session has expired. Sign in again.',
  'storage-corrupt': 'Saved account data is unavailable.',
  'storage-unavailable': 'Saved account data is unavailable.',
  unexpected: 'Authentication is temporarily unavailable.',
})

/**
 * Authentication failure with a stable, non-sensitive public code and message.
 * Unsupported caller text is collapsed so storage or crypto details cannot escape.
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
