/**
 * Pure helpers for the public REST API (spec 5.4): the field whitelist that makes the
 * "published only, public fields only" guarantee true, the query grammar, word matching and
 * paging. No Firebase import, so the root Vitest suite tests it without an emulator.
 */

export const ACTIONS = Object.freeze(['repair', 'reuse', 'recycle'])
export const SORTS = Object.freeze(['name-asc', 'name-desc'])
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50
const MAX_QUERY_LENGTH = 100
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
const SEARCHABLE_FIELDS = Object.freeze(['name', 'acceptedItems', 'aliases', 'summary', 'suburb'])

export const isServiceId = (value) => typeof value === 'string' && ID_PATTERN.test(value)

const toIso = (value) => {
  if (typeof value?.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const isString = (value) => typeof value === 'string'
const stringOrUndefined = (value) => (isString(value) ? value : undefined)
const stringList = (value) => (Array.isArray(value) ? value.filter(isString) : undefined)
const compact = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined))
const GEO_PRECISIONS = Object.freeze(['venue', 'area'])

/**
 * `source` carries exactly organisation, url and checkedAt (spec 4.2); anything else is dropped,
 * and a source with none of them is omitted rather than published as `{}`, as `publicGeo` does.
 */
const publicSource = (source) => {
  if (!source || typeof source !== 'object') return undefined
  const projected = compact({
    organisation: stringOrUndefined(source.organisation),
    url: stringOrUndefined(source.url),
    checkedAt: stringOrUndefined(source.checkedAt),
  })
  return Object.keys(projected).length > 0 ? projected : undefined
}

/** `geo` is null or exactly latitude, longitude, precision, sourceUrl, checkedAt (spec 4.2). */
const publicGeo = (geo) => {
  if (geo === null) return null
  if (!geo || typeof geo !== 'object') return undefined
  if (
    !Number.isFinite(geo.latitude) ||
    !Number.isFinite(geo.longitude) ||
    !GEO_PRECISIONS.includes(geo.precision)
  ) {
    return undefined
  }
  return compact({
    latitude: geo.latitude,
    longitude: geo.longitude,
    precision: geo.precision,
    sourceUrl: stringOrUndefined(geo.sourceUrl),
    checkedAt: stringOrUndefined(geo.checkedAt),
  })
}

/**
 * One projector per public field. The function reads with the Admin SDK, which the rules do not
 * govern, so this table is the only filter between a stored document and the public JSON: unknown
 * top-level keys, unknown nested keys and non-string list entries never leave the function.
 */
const PROJECTIONS = Object.freeze({
  name: stringOrUndefined,
  summary: stringOrUndefined,
  actionTypes: stringList,
  itemCategories: stringList,
  acceptedItems: stringList,
  aliases: stringList,
  suburb: stringOrUndefined,
  postcode: stringOrUndefined,
  address: stringOrUndefined,
  searchAreas: stringList,
  geo: publicGeo,
  openingHours: stringList,
  acceptanceConditions: stringList,
  preparation: stringList,
  access: stringList,
  cost: (value) => (value === null || isString(value) ? value : undefined),
  source: publicSource,
})

/** The public whitelist (spec 5.4), derived from the projectors so the two cannot drift. */
export const PUBLIC_FIELDS = Object.freeze(['id', ...Object.keys(PROJECTIONS), 'updatedAt'])

/** The public projection of a stored service: whitelisted keys only, nested shapes fixed, `updatedAt` as ISO. */
export function toPublicService(id, data) {
  const record = { id }
  for (const [field, project] of Object.entries(PROJECTIONS)) {
    if (data[field] === undefined) continue
    const value = project(data[field])
    if (value !== undefined) record[field] = value
  }
  record.updatedAt = toIso(data.updatedAt)
  return record
}

const normalise = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-AU')

const words = (value) =>
  normalise(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** Every query word appears as a whole word in one of the searchable fields; an empty query matches. */
export function matchesQuery(record, q) {
  const needles = words(q)
  if (needles.length === 0) return true
  const haystack = new Set(
    SEARCHABLE_FIELDS.flatMap((field) => {
      const value = record[field]
      return (Array.isArray(value) ? value : [value]).flatMap(words)
    }),
  )
  return needles.every((needle) => haystack.has(needle))
}

const first = (value) => (Array.isArray(value) ? value[0] : value)
const list = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value])

const positiveInt = (raw, fallback) => {
  if (raw === undefined) return fallback
  if (typeof raw !== 'string' || !/^\d+$/u.test(raw)) return null
  const number = Number(raw)
  return number >= 1 && Number.isSafeInteger(number) ? number : null
}

/**
 * The query grammar of spec 5.4. Repeated scalar keys take their first value; `action` may repeat.
 * @returns {{ ok: true, value: { q: string, actions: string[], sort: string, page: number, pageSize: number } } | { ok: false, fields: Record<string, string> }}
 */
export function parseApiQuery(query = {}) {
  const fields = {}

  const rawQ = first(query.q)
  const q = typeof rawQ === 'string' ? rawQ.trim().slice(0, MAX_QUERY_LENGTH) : ''

  const actions = [...new Set(list(query.action).map(String))]
  if (actions.some((action) => !ACTIONS.includes(action))) {
    fields.action = `must be one of ${ACTIONS.join(', ')}`
  }

  const sort = first(query.sort) ?? SORTS[0]
  if (!SORTS.includes(sort)) {
    fields.sort = `must be one of ${SORTS.join(', ')}`
  }

  const page = positiveInt(first(query.page), 1)
  if (page === null) {
    fields.page = 'must be a positive integer'
  }

  const pageSize = positiveInt(first(query.pageSize), DEFAULT_PAGE_SIZE)
  if (pageSize === null || pageSize > MAX_PAGE_SIZE) {
    fields.pageSize = `must be an integer between 1 and ${MAX_PAGE_SIZE}`
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return { ok: true, value: { q, actions, sort, page, pageSize } }
}

/** One collator for every comparison: building one per call costs ~30x at the 1,000-record cap. */
const NAME_COLLATOR = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' })
const ID_COLLATOR = new Intl.Collator('en-AU')

/** Name in the requested direction, then id ascending in both directions so paging is stable. */
const byName = (direction) => (left, right) =>
  direction * NAME_COLLATOR.compare(String(left.name ?? ''), String(right.name ?? '')) ||
  ID_COLLATOR.compare(String(left.id), String(right.id))

/** Word match, then every requested action must be present, then a stable name sort. */
export function selectServices(records, { q, actions, sort }) {
  const selected = records.filter(
    (record) =>
      matchesQuery(record, q) &&
      actions.every(
        (action) => Array.isArray(record.actionTypes) && record.actionTypes.includes(action),
      ),
  )
  return [...selected].sort(byName(sort === 'name-desc' ? -1 : 1))
}

/** The list envelope of spec 5.4; a page past the end is empty, never clamped, so clients can detect it. */
export function pageServices(records, { page, pageSize }) {
  const total = records.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize
  return { data: records.slice(start, start + pageSize), page, pageSize, total, totalPages }
}
