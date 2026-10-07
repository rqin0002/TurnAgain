/**
 * "5 minutes ago", "yesterday", "2 weeks ago": the relative age of a cached copy for the
 * "Showing results saved {relative time}" line. Under a minute reads "just now"; a
 * saved time in the future (a clock that moved) also reads "just now" rather than "in 3 minutes".
 */

const LOCALE = 'en-AU'
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * @param {Date | string | number} value the saved time
 * @param {{ now?: Date | string | number }} [options] the reference time, for tests and tickers
 * @returns {string} '' for an unreadable value
 */
export function formatRelativeTime(value, { now = new Date() } = {}) {
  const date = toDate(value)
  const reference = toDate(now)
  if (!date || !reference) {
    return ''
  }
  const seconds = Math.max(0, Math.round((reference.getTime() - date.getTime()) / 1000))
  if (seconds < MINUTE) {
    return 'just now'
  }
  const format = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
  if (seconds < HOUR) {
    return format.format(-Math.floor(seconds / MINUTE), 'minute')
  }
  if (seconds < DAY) {
    return format.format(-Math.floor(seconds / HOUR), 'hour')
  }
  if (seconds < WEEK) {
    return format.format(-Math.floor(seconds / DAY), 'day')
  }
  return format.format(-Math.floor(seconds / WEEK), 'week')
}
