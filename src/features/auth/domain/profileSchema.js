import {
  ROLES,
  hasExactKeys,
  isPlainObject,
  isValidId,
  normalizeEmail,
} from '@/shared/domain/catalogueValidation.js'

/**
 * Shape check for a stored users/{uid} document before the app trusts it: allowed keys, uid,
 * email, display name (1–50, counted with String.length), role, status, revision and the saved
 * service list (at most 100). Older records may lack revision and savedServiceIds;
 * projectProfile fills their defaults and sets needsUpgrade so the store writes them once.
 * Timestamps are not checked here (a just-written document holds serverTimestamp sentinels);
 * firestore.rules enforces them on every write.
 */

export const PROFILE_KEYS = Object.freeze([
  'uid',
  'email',
  'displayName',
  'role',
  'status',
  'createdAt',
  'updatedAt',
  'revision',
  'savedServiceIds',
])

export const PROFILE_STATUSES = Object.freeze(['active', 'disabled'])
export const DISPLAY_NAME_MAX_LENGTH = 50
/** The rules bound (`savedServiceIds is list && size() <= 100`). */
export const SAVED_SERVICES_LIMIT = 100

const DEFAULT_DISPLAY_NAME = 'Member'
const REQUIRED_KEYS = new Set(['uid', 'email', 'displayName', 'role', 'status'])
const ALLOWED_KEYS = new Set(PROFILE_KEYS)
// The rules' isValidEmail: 3..254 characters, already lower-case, one @ with a dot after it.
const EMAIL_PATTERN = /^[^@ ]+@[^@ ]+[.][^@ ]+$/u

/** The address a profile may store: the rules' isValidEmail on an already-normalised value. */
export const isStoredEmail = (value) =>
  typeof value === 'string' &&
  value.length >= 3 &&
  value.length <= 254 &&
  value === normalizeEmail(value) &&
  EMAIL_PATTERN.test(value)

const isDisplayName = (value) =>
  typeof value === 'string' && value.length >= 1 && value.length <= DISPLAY_NAME_MAX_LENGTH

const isSavedServiceList = (value) =>
  Array.isArray(value) && value.length <= SAVED_SERVICES_LIMIT && value.every(isValidId)

const CHECKS = Object.freeze({
  uid: (c) => isValidId(c.uid),
  email: (c) => isStoredEmail(c.email),
  displayName: (c) => isDisplayName(c.displayName),
  role: (c) => ROLES.includes(c.role),
  status: (c) => PROFILE_STATUSES.includes(c.status),
  revision: (c) => !('revision' in c) || (Number.isInteger(c.revision) && c.revision >= 1),
  savedServiceIds: (c) => !('savedServiceIds' in c) || isSavedServiceList(c.savedServiceIds),
})

/**
 * @param {unknown} candidate - a stored users/{uid} document
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validateProfile(candidate) {
  if (!isPlainObject(candidate)) {
    return { ok: false, errors: { profile: 'not an object' } }
  }
  const errors = {}
  if (!hasExactKeys(candidate, REQUIRED_KEYS, ALLOWED_KEYS)) {
    errors.keys = `keys must be within ${PROFILE_KEYS.join(', ')}`
  }
  for (const [field, check] of Object.entries(CHECKS)) {
    if (!check(candidate)) {
      errors[field] = `${field} is invalid`
    }
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * The store's view of a profile: identity, role, status, the concurrency revision and the saved
 * list, frozen. Missing `revision` / `savedServiceIds` take their defaults and set `needsUpgrade`.
 *
 * @param {unknown} candidate
 * @returns {object | null}
 */
export function projectProfile(candidate) {
  if (!validateProfile(candidate).ok) {
    return null
  }
  const hasRevision = 'revision' in candidate
  const hasSavedServiceIds = 'savedServiceIds' in candidate
  return Object.freeze({
    uid: candidate.uid,
    email: candidate.email,
    displayName: candidate.displayName,
    role: candidate.role,
    status: candidate.status,
    revision: hasRevision ? candidate.revision : 1,
    savedServiceIds: Object.freeze(hasSavedServiceIds ? [...candidate.savedServiceIds] : []),
    needsUpgrade: !hasRevision || !hasSavedServiceIds,
  })
}

const safeDisplayName = (value) => {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : ''
  // A console-created account or a failed updateProfile leaves no name; the rules need 1..50.
  return isDisplayName(name) ? name : DEFAULT_DISPLAY_NAME
}

/**
 * The document createProfile writes, minus the two server timestamps (role member,
 * status active, revision 1, no saved services).
 */
export function blankProfile({ uid, email, displayName }) {
  return {
    uid,
    email: normalizeEmail(email),
    displayName: safeDisplayName(displayName),
    role: 'member',
    status: 'active',
    revision: 1,
    savedServiceIds: [],
  }
}
