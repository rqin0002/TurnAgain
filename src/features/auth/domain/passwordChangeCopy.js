import { describeError } from '@/shared/domain/errorCopy.js'

/**
 * What the account page says when a password change fails. The shared auth messages are written
 * for the sign-in page ("Email or password is incorrect.", "Sign out, sign in again, then
 * retry."), so this module words the same error codes for a person who is already signed in and
 * started the change. Every line says what happened to the password: when Auth refused before
 * the update (wrong current password, an ended or changed sign-in, throttling, a refused new
 * password) it did not change; a lost connection or an unknown failure can come after the update
 * reached Auth, so those lines say the change could not be confirmed.
 *
 * @param {unknown} error - what the auth store's changePassword rejected with
 * @returns {string} the form summary's text
 */
export function describePasswordChangeFailure(error) {
  switch (error?.code) {
    case 'invalid-credentials':
      return 'Your password was not changed. The current password is not correct: check it and try again, or ask for a reset link below.'
    case 'requires-recent-login':
      return 'Your password was not changed. The sign-in on this page has ended or changed: sign in again, then retry.'
    case 'too-many-requests':
      return 'Your password was not changed. There have been too many attempts: wait a few minutes and try again.'
    case 'weak-password':
      return `Your password was not changed. ${describeError(error)}`
    default:
      return `We could not confirm that your password changed. ${describeError(error)}`
  }
}
