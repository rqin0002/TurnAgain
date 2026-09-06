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
