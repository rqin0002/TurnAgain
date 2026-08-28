// Defines the versioned contract and defensive limits for the local database snapshot. Any
// structural change that breaks compatibility should increment SCHEMA_VERSION and be paired
// with an explicit data migration.
const SCHEMA_VERSION = 1
const MAX_COLLECTION_RECORDS = 1000
const MAX_LIST_ENTRIES = 50
const MAX_GENERAL_STRING_LENGTH = 2048

// Restricts identifiers to characters that are safe to embed in Firestore-style document IDs
// and local composite identifiers. Forward slashes and whitespace are intentionally excluded
// to avoid path ambiguity.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const RATING_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,267}$/
const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CANONICAL_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STANDARD_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

// Public records are recursively inspected for keys that suggest credentials or other
// authentication material. This is an additional defence against accidentally exposing
// secrets in public collections.
const SENSITIVE_KEY_PATTERN = /password|hash|salt|token|secret|credential|private-key/iu

const SERVICE_ACTIONS = ['repair', 'reuse', 'recycle']
const SERVICE_STATUSES = ['published', 'archived']
const PROFILE_ROLES = ['member', 'staff', 'admin']
const PROFILE_STATUSES = ['active', 'disabled']
const PROFILE_DATA_CLASSES = ['local-demo', 'registered-local']
const RATING_STATUSES = ['active', 'removed']

// Key allowlists make the schema strict: unknown properties are rejected rather than silently
// persisted. This helps detect stale, misspelled, or unexpected data.
const DATABASE_KEYS = ['schemaVersion', 'dataset', 'collections', 'localAuthAccounts']
const DATASET_KEYS = ['id', 'updatedAt', 'catalogue']
const CATALOGUE_KEYS = ['catalogueType', 'checkedAt', 'coverage']
const SERVICE_KEYS = [
  'id',
  'name',
  'actionTypes',
  'acceptedItems',
  'aliases',
  'summary',
  'address',
  'suburb',
  'postcode',
  'searchAreas',
  'status',
  'source',
  'createdAt',
  'updatedAt',
]
const SOURCE_KEYS = ['organisation', 'url', 'checkedAt']
const PROFILE_KEYS = [
  'uid',
  'email',
  'displayName',
  'role',
  'status',
  'dataClass',
  'createdAt',
  'updatedAt',
]
const RATING_KEYS = [
  'id',
  'serviceId',
  'userId',
  'score',
  'reviewText',
  'status',
  'createdAt',
  'updatedAt',
]
const LOCAL_AUTH_ACCOUNT_KEYS = ['uid', 'emailCanonical', 'password', 'createdAt', 'updatedAt']
const PASSWORD_KEYS = ['algorithm', 'iterations', 'saltBase64', 'hashBase64']
const PUBLIC_COLLECTION_NAMES = ['services', 'userProfiles', 'serviceRatings']

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function codePointLength(value) {
  return Array.from(value).length
}

// Regex matching alone cannot reject impossible dates such as 2026-02-31. Reconstruct the date
// in UTC and compare its components to verify it is real.
function isRealCalendarDate(value) {
  if (typeof value !== 'string' || !CALENDAR_DATE_PATTERN.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

// A timestamp is valid only if it both matches the required format and round-trips through
// Date.toISOString() unchanged, ensuring one canonical representation.
function isCanonicalTimestamp(value) {
  if (typeof value !== 'string' || !ISO_UTC_TIMESTAMP_PATTERN.test(value)) {
    return false
  }

  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

// Source URLs are intentionally restricted to clean HTTPS URLs with no embedded credentials,
// query string, or fragment. This keeps provenance links canonical and avoids storing
// credential-bearing URLs.
function isSafeSourceUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_GENERAL_STRING_LENGTH) {
    return false
  }

  try {
    const parsed = new URL(value)
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    )
  } catch {
    return false
  }
}

