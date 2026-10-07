import { compareByName } from '@/shared/domain/tableQuery.js'

import { describeRatingSummary } from './ratingPresentation.js'

const validSummary = (summary) =>
  describeRatingSummary(summary) !== null && summary.ratingCount <= 1000000

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

export function rankRatedServices(services, summariesById = {}, { limit = 5 } = {}) {
  return sortServicesByRating(services, summariesById)
    .filter(
      (service) =>
        validSummary(summariesById[service.id]) && summariesById[service.id].ratingCount > 0,
    )
    .slice(0, Math.max(0, Math.min(5, limit)))
}

/** Strict public aggregate boundary, shared by discovery and individual ratings. */
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
