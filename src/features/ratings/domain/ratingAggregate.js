const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u

const createHistogram = () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })

const isArray = (value) => {
  try {
    return Array.isArray(value)
  } catch {
    return false
  }
}

/**
 * Derives a service's rating summary from its active persisted rating records.
 * The average retains full numeric precision; presentation code owns rounding.
 *
 * @param {string} serviceId - Firestore-safe service identifier.
 * @param {ReadonlyArray<object>} ratings - Persisted rating records.
 * @returns {{
 *   ratingCount: number,
 *   ratingSum: number,
 *   averageRating: number | null,
 *   histogram: { 1: number, 2: number, 3: number, 4: number, 5: number }
 * }} A newly derived summary with five score buckets.
 * @throws {TypeError} When the service identifier or rating collection is invalid.
 * @throws {RangeError} When a matching active record has an invalid score.
 */
export function calculateRatingSummary(serviceId, ratings) {
  if (typeof serviceId !== 'string' || !ID_PATTERN.test(serviceId)) {
    throw new TypeError('A valid service identifier is required.')
  }
  if (!isArray(ratings)) {
    throw new TypeError('Ratings must be provided as an array.')
  }

  const histogram = createHistogram()
  let ratingCount = 0
  let ratingSum = 0

  for (const rating of ratings) {
    if (rating?.serviceId !== serviceId || rating.status !== 'active') {
      continue
    }
    if (!Number.isInteger(rating.score) || rating.score < 1 || rating.score > 5) {
      throw new RangeError('Active rating scores must be integers from 1 to 5.')
    }

    ratingCount += 1
    ratingSum += rating.score
    histogram[rating.score] += 1
  }

  return {
    ratingCount,
    ratingSum,
    averageRating: ratingCount === 0 ? null : ratingSum / ratingCount,
    histogram,
  }
}
