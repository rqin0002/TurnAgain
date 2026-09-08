export const RATING_SCALE = Object.freeze([
  {
    score: 1,
    label: 'Very poor',
    description: 'The experience fell far short of what you needed.',
  },
  {
    score: 2,
    label: 'Poor',
    description: 'Several parts of the experience could have been better.',
  },
  {
    score: 3,
    label: 'Okay',
    description: 'The experience was mixed or met only some of your needs.',
  },
  { score: 4, label: 'Good', description: 'The experience met most of your needs.' },
  { score: 5, label: 'Excellent', description: 'The experience worked very well for you.' },
])

/** Present exact aggregate counts without inventing reviews or a confidence score. */
export function describeRatingSummary(summary) {
  const count = summary?.ratingCount
  const counts = [1, 2, 3, 4, 5].map((score) => summary?.histogram?.[score])
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !counts.every((value) => Number.isSafeInteger(value) && value >= 0) ||
    counts.reduce((total, value) => total + value, 0) !== count
  ) {
    return null
  }

  const sum = counts.reduce((total, value, index) => total + value * (index + 1), 0)
  // The repository validates the same relationship. Fail closed if an adapter
  // ever supplies contradictory totals; an unavailable summary is not a zero.
  if (summary.ratingSum !== sum) return null

  return {
    count,
    average: count ? (sum / count).toFixed(1) : null,
    highCount: counts[3] + counts[4],
    rows: [5, 4, 3, 2, 1].map((score) => {
      const bucketCount = counts[score - 1]
      const percentage = count ? (bucketCount / count) * 100 : 0
      return {
        score,
        count: bucketCount,
        percentage,
        percentageLabel:
          percentage > 0 && percentage < 1 ? 'less than 1%' : `${Math.round(percentage)}%`,
      }
    }),
  }
}