function validateObject(value, path, allowedKeys, issues) {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object.`)
    return false
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      issues.push(`${path}.${key} is not allowed.`)
    }
  }

  return true
}

function validateRequired(value, path, issues) {
  const key = path.split('.').at(-1)
  if (!hasOwn(value, key)) {
    issues.push(`${path} is required.`)
    return false
  }
  return true
}

function validateString(
  value,
  path,
  issues,
  { min = 1, max = MAX_GENERAL_STRING_LENGTH, required = true, allowBlank = false } = {},
) {
  if (value === undefined && !required) {
    return true
  }

  if (typeof value !== 'string') {
    issues.push(`${path} must be a string.`)
    return false
  }

  const length = codePointLength(value)
  if (length < min || (!allowBlank && value.trim().length === 0)) {
    issues.push(`${path} must be a non-empty string.`)
    return false
  }
  if (length > max) {
    issues.push(`${path} must be at most ${max} characters.`)
    return false
  }
  return true
}

function validateIdentifier(value, path, issues) {
  if (!validateString(value, path, issues, { max: 128 })) {
    return false
  }
  if (!ID_PATTERN.test(value)) {
    issues.push(`${path} must be a Firestore-safe ID.`)
    return false
  }
  return true
}

function validateRatingIdentifier(value, path, issues) {
  if (!validateString(value, path, issues, { max: 268 })) {
    return false
  }
  if (!RATING_ID_PATTERN.test(value)) {
    issues.push(`${path} must be a Firestore-safe rating ID.`)
    return false
  }
  return true
}

function validateEnum(value, path, values, issues) {
  if (!values.includes(value)) {
    issues.push(`${path} must be one of: ${values.join(', ')}.`)
    return false
  }
  return true
}

// Require canonical standard Base64, not merely decodable Base64. The round-trip check prevents
// alternate textual encodings of the same bytes, while the byte-length check enforces the
// expected cryptographic material size.
function validateCanonicalBase64(value, path, decodedByteLength, issues) {
  if (typeof value !== 'string' || !value || !STANDARD_BASE64_PATTERN.test(value)) {
    issues.push(`${path} must be canonical standard Base64.`)
    return false
  }

  try {
    const decoded = globalThis.atob(value)
    if (globalThis.btoa(decoded) !== value) {
      issues.push(`${path} must be canonical standard Base64.`)
      return false
    }
    if (decoded.length !== decodedByteLength) {
      issues.push(`${path} must decode to exactly ${decodedByteLength} bytes.`)
      return false
    }
  } catch {
    issues.push(`${path} must be canonical standard Base64.`)
    return false
  }

  return true
}

function validateList(value, path, issues) {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array.`)
    return false
  }
  if (value.length > MAX_LIST_ENTRIES) {
    issues.push(`${path} must contain at most ${MAX_LIST_ENTRIES} entries.`)
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (validateString(item, itemPath, issues, { max: 100 }) && item !== item.trim()) {
      issues.push(`${itemPath} must not have leading or trailing whitespace.`)
    }
  })
  return true
}

function validateTimestampPair(record, path, issues) {
  const createdAtIsValid = isCanonicalTimestamp(record.createdAt)
  const updatedAtIsValid = isCanonicalTimestamp(record.updatedAt)

  if (!createdAtIsValid) {
    issues.push(`${path}.createdAt must be an ISO UTC timestamp.`)
  }
  if (!updatedAtIsValid) {
    issues.push(`${path}.updatedAt must be an ISO UTC timestamp.`)
  }
  if (createdAtIsValid && updatedAtIsValid && record.createdAt > record.updatedAt) {
    issues.push(`${path}.updatedAt must be on or after createdAt.`)
  }
}

// Recursively scan nested public data for sensitive-looking property names. Values are not
// inspected because this boundary stops credential-shaped fields from entering public
// collections rather than analysing free-form user text.
function validateSensitivePublicData(value, path, issues) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSensitivePublicData(item, `${path}[${index}]`, issues))
    return
  }
  if (!isPlainObject(value)) {
    return
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      issues.push(`${nestedPath} must not contain sensitive material.`)
      continue
    }
    validateSensitivePublicData(nestedValue, nestedPath, issues)
  }
}

