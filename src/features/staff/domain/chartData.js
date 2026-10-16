import { compareText } from '@/shared/domain/tableQuery.js'
import { formatDate, formatTime } from '@/shared/domain/formatDate.js'

/**
 * The numbers behind the Overview's bookings rows and ratings chart. Pure, and never Chart.js:
 * each result is the labels, one value list per series and the same numbers as table rows, so
 * whatever draws them (HTML bars, a Chart.js canvas, its "View as table" alternative) can never
 * disagree, and a chart is never the only way to read a number. The rows also carry what the page
 * needs to name, link and measure each row (see each function).
 *
 * @typedef {{ labels: string[], series: Array<{ key: string, label: string, values: number[] }>, rows: Array<Record<string, string | number | null>> }} ChartData
 */

export const BOOKINGS_CHART_LIMIT = 8
const RATINGS_CHART_LIMIT = 8

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
 * The booked places as a whole percentage of the capacity, at most 100 (an over-booked session
 * fills its bar, and its words give the real numbers); null when the capacity is not a positive
 * whole number or the booked count is not a whole number, so nothing is divided by zero and no
 * NaN reaches the page. The waitlist is never part of it: a waiting member holds no place.
 */
const bookedPercent = (booked, capacity) =>
  Number.isSafeInteger(capacity) && capacity > 0 && Number.isSafeInteger(booked) && booked >= 0
    ? Math.min(100, Math.round((booked / capacity) * 100))
    : null

/**
 * The next eight TurnAgain sessions that take bookings (scheduled or full, not yet started),
 * soonest first: booked places, waitlist and capacity, a missing figure reading 0. Each label is
 * "<activity title>, <medium date>, <start time>" in Melbourne time. Each row adds the session
 * `id` (for its link), the `title` and the `when` that make up its label, and `bookedPercent`
 * (above). `total` counts every upcoming TurnAgain session, so the page can say how many of them
 * the eight rows show.
 *
 * @param {object[]} sessions - StaffSession records
 * @param {Map<string, { title: string }>} activitiesById
 * @param {Date} now
 * @returns {ChartData & { total: number }}
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
  const shown = upcoming.slice(0, BOOKINGS_CHART_LIMIT)
  const titles = shown.map(
    (session) => activitiesById?.get(session.activityId)?.title ?? 'Activity',
  )
  // The start time is part of the label: two sessions of one activity on one day would otherwise
  // read the same.
  const whens = shown.map(
    (session) =>
      `${formatDate(session.startsAt, { dateStyle: 'medium' })}, ${formatTime(session.startsAt)}`,
  )
  const chart = toChartData(
    shown.map((_, index) => `${titles[index]}, ${whens[index]}`),
    BOOKING_SERIES.map(({ key, label, of }) => ({
      key,
      label,
      values: shown.map((session) => of(session) ?? 0),
    })),
  )
  return {
    ...chart,
    rows: chart.rows.map((row, index) => ({
      ...row,
      id: shown[index].id,
      title: titles[index],
      when: whens[index],
      bookedPercent: bookedPercent(row.booked, shown[index].capacity),
    })),
    total: upcoming.length,
  }
}

const ratingCountOf = (summariesById, service) => summariesById?.[service.id]?.ratingCount ?? 0

/**
 * Up to eight rated published services, most ratings first (name order breaks a tie), as a
 * five-bucket histogram: a sample of the most-rated services, not a list of the best rated. The
 * summaries are the ratings feature's projections, whose `histogram` is keyed 1 to 5 and adds up
 * to `ratingCount`. Each row adds the service `id` and its `ratingCount`.
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
  const chart = toChartData(
    rated.map((service) => service.name),
    RATING_SERIES.map(({ key, label, score }) => ({
      key,
      label,
      values: rated.map((service) => summariesById[service.id].histogram?.[score] ?? 0),
    })),
  )
  return {
    ...chart,
    rows: chart.rows.map((row, index) => ({
      ...row,
      id: rated[index].id,
      ratingCount: ratingCountOf(summariesById, rated[index]),
    })),
  }
}

/**
 * Every rated service's summary added up, for the Overview's ratings line: `ratingCount`,
 * `ratingSum`, `averageRating` and `histogram` keyed 1-5, or null when nothing is rated yet. The
 * average is the total of the scores over the total number of ratings, so every rating counts
 * once; it is never an average of the per-service averages, and it covers every rating, with no
 * time window.
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

const ELLIPSIS = '…'

/**
 * A name on one line of at most `maxWidth` pixels, for a chart axis: the whole name when it fits,
 * otherwise the longest start of it that fits with "…" after it (a space left at the cut is
 * dropped). `measure` gives a text's width in pixels, so the cut follows the font actually drawn.
 * Characters are counted as code points, so no character is split in two. When not even one
 * character and the ellipsis fit, the result is "…" alone; a blank name is ''. Only the axis is
 * shortened: whoever calls this keeps the full name for the table and the tooltip.
 *
 * @param {string} text
 * @param {number} maxWidth
 * @param {(text: string) => number} measure
 * @returns {string}
 */
export function fitLabel(text, maxWidth, measure) {
  const name = String(text ?? '').trim()
  if (name === '' || measure(name) <= maxWidth) return name
  const characters = Array.from(name)
  const shortened = (length) => `${characters.slice(0, length).join('').trimEnd()}${ELLIPSIS}`
  // The widest start that fits, by halving: a longer start is never narrower than a shorter one.
  let low = 0
  let high = characters.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (measure(shortened(middle)) <= maxWidth) low = middle
    else high = middle - 1
  }
  return shortened(low)
}
