import { compareByName } from '@/shared/domain/tableQuery.js'

import { describeRatingSummary } from './ratingPresentation.js'

const validSummary = (summary) =>
  describeRatingSummary(summary) !== null && summary.ratingCount <= 1000000

/**
 * Orders services by rating for display: services with at least one rating first (higher exact
 * average first, then more ratings, then name), then services with zero ratings, then services
 * whose summary is missing or invalid (both by name). Averages are compared by cross-multiplying
 * sum and count, so two averages that round to the same displayed value still sort exactly.
 */
export function sortServicesByRating(services, summariesById = {}) {
  return [...services].sort((left, right) => {
    const a = summariesById[left.id]
    const b = summariesById[right.id]
    const aGroup = validSummary(a) ? (a.ratingCount > 0 ? 0 : 1) : 2
    const bGroup = validSummary(b) ? (b.ratingCount > 0 ? 0 : 1) : 2
    if (aGroup !== bGroup) return aGroup - bGroup
    if (aGroup === 0) {
      return (
        b.ratingSum * a.ratingCount - a.ratingSum * b.ratingCount ||
        b.ratingCount - a.ratingCount ||
        compareByName(left, right)
      )
    }
    return compareByName(left, right)
  })
}

/** The first "limit" (at most 5) services that have at least one rating, in that order. */
export function rankRatedServices(services, summariesById = {}, { limit = 5 } = {}) {
  return sortServicesByRating(services, summariesById)
    .filter(
      (service) =>
        validSummary(summariesById[service.id]) && summariesById[service.id].ratingCount > 0,
    )
    .slice(0, Math.max(0, Math.min(5, limit)))
}

/**
 * Turns a stored rating-summary document into the summary the app shows, or null when it cannot
 * be trusted. It needs exactly the keys ratingCount, ratingSum, histogram and updatedAt: a count
 * from 0 to 1,000,000, a non-negative sum, five non-negative bucket counts (one star first) that
 * add up to the count and to the sum, and an updatedAt that converts to a time. The result adds
 * averageRating (null with no ratings) and keys the histogram by score. Both rating repositories
 * use it, so the public pages and the ranking agree on what a valid summary is.
 */
export function projectRatingSummary(candidate) {
  const keys = ['ratingCount', 'ratingSum', 'histogram', 'updatedAt']
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    Object.keys(candidate).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(candidate, key)) ||
    !Number.isInteger(candidate.ratingCount) ||
    candidate.ratingCount < 0 ||
    candidate.ratingCount > 1000000 ||
    !Number.isInteger(candidate.ratingSum) ||
    candidate.ratingSum < 0 ||
    !Array.isArray(candidate.histogram) ||
    candidate.histogram.length !== 5 ||
    !candidate.histogram.every((count) => Number.isInteger(count) && count >= 0)
  )
    return null
  let timestamp
  try {
    timestamp = candidate.updatedAt?.toMillis?.()
  } catch {
    return null
  }
  if (!Number.isFinite(timestamp)) return null
  const summary = {
    ratingCount: candidate.ratingCount,
    ratingSum: candidate.ratingSum,
    averageRating: candidate.ratingCount ? candidate.ratingSum / candidate.ratingCount : null,
    histogram: Object.fromEntries(candidate.histogram.map((count, index) => [index + 1, count])),
  }
  return validSummary(summary) ? summary : null
}
