const REVIEW_MAX_LENGTH = 1000
const RATING_INPUT_KEYS = new Set(['reviewText', 'score'])

const createInvalidInputResult = () => ({
  isValid: false,
  values: { score: null, reviewText: null },
  errors: { score: 'Choose a rating from 1 to 5.', reviewText: '' },
})

const snapshotInput = (input) => {
  try {
    if (typeof input !== 'object' || input === null) {
      return null
    }

    const prototype = Reflect.getPrototypeOf(input)
    if (prototype !== Object.prototype && prototype !== null) {
      return null
    }

    const keys = Reflect.ownKeys(input)
    if (keys.some((key) => typeof key !== 'string' || !RATING_INPUT_KEYS.has(key))) {
      return null
    }

    const snapshot = {}
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key)
      // Data descriptors snapshot values without invoking caller-controlled accessors.
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
        return null
      }
      snapshot[key] = descriptor.value
    }
    return snapshot
  } catch {
    return null
  }
}

const codePointLength = (value) => Array.from(value).length

const normalizeReview = (value) => value.trim().replace(/\s+/gu, ' ')

const hasUnsupportedControlCharacter = (value) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return (
      codePoint <= 8 ||
      (codePoint >= 11 && codePoint <= 12) ||
      (codePoint >= 14 && codePoint <= 31) ||
      (codePoint >= 127 && codePoint <= 159)
    )
  })

/**
 * Validates a score and optional plain-text review without accepting identity or role data.
 * Blank reviews normalize to `null`; markup-like characters remain literal text for escaped UI rendering.
 *
 * Only an ordinary or null-prototype record with own data properties is accepted;
 * accessors, inherited values, extra keys, Symbols, and failing Proxy traps are rejected.
 *
 * @param {unknown} [input] Raw rating form fields.
 * @returns {{
 *   isValid: boolean,
 *   values: { score: number | null, reviewText: string | null },
 *   errors: { score: string, reviewText: string }
 * }} Stable normalized values and field errors.
 */
export function validateRatingInput(input) {
  const fields = snapshotInput(input)
  if (fields === null) {
    return createInvalidInputResult()
  }

  const score = typeof fields.score === 'number' ? fields.score : null
  const errors = { score: '', reviewText: '' }
  let reviewText = null

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    errors.score = 'Choose a rating from 1 to 5.'
  }

  if (fields.reviewText !== undefined && fields.reviewText !== null) {
    if (typeof fields.reviewText !== 'string') {
      errors.reviewText = 'Review must be plain text.'
    } else if (hasUnsupportedControlCharacter(fields.reviewText)) {
      errors.reviewText = 'Review contains unsupported control characters.'
    } else {
      reviewText = normalizeReview(fields.reviewText) || null
      if (reviewText !== null && codePointLength(reviewText) > REVIEW_MAX_LENGTH) {
        errors.reviewText = 'Review must be 1,000 characters or fewer.'
      }
    }
  }

  return {
    isValid: Object.values(errors).every((message) => !message),
    values: { score, reviewText },
    errors,
  }
}
