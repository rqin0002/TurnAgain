import {
  ID_PATTERN,
  hasExactKeys,
  isBoundedString,
  isCalendarDate,
  isHttpsUrl,
  isPlainObject,
  isStringList,
  toIsoTimestamp,
} from '@/shared/domain/catalogueValidation.js'

/**
 * The shape of an activity document (activities/{id}) and the checks the app applies before it
 * trusts one; the rules' isValidActivity mirrors them. validateActivity(candidate) returns
 * `{ isValid, errors }` with one 'invalid' entry per failing field (or `keys` / `record` when the
 * shape is wrong). projectActivity(id, candidate) returns a copy safe to render (lists copied,
 * revision defaulting to 1, timestamps as ISO strings), or null when the document is invalid or
 * its id field does not match the document id.
 */

export const ACTIVITY_TYPES = Object.freeze(['repair', 'reuse', 'workshop'])
export const ACTIVITY_STATUSES = Object.freeze(['published', 'archived'])

const REQUIRED_KEYS = new Set([
  'acceptedConditions',
  'accessibilityLabel',
  'activityType',
  'cancellationLabel',
  'costLabel',
  'createdAt',
  'excludedConditions',
  'id',
  'providerName',
  'providerUrl',
  'sourceCheckedAt',
  'status',
  'suitableItems',
  'summary',
  'title',
  'updatedAt',
  'whatToBring',
])
const OPTIONAL_KEYS = new Set(['revision'])
export const ACTIVITY_KEYS = Object.freeze([...REQUIRED_KEYS, ...OPTIONAL_KEYS].sort())
const ALLOWED_KEYS = new Set(ACTIVITY_KEYS)

const list = (value, minimumEntries = 1) =>
  isStringList(value, { minimumEntries, maximumEntries: 12, maximumLength: 160 })

const CHECKS = Object.freeze({
  id: (c) => typeof c.id === 'string' && ID_PATTERN.test(c.id),
  title: (c) => isBoundedString(c.title, 150),
  summary: (c) => isBoundedString(c.summary, 1200),
  activityType: (c) => ACTIVITY_TYPES.includes(c.activityType),
  suitableItems: (c) => list(c.suitableItems),
  acceptedConditions: (c) => list(c.acceptedConditions),
  // Published activities may state no exclusions (four seeded ones do); the rules' isValidActivity
  // mirrors this bound.
  excludedConditions: (c) => list(c.excludedConditions, 0),
  costLabel: (c) => isBoundedString(c.costLabel, 300),
  whatToBring: (c) => list(c.whatToBring),
  accessibilityLabel: (c) => isBoundedString(c.accessibilityLabel, 500),
  cancellationLabel: (c) => isBoundedString(c.cancellationLabel, 500),
  providerName: (c) => isBoundedString(c.providerName, 150),
  providerUrl: (c) => isHttpsUrl(c.providerUrl),
  sourceCheckedAt: (c) => isCalendarDate(c.sourceCheckedAt),
  status: (c) => ACTIVITY_STATUSES.includes(c.status),
  revision: (c) => c.revision === undefined || (Number.isInteger(c.revision) && c.revision >= 1),
  createdAt: (c) => toIsoTimestamp(c.createdAt) !== null,
  updatedAt: (c) => toIsoTimestamp(c.updatedAt) !== null,
  timestampsOrdered: (c) => {
    const created = toIsoTimestamp(c.createdAt)
    const updated = toIsoTimestamp(c.updatedAt)
    return created === null || updated === null || Date.parse(created) <= Date.parse(updated)
  },
})

export function validateActivity(candidate) {
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

export function projectActivity(documentId, candidate) {
  if (
    !ID_PATTERN.test(documentId) ||
    !validateActivity(candidate).isValid ||
    candidate.id !== documentId
  ) {
    return null
  }
  return {
    ...candidate,
    acceptedConditions: [...candidate.acceptedConditions],
    excludedConditions: [...candidate.excludedConditions],
    suitableItems: [...candidate.suitableItems],
    whatToBring: [...candidate.whatToBring],
    revision: candidate.revision ?? 1,
    createdAt: toIsoTimestamp(candidate.createdAt),
    updatedAt: toIsoTimestamp(candidate.updatedAt),
  }
}
