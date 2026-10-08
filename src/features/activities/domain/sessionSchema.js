import {
  ID_PATTERN,
  POSTCODE_PATTERN,
  hasExactKeys,
  isBoundedString,
  isCalendarDate,
  isHttpsUrl,
  isNullableBoundedString,
  isPlainObject,
  toIsoTimestamp,
} from '@/shared/domain/catalogueValidation.js'

/**
 * The session vocabulary: no `activityTitle` (the UI joins activities), no
 * `geo` (venue text only). A document with any key outside this vocabulary, `activityTitle`
 * included, is refused like any other malformed record. `projectSession` defaults the two keys
 * older documents may lack (`revision`, `cancellationNoticeAt`).
 */

export const SESSION_STATUSES = Object.freeze(['scheduled', 'full', 'cancelled', 'completed'])
export const PUBLIC_SESSION_STATUSES = Object.freeze(['scheduled', 'full', 'cancelled'])
export const REGISTRATION_TYPES = Object.freeze(['turnagain', 'provider', 'drop-in'])

const REQUIRED_KEYS = new Set([
  'activityId',
  'address',
  'bookedCount',
  'capacity',
  'createdAt',
  'endsAt',
  'id',
  'participantNotice',
  'postcode',
  'registrationType',
  'registrationUrl',
  'sourceCheckedAt',
  'startsAt',
  'status',
  'suburb',
  'updatedAt',
  'venueName',
  'waitlistCount',
])
const OPTIONAL_KEYS = new Set(['cancellationNoticeAt', 'revision'])
export const SESSION_KEYS = Object.freeze([...REQUIRED_KEYS, ...OPTIONAL_KEYS].sort())
const ALLOWED_KEYS = new Set(SESSION_KEYS)

export const hasKnownCapacity = (session) =>
  Number.isInteger(session?.capacity) &&
  session.capacity >= 1 &&
  session.capacity <= 10000 &&
  Number.isInteger(session.bookedCount) &&
  session.bookedCount >= 0 &&
  session.bookedCount <= session.capacity &&
  Number.isInteger(session.waitlistCount) &&
  session.waitlistCount >= 0 &&
  session.waitlistCount <= 10000

const hasUnknownExternalCapacity = (session) =>
  session.registrationType !== 'turnagain' &&
  session.capacity === null &&
  session.bookedCount === null &&
  session.waitlistCount === null

const hasValidRegistration = (session) =>
  (session.registrationType === 'provider' && isHttpsUrl(session.registrationUrl)) ||
  (session.registrationType !== 'provider' && session.registrationUrl === null)

/** `full` is derived from the counters; cancelled and completed are stated. */
export const hasConsistentSessionStatus = (session) =>
  !hasKnownCapacity(session) ||
  session.status === 'cancelled' ||
  session.status === 'completed' ||
  (session.status === 'scheduled' && session.bookedCount < session.capacity) ||
  (session.status === 'full' && session.bookedCount === session.capacity)

/** The status the counters imply for an open session; cancelled/completed pass through. */
export function deriveSessionStatus(session) {
  if (session.status === 'cancelled' || session.status === 'completed') {
    return session.status
  }
  if (!hasKnownCapacity(session)) {
    return 'scheduled'
  }
  return session.bookedCount >= session.capacity ? 'full' : 'scheduled'
}

const isNullableTimestamp = (value) => value === null || toIsoTimestamp(value) !== null

const CHECKS = Object.freeze({
  id: (c) => typeof c.id === 'string' && ID_PATTERN.test(c.id),
  activityId: (c) => typeof c.activityId === 'string' && ID_PATTERN.test(c.activityId),
  venueName: (c) => isBoundedString(c.venueName, 150),
  address: (c) => isBoundedString(c.address, 200),
  suburb: (c) => isBoundedString(c.suburb, 100),
  postcode: (c) => typeof c.postcode === 'string' && POSTCODE_PATTERN.test(c.postcode),
  registrationType: (c) => REGISTRATION_TYPES.includes(c.registrationType),
  capacity: (c) => hasKnownCapacity(c) || hasUnknownExternalCapacity(c),
  registrationUrl: (c) => hasValidRegistration(c),
  status: (c) => SESSION_STATUSES.includes(c.status) && hasConsistentSessionStatus(c),
  sourceCheckedAt: (c) => isCalendarDate(c.sourceCheckedAt),
  participantNotice: (c) => isNullableBoundedString(c.participantNotice, 500),
  startsAt: (c) => toIsoTimestamp(c.startsAt) !== null,
  endsAt: (c) => {
    const starts = toIsoTimestamp(c.startsAt)
    const ends = toIsoTimestamp(c.endsAt)
    return starts !== null && ends !== null && Date.parse(ends) > Date.parse(starts)
  },
  createdAt: (c) => toIsoTimestamp(c.createdAt) !== null,
  updatedAt: (c) => {
    const created = toIsoTimestamp(c.createdAt)
    const updated = toIsoTimestamp(c.updatedAt)
    return created !== null && updated !== null && Date.parse(created) <= Date.parse(updated)
  },
  revision: (c) => c.revision === undefined || (Number.isInteger(c.revision) && c.revision >= 1),
  cancellationNoticeAt: (c) =>
    c.cancellationNoticeAt === undefined || isNullableTimestamp(c.cancellationNoticeAt),
})

export function validateSession(candidate) {
  if (!isPlainObject(candidate)) {
    return { isValid: false, errors: { record: 'not-an-object' } }
  }
  const errors = {}
  if (!hasExactKeys(candidate, REQUIRED_KEYS, ALLOWED_KEYS)) {
    errors.keys = 'unexpected-or-missing-keys'
  }
  for (const [field, check] of Object.entries(CHECKS)) {
    if (!check(candidate)) {
      errors[field] = 'invalid'
    }
  }
  return { isValid: Object.keys(errors).length === 0, errors }
}

export function projectSession(documentId, candidate) {
  if (
    !ID_PATTERN.test(documentId) ||
    !validateSession(candidate).isValid ||
    candidate.id !== documentId
  ) {
    return null
  }
  return {
    ...candidate,
    revision: candidate.revision ?? 1,
    cancellationNoticeAt:
      candidate.cancellationNoticeAt == null
        ? null
        : toIsoTimestamp(candidate.cancellationNoticeAt),
    startsAt: toIsoTimestamp(candidate.startsAt),
    endsAt: toIsoTimestamp(candidate.endsAt),
    createdAt: toIsoTimestamp(candidate.createdAt),
    updatedAt: toIsoTimestamp(candidate.updatedAt),
  }
}
