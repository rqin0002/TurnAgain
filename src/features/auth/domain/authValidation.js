import { normalizeEmail } from '@/shared/domain/catalogueValidation.js'

/**
 * Pure validators for the auth forms. Passwords are measured exactly as typed and
 * never returned; every email is normalised once (`normalizeEmail` lives in shared/domain).
 * Display name 1–50, password 8–128. The display name is measured in UTF-16
 * code units (`length`), as the rules' `size()` and profileSchema measure it, so a name this
 * validator accepts is one createProfile can store.
 */

const DISPLAY_NAME_MAX_LENGTH = 50
const EMAIL_MAX_LENGTH = 254
export const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128

/** Shown under the password field before submit. */
export const PASSWORD_RULE = `At least ${PASSWORD_MIN_LENGTH} characters.`

const DISPLAY_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

const normalizeText = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : ''

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

const emailOnly = (input) => {
  const values = { email: normalizeEmail(getInput(input).email) }
  const errors = { email: validateEmail(values.email) }
  return { isValid: !errors.email, values, errors }
}

/**
 * @param {unknown} [input={}] Raw registration form fields.
 * @returns {{
 *   isValid: boolean,
 *   values: { displayName: string, email: string },
 *   errors: { displayName: string, email: string, password: string, passwordConfirmation: string }
 * }}
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
  } else if (values.displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = 'Display name must be 50 characters or fewer.'
  } else if (!DISPLAY_NAME_PATTERN.test(values.displayName)) {
    errors.displayName = 'Use letters, spaces, apostrophes, full stops, and hyphens only.'
  }

  if (!password) {
    errors.password = 'Enter a password.'
  } else if (stringLength(password) < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
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
 * @param {unknown} [input={}] Raw login form fields.
 * @returns {{ isValid: boolean, values: { email: string }, errors: { email: string, password: string } }}
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

/** Password recovery: only the normalised address leaves this boundary. */
export function validatePasswordResetInput(input = {}) {
  return emailOnly(input)
}

/** The change-email form of the account page. */
export function validateEmailChangeInput(input = {}) {
  return emailOnly(input)
}
