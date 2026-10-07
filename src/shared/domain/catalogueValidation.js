/**
 * Shared validation vocabulary for catalogue and profile records. Pure: no imports.
 * The schema modules in each feature compose these into record validators; the seed imports
 * them in Node through the customization hooks.
 */

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
export const POSTCODE_PATTERN = /^\d{4}$/u
export const ROLES = Object.freeze(['member', 'staff', 'admin'])

export const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isValidId = (value) => typeof value === 'string' && ID_PATTERN.test(value)

export const isBoundedString = (value, maximum = 500) =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum

export const isNullableBoundedString = (value, maximum = 500) =>
  value === null || isBoundedString(value, maximum)

export const isStringList = (
  value,
  { minimumEntries = 1, maximumEntries = 50, maximumLength = 100 } = {},
) =>
  Array.isArray(value) &&
  value.length >= minimumEntries &&
  value.length <= maximumEntries &&
  value.every((entry) => isBoundedString(entry, maximumLength))

/**
 * Every required key present, no key outside the allowed set.
 * @param {object} value
 * @param {Set<string>} required
 * @param {Set<string>} [allowed=required]
 */
export const hasExactKeys = (value, required, allowed = required) => {
  if (!isPlainObject(value)) return false
  const keys = Object.keys(value)
  return (
    [...required].every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key))
  )
}

/**
 * Checks a date-only catalogue field without accepting JavaScript's automatic
 * rollover (for example, 31 February becoming a day in March).
 *
 * @param {unknown} value - Untrusted YYYY-MM-DD source date.
 * @returns {boolean}
 */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * Accepts bounded HTTPS source/provider links without embedded credentials.
 * This validates link shape, not the provider's identity or destination content.
 *
 * @param {unknown} value - Untrusted catalogue URL.
 * @returns {boolean}
 */
export function isHttpsUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

/** Lower-cases and trims an email for comparison with the Auth token email. */
export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-AU') : ''
}

/** A Firestore Timestamp (any object with toDate) as an ISO string, else null. Duck-typed on purpose. */
export const toIsoTimestamp = (value) => {
  if (typeof value?.toDate !== 'function') {
    return null
  }

  const date = value.toDate()
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}