// Validate one service catalogue record. Address is intentionally optional; suburb, postcode,
// search areas, provenance, and timestamps remain mandatory.
function validateService(record, path, issues) {
  if (!validateObject(record, path, SERVICE_KEYS, issues)) {
    return
  }
  for (const key of SERVICE_KEYS.filter((key) => key !== 'address')) {
    validateRequired(record, `${path}.${key}`, issues)
  }

  validateIdentifier(record.id, `${path}.id`, issues)
  validateString(record.name, `${path}.name`, issues, { max: 120 })
  validateList(record.actionTypes, `${path}.actionTypes`, issues)
  if (Array.isArray(record.actionTypes)) {
    record.actionTypes.forEach((action, index) =>
      validateEnum(action, `${path}.actionTypes[${index}]`, SERVICE_ACTIONS, issues),
    )
  }
  validateList(record.acceptedItems, `${path}.acceptedItems`, issues)
  validateList(record.aliases, `${path}.aliases`, issues)
  validateString(record.summary, `${path}.summary`, issues, { max: 500 })
  validateString(record.address, `${path}.address`, issues, { max: 500, required: false })
  validateString(record.suburb, `${path}.suburb`, issues)
  if (typeof record.postcode !== 'string' || !/^\d{4}$/.test(record.postcode)) {
    issues.push(`${path}.postcode must be exactly four ASCII digits.`)
  }
  validateList(record.searchAreas, `${path}.searchAreas`, issues)
  validateEnum(record.status, `${path}.status`, SERVICE_STATUSES, issues)

  // Every service carries provenance metadata showing who supplied the information, where it
  // came from, and when that source was last checked.
  if (validateObject(record.source, `${path}.source`, SOURCE_KEYS, issues)) {
    SOURCE_KEYS.forEach((key) => validateRequired(record.source, `${path}.source.${key}`, issues))
    validateString(record.source.organisation, `${path}.source.organisation`, issues)
    if (!isSafeSourceUrl(record.source.url)) {
      issues.push(`${path}.source.url must be an absolute HTTPS URL without credentials.`)
    }
    if (!isRealCalendarDate(record.source.checkedAt)) {
      issues.push(`${path}.source.checkedAt must be a real calendar date.`)
    }
  }

  validateTimestampPair(record, path, issues)
}

// Validate public user-profile data only. Authentication secrets belong in localAuthAccounts
// and are intentionally excluded from this record shape.
function validateProfile(record, path, issues) {
  if (!validateObject(record, path, PROFILE_KEYS, issues)) {
    return
  }
  PROFILE_KEYS.forEach((key) => validateRequired(record, `${path}.${key}`, issues))

  validateIdentifier(record.uid, `${path}.uid`, issues)
  if (
    typeof record.email !== 'string' ||
    record.email.length > 254 ||
    record.email !== record.email.toLowerCase() ||
    !CANONICAL_EMAIL_PATTERN.test(record.email)
  ) {
    issues.push(`${path}.email must be a lower-case canonical email address.`)
  }
  validateString(record.displayName, `${path}.displayName`, issues, { max: 120 })
  validateEnum(record.role, `${path}.role`, PROFILE_ROLES, issues)
  validateEnum(record.status, `${path}.status`, PROFILE_STATUSES, issues)
  validateEnum(record.dataClass, `${path}.dataClass`, PROFILE_DATA_CLASSES, issues)
  validateTimestampPair(record, path, issues)
}

function validateRating(record, path, issues) {
  if (!validateObject(record, path, RATING_KEYS, issues)) {
    return
  }
  RATING_KEYS.forEach((key) => validateRequired(record, `${path}.${key}`, issues))

  const ratingIdIsValid = validateRatingIdentifier(record.id, `${path}.id`, issues)
  const serviceIdIsValid = validateIdentifier(record.serviceId, `${path}.serviceId`, issues)
  const userIdIsValid = validateIdentifier(record.userId, `${path}.userId`, issues)
  if (ratingIdIsValid && serviceIdIsValid && userIdIsValid) {
    const canonicalId = buildRatingId(record.serviceId, record.userId)
    const legacyId = `${record.serviceId}__${record.userId}`
    // Accept both the current injective rating ID and the legacy double-underscore format to
    // preserve backwards compatibility with older local snapshots.
    if (record.id !== canonicalId && record.id !== legacyId) {
      issues.push(`${path}.id must equal its canonical or legacy service-user identifier.`)
    }
  }
  if (!Number.isInteger(record.score) || record.score < 1 || record.score > 5) {
    issues.push(`${path}.score must be an integer from 1 to 5.`)
  }
  if (record.reviewText !== null) {
    validateString(record.reviewText, `${path}.reviewText`, issues, {
      min: 0,
      max: 1000,
      allowBlank: true,
    })
  }
  validateEnum(record.status, `${path}.status`, RATING_STATUSES, issues)
  validateTimestampPair(record, path, issues)
}

