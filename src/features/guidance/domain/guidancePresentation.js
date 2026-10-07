import { formatCalendarDate } from '@/shared/domain/formatDate.js'

/**
 * Formats a guide source's check date for the Guides page and its topic cards, the one definition
 * both share so they cannot drift. The editorial guides spell the month out ("3 September 2026");
 * the service catalogue's dense cards and registers keep the short month.
 *
 * @param {string} value ISO calendar date (`YYYY-MM-DD`) or source text.
 * @returns {string}
 */
export function formatCheckedDate(value) {
  return formatCalendarDate(value, { month: 'long' })
}
