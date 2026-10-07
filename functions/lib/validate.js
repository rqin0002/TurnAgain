import { HttpsError } from 'firebase-functions/v2/https'

/**
 * Input checks for the callables. Each assertion returns the value or
 * throws `invalid-argument` with `details.fields` naming the field and one reason: 'required'
 * (undefined, null or the empty string) or 'invalid' (present but malformed). The client maps the
 * code and the fields, never the message.
 */

// The document-id rule of src/shared/domain/catalogueValidation.js and the rules' isValidId; the
// functions cannot import src/ (boundaries/functions-no-src), so the pattern is restated here.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export function invalidArgument(fields) {
  return new HttpsError('invalid-argument', 'Check the highlighted fields.', { fields })
}

const isMissing = (value) => value === undefined || value === null || value === ''

function fail(field, reason) {
  throw invalidArgument({ [field]: reason })
}

/** A plain object's own data, or {} for anything else (a callable's `request.data` may be any JSON). */
export function requestData(request) {
  const data = request?.data
  return data !== null && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

export function assertId(value, field) {
  if (isMissing(value)) fail(field, 'required')
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail(field, 'invalid')
  return value
}

export function assertEnum(value, allowed, field) {
  if (isMissing(value)) fail(field, 'required')
  if (!allowed.includes(value)) fail(field, 'invalid')
  return value
}

/**
 * An optional flag that is absent (undefined or null) reads as false; anything else not boolean,
 * the empty string included, is invalid.
 */
export function assertBoolean(value, field, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return false
  if (!optional && isMissing(value)) fail(field, 'required')
  if (typeof value !== 'boolean') fail(field, 'invalid')
  return value
}

/**
 * A UUID version 4 (crypto.randomUUID() on the client), in either letter case, returned in lower
 * case so case variants name one operation.
 */
export function assertUuid(value, field) {
  if (isMissing(value)) fail(field, 'required')
  if (typeof value !== 'string' || !UUID_V4.test(value)) fail(field, 'invalid')
  return value.toLowerCase()
}

/**
 * A whole number from 0 (`expectedRevision`: a legacy profile without `revision` sends
 * 0, as the rules read `get('revision', 0)`). Text, fractions and unsafe integers are invalid.
 */
export function assertNonNegativeInt(value, field) {
  if (isMissing(value)) fail(field, 'required')
  if (!Number.isSafeInteger(value) || value < 0) fail(field, 'invalid')
  return value
}