// Validate local authentication records separately from public profiles. Each record must
// belong to an existing profile and contain only derived password material, never plaintext.
function validateLocalAuthAccount(record, path, profileIds, issues) {
  if (!validateObject(record, path, LOCAL_AUTH_ACCOUNT_KEYS, issues)) {
    return
  }
  LOCAL_AUTH_ACCOUNT_KEYS.forEach((key) => validateRequired(record, `${path}.${key}`, issues))

  validateIdentifier(record.uid, `${path}.uid`, issues)
  if (!profileIds.has(record.uid)) {
    issues.push(`${path}.uid must reference an existing profile.`)
  }
  if (
    typeof record.emailCanonical !== 'string' ||
    record.emailCanonical.length > 254 ||
    record.emailCanonical !== record.emailCanonical.toLowerCase() ||
    !CANONICAL_EMAIL_PATTERN.test(record.emailCanonical)
  ) {
    issues.push(`${path}.emailCanonical must be a lower-case canonical email address.`)
  }

  if (validateObject(record.password, `${path}.password`, PASSWORD_KEYS, issues)) {
    // Local passwords use the schema-approved PBKDF2-SHA-256 representation. Iteration and byte
    // length bounds keep imported snapshots within the expected authentication contract.
    PASSWORD_KEYS.forEach((key) =>
      validateRequired(record.password, `${path}.password.${key}`, issues),
    )
    if (record.password.algorithm !== 'PBKDF2-SHA-256') {
      issues.push(`${path}.password.algorithm must be PBKDF2-SHA-256.`)
    }
    if (
      !Number.isInteger(record.password.iterations) ||
      record.password.iterations < 100000 ||
      record.password.iterations > 1000000
    ) {
      issues.push(`${path}.password.iterations must be an integer from 100000 to 1000000.`)
    }
    validateCanonicalBase64(record.password.saltBase64, `${path}.password.saltBase64`, 16, issues)
    validateCanonicalBase64(record.password.hashBase64, `${path}.password.hashBase64`, 32, issues)
  }
  validateTimestampPair(record, path, issues)
}

function validateDataset(database, issues) {
  if (!validateObject(database, 'database', DATABASE_KEYS, issues)) {
    return false
  }
  for (const key of ['schemaVersion', 'dataset', 'collections']) {
    validateRequired(database, key, issues)
  }

  if (database.schemaVersion !== SCHEMA_VERSION) {
    // Reject snapshots from unknown schema versions. Migration must happen explicitly before a
    // snapshot is treated as current data.
    issues.push(`schemaVersion must be ${SCHEMA_VERSION}.`)
  }
  if (validateObject(database.dataset, 'dataset', DATASET_KEYS, issues)) {
    DATASET_KEYS.forEach((key) => validateRequired(database.dataset, `dataset.${key}`, issues))
    validateIdentifier(database.dataset.id, 'dataset.id', issues)
    if (!isCanonicalTimestamp(database.dataset.updatedAt)) {
      issues.push('dataset.updatedAt must be an ISO UTC timestamp.')
    }
    if (validateObject(database.dataset.catalogue, 'dataset.catalogue', CATALOGUE_KEYS, issues)) {
      CATALOGUE_KEYS.forEach((key) =>
        validateRequired(database.dataset.catalogue, `dataset.catalogue.${key}`, issues),
      )
      validateString(
        database.dataset.catalogue.catalogueType,
        'dataset.catalogue.catalogueType',
        issues,
      )
      if (!isRealCalendarDate(database.dataset.catalogue.checkedAt)) {
        issues.push('dataset.catalogue.checkedAt must be a real calendar date.')
      }
      validateString(database.dataset.catalogue.coverage, 'dataset.catalogue.coverage', issues, {
        max: 500,
      })
    }
  }
  return true
}

