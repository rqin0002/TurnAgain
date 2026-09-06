import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore/lite'

import { firestoreLite } from '../../../firebase/firebaseFirestoreLiteClient.js'
import { isCalendarDate, isHttpsUrl } from '../../../utils/catalogueValidation.js'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
const ALLOWED_ACTIONS = new Set(['repair', 'reuse', 'recycle'])
const SERVICE_REQUIRED_KEYS = new Set([
  'acceptedItems',
  'actionTypes',
  'aliases',
  'createdAt',
  'id',
  'name',
  'postcode',
  'searchAreas',
  'source',
  'status',
  'suburb',
  'summary',
  'updatedAt',
])
const SERVICE_ALLOWED_KEYS = new Set([...SERVICE_REQUIRED_KEYS, 'address'])
const METADATA_KEYS = new Set([
  'catalogueType',
  'checkedAt',
  'coverage',
  'datasetId',
  'schemaVersion',
  'updatedAt',
])

const DEFAULT_FIRESTORE_API = Object.freeze({
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
})

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (value, required, allowed = required) => {
  const keys = Object.keys(value)
  return (
    [...required].every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key))
  )
}

const isBoundedString = (value, maximum = 500) =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum

const isStringList = (value, maximumEntries = 50) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= maximumEntries &&
  value.every((entry) => isBoundedString(entry, 100))

const toIsoTimestamp = (value) => {
  if (typeof value?.toDate !== 'function') {
    return null
  }

  const date = value.toDate()
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

const projectMetadata = (candidate) => {
  if (
    !isPlainObject(candidate) ||
    !hasExactKeys(candidate, METADATA_KEYS) ||
    !isBoundedString(candidate.datasetId, 100) ||
    !Number.isInteger(candidate.schemaVersion) ||
    candidate.schemaVersion < 1 ||
    !isBoundedString(candidate.catalogueType, 50) ||
    !isCalendarDate(candidate.checkedAt) ||
    !isBoundedString(candidate.coverage, 500)
  ) {
    return null
  }

  const updatedAt = toIsoTimestamp(candidate.updatedAt)
  return updatedAt === null ? null : { ...candidate, updatedAt }
}

const projectService = (documentId, candidate) => {
  const source = candidate?.source
  const createdAt = toIsoTimestamp(candidate?.createdAt)
  const updatedAt = toIsoTimestamp(candidate?.updatedAt)

  if (
    !ID_PATTERN.test(documentId) ||
    !isPlainObject(candidate) ||
    !hasExactKeys(candidate, SERVICE_REQUIRED_KEYS, SERVICE_ALLOWED_KEYS) ||
    candidate.id !== documentId ||
    !isBoundedString(candidate.name, 150) ||
    !isStringList(candidate.actionTypes, 3) ||
    !candidate.actionTypes.every((action) => ALLOWED_ACTIONS.has(action)) ||
    !isStringList(candidate.acceptedItems) ||
    !isStringList(candidate.aliases) ||
    !isBoundedString(candidate.summary, 1000) ||
    (candidate.address !== undefined && !isBoundedString(candidate.address, 200)) ||
    !isBoundedString(candidate.suburb, 100) ||
    !/^\d{4}$/u.test(candidate.postcode) ||
    !isStringList(candidate.searchAreas) ||
    candidate.status !== 'published' ||
    !isPlainObject(source) ||
    !hasExactKeys(source, new Set(['checkedAt', 'organisation', 'url'])) ||
    !isBoundedString(source.organisation, 150) ||
    !isHttpsUrl(source.url) ||
    !isCalendarDate(source.checkedAt) ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null
  }

  return { ...candidate, source: { ...source }, createdAt, updatedAt }
}

const throwIfAborted = (signal) => {
  if (signal?.aborted) {
    throw new DOMException('The catalogue request was aborted.', 'AbortError')
  }
}

/** Error raised when the public Firestore catalogue cannot be loaded safely. */
export class ServiceCatalogueError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message)
    this.name = 'ServiceCatalogueError'
    this.code = code
    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

const mapRepositoryError = (error) => {
  if (error?.name === 'AbortError' || error instanceof ServiceCatalogueError) {
    return error
  }

  if (
    error?.code === 'unavailable' ||
    error?.code === 'deadline-exceeded' ||
    error?.code === 'resource-exhausted'
  ) {
    return new ServiceCatalogueError('The service catalogue could not be reached.', {
      code: 'network',
      cause: error,
    })
  }

  return new ServiceCatalogueError('The service catalogue has an unexpected structure.', {
    code: 'invalid-data',
  })
}

/**
 * Creates the public Firestore catalogue repository while preserving the
 * existing `{ metadata, services }` interface used by Vue components.
 */
export function createFirestoreServiceRepository(dependencies = {}) {
  const settings = isPlainObject(dependencies) ? dependencies : {}
  const db = settings.db ?? firestoreLite
  const firestoreApi = settings.firestoreApi ?? DEFAULT_FIRESTORE_API

  const fetchServiceCatalogue = async ({ signal } = {}) => {
    try {
      throwIfAborted(signal)

      const metadataSnapshot = await firestoreApi.getDoc(
        firestoreApi.doc(db, 'catalogues', 'current'),
      )
      throwIfAborted(signal)
      if (!metadataSnapshot.exists()) {
        throw new ServiceCatalogueError('The service catalogue has an unexpected structure.', {
          code: 'invalid-data',
        })
      }

      const servicesQuery = firestoreApi.query(
        firestoreApi.collection(db, 'services'),
        firestoreApi.where('status', '==', 'published'),
        firestoreApi.limit(100),
      )
      const servicesSnapshot = await firestoreApi.getDocs(servicesQuery)
      throwIfAborted(signal)

      const metadata = projectMetadata(metadataSnapshot.data())
      const services = servicesSnapshot.docs.map((snapshot) =>
        projectService(snapshot.id, snapshot.data()),
      )
      if (metadata === null || services.some((service) => service === null)) {
        throw new ServiceCatalogueError('The service catalogue has an unexpected structure.', {
          code: 'invalid-data',
        })
      }

      return { metadata, services }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  return Object.freeze({ fetchServiceCatalogue })
}

const runtimeRepository = createFirestoreServiceRepository()

/** Loads the public catalogue from Firestore through a validated boundary. */
export const fetchServiceCatalogue = (options) => runtimeRepository.fetchServiceCatalogue(options)
