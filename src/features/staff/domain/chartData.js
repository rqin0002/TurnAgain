import { compareText } from '@/shared/domain/tableQuery.js'
import { formatDate, formatTime } from '@/shared/domain/formatDate.js'

/**
 * The numbers behind the Overview's two charts. Pure, and never Chart.js: each
 * result is the labels, one value list per series and the same numbers as table rows, so the
 * "View as table" alternative and the canvas can never disagree (charts are never the
 * only way to read a number).
 *
 * @typedef {{ labels: string[], series: Array<{ key: string, label: string, values: number[] }>, rows: Array<Record<string, string | number>> }} ChartData
 */

export const BOOKINGS_CHART_LIMIT = 8
export const RATINGS_CHART_LIMIT = 8

const BOOKING_SERIES = Object.freeze([
  Object.freeze({ key: 'booked', label: 'Booked', of: (session) => session.bookedCount }),
  Object.freeze({ key: 'waitlist', label: 'Waitlist', of: (session) => session.waitlistCount }),
  Object.freeze({ key: 'capacity', label: 'Capacity', of: (session) => session.capacity }),
])

const RATING_SERIES = Object.freeze(
  [1, 2, 3, 4, 5].map((score) =>
    Object.freeze({
      key: `stars${score}`,
      label: score === 1 ? '1 star' : `${score} stars`,
      score,
    }),
  ),
)

const toChartData = (labels, series) => ({
  labels,
  series: series.map(({ key, label, values }) => ({ key, label, values })),
  rows: labels.map((label, index) =>
    Object.fromEntries([
      ['label', label],
      ...series.map(({ key, values }) => [key, values[index]]),
    ]),
  ),
})

/**
 * The next eight TurnAgain sessions that take bookings: booked places, waitlist and capacity.
 * Each label is "<activity title>, <medium date>, <start time>" in Melbourne time.
 *
 * @param {object[]} sessions - StaffSession records
 * @param {Map<string, { title: string }>} activitiesById
 * @param {Date} now
 * @returns {ChartData}
 */
export function toBookingsChartData(sessions, activitiesById, now) {
  const upcoming = (sessions ?? [])
    .filter(
      (session) =>
        session.registrationType === 'turnagain' &&
        ['scheduled', 'full'].includes(session.status) &&
        Date.parse(session.startsAt) > now.getTime(),
    )
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
    .slice(0, BOOKINGS_CHART_LIMIT)
  // The start time is part of the label: two sessions of one activity on one day would otherwise
  // read the same on the canvas and in the table.
  const labels = upcoming.map(
    (session) =>
      `${activitiesById?.get(session.activityId)?.title ?? 'Activity'}, ${formatDate(session.startsAt, { dateStyle: 'medium' })}, ${formatTime(session.startsAt)}`,
  )
  return toChartData(
    labels,
    BOOKING_SERIES.map(({ key, label, of }) => ({
      key,
      label,
      values: upcoming.map((session) => of(session) ?? 0),
    })),
  )
}

const ratingCountOf = (summariesById, service) => summariesById?.[service.id]?.ratingCount ?? 0

/**
 * Up to eight rated published services, most ratings first, as a five-bucket histogram. The
 * summaries are the ratings feature's projections, whose `histogram` is keyed 1 to 5.
 *
 * @param {object[]} services
 * @param {Record<string, { ratingCount: number, histogram: Record<number, number> }>} summariesById
 * @returns {ChartData}
 */
export function toRatingsChartData(services, summariesById) {
  const rated = (services ?? [])
    .filter(
      (service) => service.status === 'published' && ratingCountOf(summariesById, service) > 0,
    )
    .sort(
      (left, right) =>
        ratingCountOf(summariesById, right) - ratingCountOf(summariesById, left) ||
        compareText(left.name, right.name),
    )
    .slice(0, RATINGS_CHART_LIMIT)
  return toChartData(
    rated.map((service) => service.name),
    RATING_SERIES.map(({ key, label, score }) => ({
      key,
      label,
      values: rated.map((service) => summariesById[service.id].histogram?.[score] ?? 0),
    })),
  )
}

/**
 * Every rated service's summary added up, for the "All rated services" tile: the projection
 * shape RatingSummary reads (`ratingCount`, `ratingSum`, `averageRating`, `histogram` keyed 1-5),
 * or null when nothing is rated yet.
 */
export function aggregateRatingSummaries(summariesById) {
  const summaries = Object.values(summariesById ?? {}).filter(
    (summary) => Number.isSafeInteger(summary?.ratingCount) && summary.ratingCount > 0,
  )
  if (summaries.length === 0) return null
  const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let ratingCount = 0
  let ratingSum = 0
  for (const summary of summaries) {
    ratingCount += summary.ratingCount
    ratingSum += summary.ratingSum
    for (const score of [1, 2, 3, 4, 5]) histogram[score] += summary.histogram?.[score] ?? 0
  }
  return { ratingCount, ratingSum, averageRating: ratingSum / ratingCount, histogram }
}