// Validate collection containers first, then individual records, then relationships between
// records. This mirrors structural, record-level, and relational integrity.
function validateCollections(database, issues) {
  if (!validateObject(database.collections, 'collections', PUBLIC_COLLECTION_NAMES, issues)) {
    return
  }
  PUBLIC_COLLECTION_NAMES.forEach((collection) => {
    validateRequired(database.collections, `collections.${collection}`, issues)
  })

  for (const collection of PUBLIC_COLLECTION_NAMES) {
    const records = database.collections[collection]
    if (!Array.isArray(records)) {
      issues.push(`collections.${collection} must be an array.`)
      continue
    }
    if (records.length > MAX_COLLECTION_RECORDS) {
      issues.push(`${collection} must contain at most ${MAX_COLLECTION_RECORDS} records.`)
    }
    records.forEach((record, index) =>
      validateSensitivePublicData(record, `${collection}[${index}]`, issues),
    )
  }

  const services = Array.isArray(database.collections.services) ? database.collections.services : []
  const profiles = Array.isArray(database.collections.userProfiles)
    ? database.collections.userProfiles
    : []
  const ratings = Array.isArray(database.collections.serviceRatings)
    ? database.collections.serviceRatings
    : []
  const localAuthAccounts = Array.isArray(database.localAuthAccounts)
    ? database.localAuthAccounts
    : []

  services.forEach((record, index) => validateService(record, `services[${index}]`, issues))
  profiles.forEach((record, index) => validateProfile(record, `userProfiles[${index}]`, issues))
  ratings.forEach((record, index) => validateRating(record, `serviceRatings[${index}]`, issues))

  const serviceIds = new Set()
  services.forEach((record, index) => {
    if (serviceIds.has(record?.id)) {
      issues.push(`services[${index}].id must be unique.`)
    }
    serviceIds.add(record?.id)
  })
  const profileIds = new Set()
  profiles.forEach((record, index) => {
    if (profileIds.has(record?.uid)) {
      issues.push(`userProfiles[${index}].uid must be unique.`)
    }
    profileIds.add(record?.uid)
  })
  const ratingIds = new Set()
  const ratingPairs = new Set()
  ratings.forEach((record, index) => {
    if (ratingIds.has(record?.id)) {
      issues.push(`serviceRatings[${index}].id must be unique.`)
    }
    ratingIds.add(record?.id)

    // Enforce one rating per service-user pair. The NUL separator is safe because canonical IDs
    // cannot contain it, preventing ambiguity in this in-memory composite key.
    const pair = `${record?.serviceId}\u0000${record?.userId}`
    if (ratingPairs.has(pair)) {
      issues.push(`serviceRatings[${index}] must not duplicate serviceId and userId.`)
    }
    ratingPairs.add(pair)

    // Enforce foreign-key-style integrity: every rating references an existing service and user.
    if (!serviceIds.has(record?.serviceId)) {
      issues.push(`serviceRatings[${index}].serviceId must reference an existing service.`)
    }
    if (!profileIds.has(record?.userId)) {
      issues.push(`serviceRatings[${index}].userId must reference an existing profile.`)
    }
  })

  if (hasOwn(database, 'localAuthAccounts')) {
    if (!Array.isArray(database.localAuthAccounts)) {
      issues.push('localAuthAccounts must be an array.')
      return
    }
    if (localAuthAccounts.length > MAX_COLLECTION_RECORDS) {
      issues.push(`localAuthAccounts must contain at most ${MAX_COLLECTION_RECORDS} records.`)
    }
    const authUids = new Set()
    const authEmails = new Set()
    localAuthAccounts.forEach((record, index) => {
      const path = `localAuthAccounts[${index}]`
      validateLocalAuthAccount(record, path, profileIds, issues)
      if (authUids.has(record?.uid)) {
        issues.push(`${path}.uid must be unique.`)
      }
      authUids.add(record?.uid)
      if (authEmails.has(record?.emailCanonical)) {
        issues.push(`${path}.emailCanonical must be unique.`)
      }
      authEmails.add(record?.emailCanonical)
    })
  }
}

/**
 * Typed validation error raised when a database snapshot violates the versioned schema.
 */
export class DatabaseValidationError extends Error {
  /**
   * @param {string[]} issues - Deterministic validation failures.
   */
  constructor(issues) {
    super(issues.join(' '))
    this.name = 'DatabaseValidationError'
    this.issues = [...issues]
  }
}

/**
 * Builds the injective local rating identifier shared by schema and repository adapters.
 *
 * @param {string} serviceId - Valid 1-128 character service identifier.
 * @param {string} userId - Valid 1-128 character user identifier.
 * @returns {string} `rating_{serviceId.length}_{serviceId}_{userId}`.
 * @throws {TypeError} When either identifier is outside the canonical ID contract.
 */
export function buildRatingId(serviceId, userId) {
  if (
    typeof serviceId !== 'string' ||
    !ID_PATTERN.test(serviceId) ||
    typeof userId !== 'string' ||
    !ID_PATTERN.test(userId)
  ) {
    throw new TypeError('Valid service and user identifiers are required.')
  }

  // Prefix the service ID with its length so the composite encoding remains unambiguous even
  // when serviceId or userId contains underscores.
  return `rating_${serviceId.length}_${serviceId}_${userId}`
}

/**
 * Validates a complete local database snapshot without mutating it.
 *
 * @param {unknown} database - Candidate versioned snapshot.
 * @returns {{ isValid: boolean, issues: string[] }} Validation status and ordered issues.
 */
export function validateDatabase(database) {
  const issues = []
  if (validateDataset(database, issues)) {
    validateCollections(database, issues)
  }
  return { isValid: issues.length === 0, issues }
}

/**
 * Returns the original snapshot after validation, or throws its deterministic issues.
 *
 * @template T
 * @param {T} database - Candidate versioned snapshot.
 * @returns {T} The same validated snapshot instance.
 * @throws {DatabaseValidationError} When the snapshot violates the schema.
 */
export function assertValidDatabase(database) {
  const result = validateDatabase(database)
  if (!result.isValid) {
    throw new DatabaseValidationError(result.issues)
  }
  return database
}
