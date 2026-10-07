/**
 * Melbourne time: one time zone, one locale, Intl only, no library.
 * Pure on purpose: the SPA imports it through `@shared/melbourneTime.js` (via
 * src/shared/domain/formatDate.js), the email functions import it relatively, and nothing here
 * reads the machine's TZ. Values are ISO strings or Date objects; invalid input renders an
 * "unavailable" label rather than throwing, so a malformed record never blanks a page or an email.
 */

export const MELBOURNE_TIME_ZONE = 'Australia/Melbourne'
export const MELBOURNE_LOCALE = 'en-AU'
export const MELBOURNE_TIME_LABEL = 'Melbourne time'

const HOUR_MS = 3_600_000
// Melbourne is UTC+11 in daylight time (AEDT) and UTC+10 otherwise (AEST); the clocks change at
// 02:00/03:00 local, so a Melbourne midnight is always one of these two offsets from UTC midnight.
const MELBOURNE_OFFSET_HOURS = [11, 10]

/** A valid Date for a Date or a non-empty ISO string; null for anything else. */
export function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value !== 'string' || value === '') {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "Wednesday, 30 September 2026" (dateStyle full) or the shorter Intl styles. */
export function formatDate(value, { dateStyle = 'full' } = {}) {
  const date = toDate(value)
  if (!date) {
    return 'Date unavailable'
  }
  return new Intl.DateTimeFormat(MELBOURNE_LOCALE, {
    dateStyle,
    timeZone: MELBOURNE_TIME_ZONE,
  }).format(date)
}

/** "10:00 am" in Melbourne time. */
export function formatTime(value) {
  const date = toDate(value)
  if (!date) {
    return 'Time unavailable'
  }
  return new Intl.DateTimeFormat(MELBOURNE_LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: MELBOURNE_TIME_ZONE,
  }).format(date)
}

/** "10:00 am–1:00 pm"; either bound invalid renders the unavailable label. */
export function formatTimeRange(startsAt, endsAt) {
  const starts = toDate(startsAt)
  const ends = toDate(endsAt)
  if (!starts || !ends) {
    return 'Time unavailable'
  }
  return `${formatTime(starts)}–${formatTime(ends)}`
}

/** "Saturday, 10 October 2026, 10:00 am–12:00 pm (Melbourne time)": the session line. */
export function formatSessionWhen(startsAt, endsAt) {
  return `${formatDate(startsAt)}, ${formatTimeRange(startsAt, endsAt)} (${MELBOURNE_TIME_LABEL})`
}

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: MELBOURNE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The Melbourne calendar day of an instant as 'YYYY-MM-DD', or null. */
export function melbourneDayKey(value) {
  const date = toDate(value)
  if (!date) {
    return null
  }
  const parts = Object.fromEntries(
    dayKeyFormat.formatToParts(date).map(({ type, value: part }) => [type, part]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * The first instant of the Melbourne calendar day after `now` (a Date or an ISO string). Days are
 * 23 or 25 hours long across the two daylight-saving changes, so the answer is searched, never
 * computed as `now + 24 h`.
 */
export function nextMelbourneMidnight(now) {
  const today = melbourneDayKey(now)
  if (!today) {
    throw new TypeError('nextMelbourneMidnight needs a valid Date or ISO string')
  }
  const [year, month, day] = today.split('-').map(Number)
  const nextDayUtc = Date.UTC(year, month - 1, day + 1)
  const tomorrow = new Date(nextDayUtc).toISOString().slice(0, 10)
  for (const offset of MELBOURNE_OFFSET_HOURS) {
    const candidate = new Date(nextDayUtc - offset * HOUR_MS)
    const before = new Date(candidate.getTime() - 1)
    if (melbourneDayKey(candidate) === tomorrow && melbourneDayKey(before) !== tomorrow) {
      return candidate
    }
  }
  throw new RangeError(`no Melbourne midnight found after ${today}`)
}
