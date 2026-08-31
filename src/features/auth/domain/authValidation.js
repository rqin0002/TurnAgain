const DISPLAY_NAME_MIN_LENGTH = 2
const DISPLAY_NAME_MAX_LENGTH = 50
const EMAIL_MAX_LENGTH = 254
const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 128

const DISPLAY_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’.-]*$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

const normalizeText = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : ''

const normalizeEmail = (value) =>
  typeof value === 'string' ? value.trim().toLocaleLowerCase('en-AU') : ''

const stringLength = (value) => Array.from(value).length

const getInput = (input) =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? input : {}

const validateEmail = (email) => {
  if (!email) {
    return 'Enter your email address.'
  }
  if (stringLength(email) > EMAIL_MAX_LENGTH) {
    return 'Email address must be 254 characters or fewer.'
  }
  if (!EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address.'
  }
  return ''
}

/**
 * Validates registration fields while returning only normalized non-sensitive values.
 * Passwords are measured and compared exactly as supplied; they are never trimmed or returned.
 *
 * @param {unknown} [input={}] Raw registration form fields.
 * @returns {{
 *   isValid: boolean,
 *   values: { displayName: string, email: string },
 *   errors: {
 *     displayName: string,
 *     email: string,
 *     password: string,
 *     passwordConfirmation: string
 *   }
 * }} Stable validation state safe for UI state and diagnostics.
 */
export function validateRegistrationInput(input = {}) {
  const fields = getInput(input)
  const values = {
    displayName: normalizeText(fields.displayName),
    email: normalizeEmail(fields.email),
  }
  const password = typeof fields.password === 'string' ? fields.password : ''
  const passwordConfirmation =
    typeof fields.passwordConfirmation === 'string' ? fields.passwordConfirmation : ''
  const errors = {
    displayName: '',
    email: validateEmail(values.email),
    password: '',
    passwordConfirmation: '',
  }

  if (!values.displayName) {
    errors.displayName = 'Enter your display name.'
  } else if (stringLength(values.displayName) < DISPLAY_NAME_MIN_LENGTH) {
    errors.displayName = 'Display name must be at least 2 characters.'
  } else if (stringLength(values.displayName) > DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = 'Display name must be 50 characters or fewer.'
  } else if (!DISPLAY_NAME_PATTERN.test(values.displayName)) {
    errors.displayName = 'Use letters, spaces, apostrophes, full stops, and hyphens only.'
  }

  if (!password) {
    errors.password = 'Enter a password.'
  } else if (stringLength(password) < PASSWORD_MIN_LENGTH) {
    errors.password = 'Password must be at least 6 characters.'
  } else if (stringLength(password) > PASSWORD_MAX_LENGTH) {
    errors.password = 'Password must be 128 characters or fewer.'
  }

  if (!passwordConfirmation) {
    errors.passwordConfirmation = 'Confirm your password.'
  } else if (passwordConfirmation !== password) {
    errors.passwordConfirmation = 'Passwords must match exactly.'
  }

  return {
    isValid: Object.values(errors).every((message) => !message),
    values,
    errors,
  }
}

/**
 * Validates login fields while returning only the canonical email address.
 * The password is checked for presence exactly as supplied and is never returned.
 *
 * @param {unknown} [input={}] Raw login form fields.
 * @returns {{
 *   isValid: boolean,
 *   values: { email: string },
 *   errors: { email: string, password: string }
 * }} Stable validation state safe for UI state and diagnostics.
 */
export function validateLoginInput(input = {}) {
  const fields = getInput(input)
  const values = { email: normalizeEmail(fields.email) }
  const password = typeof fields.password === 'string' ? fields.password : ''
  const errors = {
    email: validateEmail(values.email),
    password: password ? '' : 'Enter a password.',
  }

  return {
    isValid: Object.values(errors).every((message) => !message),
    values,
    errors,
  }
}
