const ITEM_MIN_LENGTH = 2
const ITEM_MAX_LENGTH = 50
const LOCATION_MAX_LENGTH = 60

const ITEM_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s&'’.,()+/-]*$/u
const LOCATION_PATTERN = /^[\p{L}\p{N}\s,'’.-]+$/u

function normalizeField(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : ''
}

/**
 * Produces display- and URL-ready search values. It trims and collapses whitespace
 * while deliberately preserving the user's casing and punctuation.
 *
 * @param {{ item?: unknown, location?: unknown }} [input={}] Raw form values.
 * @returns {{ item: string, location: string }} Normalized string values.
 */
export function normalizeSearchInput(input = {}) {
  return {
    item: normalizeField(input.item),
    location: normalizeField(input.location),
  }
}

function isVictorianPostcode(value) {
  const postcode = Number(value)

  // This is a plausibility gate, not address verification. Victoria uses both
  // the 3000–3999 and 8000–8999 postcode bands.
  return (postcode >= 3000 && postcode <= 3999) || (postcode >= 8000 && postcode <= 8999)
}

function hasPlausibleSuburbName(value) {
  const withoutRegion = value.replace(/\bVIC(?:TORIA)?\b/giu, '')
  const letters = withoutRegion.match(/\p{L}/gu) ?? []

  return letters.length >= 2
}

/**
 * Accepts a suburb name, exactly one Victorian four-digit postcode, or both.
 * The optional VIC/Victoria label does not count as the suburb-name evidence.
 */
function isPlausibleVictorianLocation(location) {
  if (!LOCATION_PATTERN.test(location)) {
    return false
  }

  const numberGroups = location.match(/\d+/gu) ?? []

  if (numberGroups.length === 0) {
    return hasPlausibleSuburbName(location)
  }

  if (numberGroups.length !== 1 || numberGroups[0].length !== 4) {
    return false
  }

  const postcode = numberGroups[0]
  if (!isVictorianPostcode(postcode)) {
    return false
  }

  const textWithoutPostcode = location.replace(postcode, '').replace(/\bVIC(?:TORIA)?\b/giu, '')

  return !/\p{L}/u.test(textWithoutPostcode) || hasPlausibleSuburbName(textWithoutPostcode)
}

/**
 * Validates normalized discovery criteria without mutating the supplied input.
 * Both fields are optional: blank criteria browse the complete catalogue, while
 * every non-empty field keeps its normal format checks. Empty error strings keep
 * a stable form-binding shape.
 *
 * @param {{ item?: unknown, location?: unknown }} [input={}] Raw form values.
 * @returns {{
 *   isValid: boolean,
 *   values: { item: string, location: string },
 *   errors: { item: string, location: string }
 * }} Validation state and normalized values.
 */
export function validateSearchInput(input = {}) {
  const values = normalizeSearchInput(input)
  const errors = { item: '', location: '' }

  if (values.item && values.item.length < ITEM_MIN_LENGTH) {
    errors.item = 'Item must be at least 2 characters.'
  } else if (values.item.length > ITEM_MAX_LENGTH) {
    errors.item = 'Item must be 50 characters or fewer.'
  } else if (values.item && !ITEM_PATTERN.test(values.item)) {
    errors.item = 'Use letters, numbers, spaces, and ordinary item-name punctuation only.'
  }

  if (values.location.length > LOCATION_MAX_LENGTH) {
    errors.location = 'Location must be 60 characters or fewer.'
  } else if (values.location && !isPlausibleVictorianLocation(values.location)) {
    errors.location = 'Enter a Victorian suburb and/or four-digit postcode.'
  }

  return {
    isValid: Object.values(errors).every((message) => !message),
    values,
    errors,
  }
}
