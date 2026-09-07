import { collection, getDocs, limit, query, where } from 'firebase/firestore/lite'

import { firestoreLite } from '../../../firebase/firebaseFirestoreLiteClient.js'
import { isCalendarDate, isHttpsUrl } from '../../../utils/catalogueValidation.js'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
const POSTCODE_PATTERN = /^\d{4}$/u
const ACTIVITY_TYPES = new Set(['repair', 'reuse', 'workshop'])
const ACTIVITY_STATUSES = new Set(['published'])
const SESSION_STATUSES = new Set(['scheduled', 'full', 'cancelled', 'completed'])
const PUBLIC_SESSION_STATUSES = Object.freeze(['scheduled', 'full', 'cancelled'])
const REGISTRATION_TYPES = new Set(['turnagain', 'provider', 'drop-in'])

const ACTIVITY_KEYS = new Set([
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

const SESSION_KEYS = new Set([
  'activityId',
  'activityTitle',
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

const DEFAULT_FIRESTORE_API = Object.freeze({ collection, getDocs, limit, query, where })

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (value, keys) => {
  const candidateKeys = Object.keys(value)
  return candidateKeys.length === keys.size && candidateKeys.every((key) => keys.has(key))
}

const isBoundedString = (value, maximum = 500) =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum

const isNullableBoundedString = (value, maximum = 500) =>
  value === null || isBoundedString(value, maximum)

const isStringList = (value, maximumEntries = 12) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= maximumEntries &&
  value.every((entry) => isBoundedString(entry, 160))

const hasKnownCapacity = (candidate) =>
  Number.isInteger(candidate.capacity) &&
  candidate.capacity >= 1 &&
  candidate.capacity <= 10000 &&
  Number.isInteger(candidate.bookedCount) &&
  candidate.bookedCount >= 0 &&
  candidate.bookedCount <= candidate.capacity &&
  Number.isInteger(candidate.waitlistCount) &&
  candidate.waitlistCount >= 0 &&
  candidate.waitlistCount <= 10000

const hasUnknownExternalCapacity = (candidate) =>
  candidate.registrationType !== 'turnagain' &&
  candidate.capacity === null &&
  candidate.bookedCount === null &&
  candidate.waitlistCount === null

const hasValidRegistration = (candidate) =>
  (candidate.registrationType === 'provider' && isHttpsUrl(candidate.registrationUrl)) ||
  (candidate.registrationType !== 'provider' && candidate.registrationUrl === null)

const hasConsistentSessionStatus = (candidate) =>
  !hasKnownCapacity(candidate) ||
  candidate.status === 'cancelled' ||
  candidate.status === 'completed' ||
  (candidate.status === 'scheduled' && candidate.bookedCount < candidate.capacity) ||
  (candidate.status === 'full' && candidate.bookedCount === candidate.capacity)

const toIsoTimestamp = (value) => {
  if (typeof value?.toDate !== 'function') {
    return null
  }

  const date = value.toDate()
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

const projectActivity = (documentId, candidate) => {
  const createdAt = toIsoTimestamp(candidate?.createdAt)
  const updatedAt = toIsoTimestamp(candidate?.updatedAt)

  if (
    !ID_PATTERN.test(documentId) ||
    !isPlainObject(candidate) ||
    !hasExactKeys(candidate, ACTIVITY_KEYS) ||
    candidate.id !== documentId ||
    !isBoundedString(candidate.title, 150) ||
    !isBoundedString(candidate.summary, 1200) ||
    !ACTIVITY_TYPES.has(candidate.activityType) ||
    !isStringList(candidate.suitableItems) ||
    !isStringList(candidate.acceptedConditions) ||
    !isStringList(candidate.excludedConditions) ||
    !isBoundedString(candidate.costLabel, 300) ||
    !isStringList(candidate.whatToBring) ||
    !isBoundedString(candidate.accessibilityLabel, 500) ||
    !isBoundedString(candidate.cancellationLabel, 500) ||
    !isBoundedString(candidate.providerName, 150) ||
    !isHttpsUrl(candidate.providerUrl) ||
    !isCalendarDate(candidate.sourceCheckedAt) ||
    !ACTIVITY_STATUSES.has(candidate.status) ||
    createdAt === null ||
    updatedAt === null ||
    Date.parse(createdAt) > Date.parse(updatedAt)
  ) {
    return null
  }

  return {
    ...candidate,
    acceptedConditions: [...candidate.acceptedConditions],
    excludedConditions: [...candidate.excludedConditions],
    suitableItems: [...candidate.suitableItems],
    whatToBring: [...candidate.whatToBring],
    createdAt,
    updatedAt,
  }
}

const projectSession = (documentId, candidate) => {
  const startsAt = toIsoTimestamp(candidate?.startsAt)
  const endsAt = toIsoTimestamp(candidate?.endsAt)
  const createdAt = toIsoTimestamp(candidate?.createdAt)
  const updatedAt = toIsoTimestamp(candidate?.updatedAt)

  if (
    !ID_PATTERN.test(documentId) ||
    !isPlainObject(candidate) ||
    !hasExactKeys(candidate, SESSION_KEYS) ||
    candidate.id !== documentId ||
    typeof candidate.activityId !== 'string' ||
    !ID_PATTERN.test(candidate.activityId) ||
    !isBoundedString(candidate.activityTitle, 150) ||
    !isBoundedString(candidate.venueName, 150) ||
    !isBoundedString(candidate.address, 200) ||
    !isBoundedString(candidate.suburb, 100) ||
    typeof candidate.postcode !== 'string' ||
    !POSTCODE_PATTERN.test(candidate.postcode) ||
    !REGISTRATION_TYPES.has(candidate.registrationType) ||
    (!hasKnownCapacity(candidate) && !hasUnknownExternalCapacity(candidate)) ||
    !hasValidRegistration(candidate) ||
    !SESSION_STATUSES.has(candidate.status) ||
    !hasConsistentSessionStatus(candidate) ||
    !isCalendarDate(candidate.sourceCheckedAt) ||
    !isNullableBoundedString(candidate.participantNotice, 500) ||
    startsAt === null ||
    endsAt === null ||
    Date.parse(endsAt) <= Date.parse(startsAt) ||
    createdAt === null ||
    updatedAt === null ||
    Date.parse(createdAt) > Date.parse(updatedAt)
  ) {
    return null
  }

  return { ...candidate, startsAt, endsAt, createdAt, updatedAt }
}

const throwIfAborted = (signal) => {
  if (signal?.aborted) {
    throw new DOMException('The activity request was aborted.', 'AbortError')
  }
}

/** Error raised when Firestore activity data cannot be projected into the public contract. */
export class ActivityCatalogueError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message)
    this.name = 'ActivityCatalogueError'
    this.code = code
    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

const mapRepositoryError = (error) => {
  if (error?.name === 'AbortError' || error instanceof ActivityCatalogueError) {
    return error
  }

  if (
    error?.code === 'unavailable' ||
    error?.code === 'deadline-exceeded' ||
    error?.code === 'resource-exhausted'
  ) {
    return new ActivityCatalogueError('The activity catalogue could not be reached.', {
      code: 'network',
      cause: error,
    })
  }

  if (error?.code === 'permission-denied') {
    return new ActivityCatalogueError('Activity access is not configured for this environment.', {
      code: 'configuration',
      cause: error,
    })
  }

  return new ActivityCatalogueError('The activity catalogue has an unexpected structure.', {
    code: 'invalid-data',
  })
}

const projectDocuments = (snapshots, projector) => {
  const records = snapshots.docs.map((snapshot) => projector(snapshot.id, snapshot.data()))
  if (records.some((record) => record === null)) {
    throw new ActivityCatalogueError('The activity catalogue has an unexpected structure.', {
      code: 'invalid-data',
    })
  }
  return records
}

const projectCatalogue = (activitySnapshots, sessionSnapshots) => {
  const activities = projectDocuments(activitySnapshots, projectActivity)
  const sessions = projectDocuments(sessionSnapshots, projectSession)
  const activitiesById = new Map(activities.map((activity) => [activity.id, activity]))

  // Session titles are denormalised for staff tables. The trusted data boundary
  // rejects orphaned or stale copies instead of silently presenting them.
  const hasInvalidRelationship = sessions.some((session) => {
    const activity = activitiesById.get(session.activityId)
    return activity === undefined || session.activityTitle !== activity.title
  })

  if (hasInvalidRelationship) {
    throw new ActivityCatalogueError('The activity catalogue has an unexpected structure.', {
      code: 'invalid-data',
    })
  }

  return { activities, sessions }
}

/**
 * Creates the Firestore activity repository. Public and staff reads share one
 * strict projection boundary, while Security Rules decide which query is allowed.
 */
export function createFirestoreActivityRepository(dependencies = {}) {
  const settings = isPlainObject(dependencies) ? dependencies : {}
  const db = settings.db ?? firestoreLite
  const firestoreApi = settings.firestoreApi ?? DEFAULT_FIRESTORE_API

  const fetchPublicActivityCatalogue = async ({ signal } = {}) => {
    try {
      throwIfAborted(signal)

      const activitiesQuery = firestoreApi.query(
        firestoreApi.collection(db, 'activities'),
        firestoreApi.where('status', '==', 'published'),
        firestoreApi.limit(100),
      )
      const sessionsQuery = firestoreApi.query(
        firestoreApi.collection(db, 'activitySessions'),
        firestoreApi.where('status', 'in', PUBLIC_SESSION_STATUSES),
        firestoreApi.limit(100),
      )
      const [activitySnapshots, sessionSnapshots] = await Promise.all([
        firestoreApi.getDocs(activitiesQuery),
        firestoreApi.getDocs(sessionsQuery),
      ])
      throwIfAborted(signal)

      return projectCatalogue(activitySnapshots, sessionSnapshots)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  const fetchStaffActivitySessions = async ({ signal } = {}) => {
    try {
      throwIfAborted(signal)
      const activitiesQuery = firestoreApi.query(
        firestoreApi.collection(db, 'activities'),
        firestoreApi.where('status', '==', 'published'),
        firestoreApi.limit(100),
      )
      const sessionsQuery = firestoreApi.query(
        firestoreApi.collection(db, 'activitySessions'),
        firestoreApi.limit(100),
      )
      const [activitySnapshots, sessionSnapshots] = await Promise.all([
        firestoreApi.getDocs(activitiesQuery),
        firestoreApi.getDocs(sessionsQuery),
      ])
      throwIfAborted(signal)

      return projectCatalogue(activitySnapshots, sessionSnapshots)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  return Object.freeze({ fetchPublicActivityCatalogue, fetchStaffActivitySessions })
}

const runtimeRepository = createFirestoreActivityRepository()

/** Loads public activity and session records from Firestore. */
export const fetchPublicActivityCatalogue = (options) =>
  runtimeRepository.fetchPublicActivityCatalogue(options)

/** Loads the staff-visible session register from Firestore. */
export const fetchStaffActivitySessions = (options) =>
  runtimeRepository.fetchStaffActivitySessions(options)
