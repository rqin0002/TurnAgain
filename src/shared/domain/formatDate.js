/**
 * Date and time formatting for Melbourne (spec 7.2). The Melbourne instant formatters live in
 * functions/shared/melbourneTime.js so the SPA, the email functions and the seed share one
 * implementation (decision M5-D8); this module keeps the SPA's import path and its export names,
 * and adds the calendar-date formatter, which formats a date without a time zone.
 */

import { MELBOURNE_LOCALE } from '@shared/melbourneTime.js'

import { isCalendarDate } from './catalogueValidation.js'

export { formatDate, formatTime, formatTimeRange } from '@shared/melbourneTime.js'

/**
 * A date-only field ("2026-08-22") as "22 Aug 2026", or "22 August 2026" with `month: 'long'`.
 * Formatted in UTC on purpose: a calendar date has no time zone, and local-midnight parsing
 * would shift it on some machines.
 * Source text that is not a calendar date is returned as written; `isCalendarDate` is the one
 * definition of "calendar date" in this layer, so "2026-02-30" stays text rather than rolling
 * into March.
 */
export function formatCalendarDate(value, { month = 'short' } = {}) {
  if (typeof value !== 'string') {
    return ''
  }
  if (!isCalendarDate(value)) {
    return value
  }
  return new Intl.DateTimeFormat(MELBOURNE_LOCALE, {
    day: 'numeric',
    month,
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}
