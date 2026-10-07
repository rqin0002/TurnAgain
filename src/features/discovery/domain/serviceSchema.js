import {
  ID_PATTERN,
  POSTCODE_PATTERN,
  hasExactKeys,
  isBoundedString,
  isCalendarDate,
  isHttpsUrl,
  isNullableBoundedString,
  isPlainObject,
  isStringList,
  isValidId,
  toIsoTimestamp,
} from '@/shared/domain/catalogueValidation.js'

import { ITEM_CATEGORY_IDS, deriveItemCategories } from './itemCategories.js'

/**
 * The service vocabulary, once, next to its projector; the rules mirror it.
 * `projectService` skips a malformed document (returns null) instead of failing the page and
 * fills defaults for the optional fields the eight live documents do not carry yet.
 */

export const SERVICE_ACTIONS = Object.freeze(['repair', 'reuse', 'recycle'])
export const SERVICE_STATUSES = Object.freeze(['published', 'archived'])
export const GEO_PRECISIONS = Object.freeze(['venue', 'area'])

const REQUIRED_KEYS = new Set([
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
const OPTIONAL_KEYS = new Set([
  'access',
  'acceptanceConditions',
  'address',
  'cost',
  'geo',
  'itemCategories',
  'openingHours',
  'preparation',
  'revision',
])
export const SERVICE_KEYS = Object.freeze([...REQUIRED_KEYS, ...OPTIONAL_KEYS].sort())
const ALLOWED_KEYS = new Set(SERVICE_KEYS)
const SOURCE_KEYS = new Set(['checkedAt', 'organisation', 'url'])
const GEO_KEYS = new Set(['checkedAt', 'latitude', 'longitude', 'precision', 'sourceUrl'])
const METADATA_KEYS = new Set([
  'catalogueType',
  'checkedAt',
  'coverage',
  'datasetId',
  'schemaVersion',
  'updatedAt',
])
const isCoordinate = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Math.abs(latitude) <= 90 &&
  Number.isFinite(longitude) &&
  Math.abs(longitude) <= 180

/** null, or a located point with its provenance. */
export function isServiceGeo(geo) {
  return (
    geo === null ||
    (isPlainObject(geo) &&
      hasExactKeys(geo, GEO_KEYS) &&
      isCoordinate(geo.latitude, geo.longitude) &&
      GEO_PRECISIONS.includes(geo.precision) &&
      isHttpsUrl(geo.sourceUrl) &&
      isCalendarDate(geo.checkedAt))
  )
}

const optionalList = (value, maximumEntries, maximumLength) =>
  value === undefined || isStringList(value, { minimumEntries: 0, maximumEntries, maximumLength })

// The maxima are the rules' (`isValidService`: `isStringList(d.acceptedItems, 40, 100)`,
// `(d.aliases, 20, 100)`, `(d.searchAreas, 20, 100)`, `d.summary.size() <= 600`), checked on every
// entry where the rules check the first. The one-entry minimum and the non-null suburb and
// postcode stay stricter than the rules on purpose: the seed and the forms write the intersection.
const CHECKS = Object.freeze({
  id: (c) => isValidId(c.id),
  name: (c) => isBoundedString(c.name, 150),
  actionTypes: (c) =>
    isStringList(c.actionTypes, { maximumEntries: 3 }) &&
    c.actionTypes.every((action) => SERVICE_ACTIONS.includes(action)),
  acceptedItems: (c) => isStringList(c.acceptedItems, { maximumEntries: 40 }),
  aliases: (c) => isStringList(c.aliases, { maximumEntries: 20 }),
  summary: (c) => isBoundedString(c.summary, 600),
  address: (c) => c.address === undefined || c.address === null || isBoundedString(c.address, 200),
  geo: (c) => c.geo === undefined || isServiceGeo(c.geo),
  suburb: (c) => isBoundedString(c.suburb, 100),
  postcode: (c) => typeof c.postcode === 'string' && POSTCODE_PATTERN.test(c.postcode),
  searchAreas: (c) => isStringList(c.searchAreas, { maximumEntries: 20 }),
  status: (c) => SERVICE_STATUSES.includes(c.status),
  source: (c) =>
    isPlainObject(c.source) &&
    hasExactKeys(c.source, SOURCE_KEYS) &&
    isBoundedString(c.source.organisation, 150) &&
    isHttpsUrl(c.source.url) &&
    isCalendarDate(c.source.checkedAt),
  itemCategories: (c) =>
    c.itemCategories === undefined ||
    (isStringList(c.itemCategories, { minimumEntries: 0, maximumEntries: 10, maximumLength: 40 }) &&
      c.itemCategories.every((id) => ITEM_CATEGORY_IDS.includes(id))),
  acceptanceConditions: (c) => optionalList(c.acceptanceConditions, 8, 200),
  preparation: (c) => optionalList(c.preparation, 8, 200),
  access: (c) => optionalList(c.access, 6, 200),
  openingHours: (c) => optionalList(c.openingHours, 8, 100),
  cost: (c) => c.cost === undefined || isNullableBoundedString(c.cost, 200),
  revision: (c) => c.revision === undefined || (Number.isInteger(c.revision) && c.revision >= 1),
  createdAt: (c) => toIsoTimestamp(c.createdAt) !== null,
  updatedAt: (c) => toIsoTimestamp(c.updatedAt) !== null,
})

/** @returns {{ isValid: boolean, errors: Record<string, string> }} one reason per failing field */
export function validateService(candidate) {
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

/** A validated public record with ISO timestamps and defaults, or null (skip-and-count). */
export function projectService(documentId, candidate) {
  if (
    !ID_PATTERN.test(documentId) ||
    !validateService(candidate).isValid ||
    candidate.id !== documentId
  ) {
    return null
  }
  return {
    ...candidate,
    source: { ...candidate.source },
    address: candidate.address ?? null,
    geo: candidate.geo ?? null,
    // Hybrid: a declared list is kept; an absent or empty one is derived from the
    // accepted items and aliases, so documents written before the field existed and envelopes still get category matches.
    itemCategories: candidate.itemCategories?.length
      ? [...candidate.itemCategories]
      : deriveItemCategories(candidate),
    acceptanceConditions: candidate.acceptanceConditions ? [...candidate.acceptanceConditions] : [],
    preparation: candidate.preparation ? [...candidate.preparation] : [],
    access: candidate.access ? [...candidate.access] : [],
    openingHours: candidate.openingHours ? [...candidate.openingHours] : [],
    cost: candidate.cost ?? null,
    revision: candidate.revision ?? 1,
    createdAt: toIsoTimestamp(candidate.createdAt),
    updatedAt: toIsoTimestamp(candidate.updatedAt),
  }
}

/** `catalogues/current`, HEAD shape. */
export function projectCatalogueMetadata(candidate) {
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
