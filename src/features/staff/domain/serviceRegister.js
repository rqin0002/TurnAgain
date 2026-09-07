import { formatActionType, formatCheckedDate } from '../../discovery/domain/servicePresentation.js'

const ACTION_FILTERS = new Set(['repair', 'reuse', 'recycle'])
const SORT_OPTIONS = new Set([
  'name-asc',
  'name-desc',
  'location-asc',
  'location-desc',
  'checked-asc',
  'checked-desc',
])

export const SERVICE_REGISTER_PAGE_SIZE = 10

const firstValue = (value) => (Array.isArray(value) ? value[0] : value)

const normalizeText = (value, maximumLength = 100) => {
  const candidate = firstValue(value)
  return typeof candidate === 'string'
    ? candidate.trim().replace(/\s+/gu, ' ').slice(0, maximumLength)
    : ''
}

const normalizeForSearch = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')

const toStringList = (value) =>
  Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []

const normalizePage = (value) => {
  const candidate = firstValue(value)
  if (typeof candidate !== 'string' && typeof candidate !== 'number') {
    return 1
  }

  const text = String(candidate)
  if (!/^\d{1,5}$/u.test(text)) {
    return 1
  }

  const page = Number.parseInt(text, 10)
  return Number.isSafeInteger(page) && page >= 1 ? page : 1
}

/**
 * Converts route-query or component criteria into the bounded Service Register contract.
 * Unknown action and sort values fail closed to the public catalogue defaults.
 *
 * @param {Record<string, unknown>} [input={}] Untrusted route or component values.
 * @returns {{ search: string, action: string, location: string, sort: string, page: number }}
 */
export function normalizeServiceRegisterCriteria(input = {}) {
  const action = normalizeText(input.action, 20)
  const sort = normalizeText(input.sort, 30)

  return {
    search: normalizeText(input.q ?? input.search),
    action: ACTION_FILTERS.has(action) ? action : '',
    location: normalizeText(input.location),
    sort: SORT_OPTIONS.has(sort) ? sort : 'name-asc',
    page: normalizePage(input.page),
  }
}

/**
 * Serializes only non-default criteria so staff filters remain shareable without noisy URLs.
 *
 * @param {Record<string, unknown>} criteria Candidate Service Register state.
 * @returns {Record<string, string>} Safe Vue Router query values.
 */
export function toServiceRegisterQuery(criteria) {
  const safe = normalizeServiceRegisterCriteria(criteria)

  return {
    ...(safe.search ? { q: safe.search } : {}),
    ...(safe.action ? { action: safe.action } : {}),
    ...(safe.location ? { location: safe.location } : {}),
    ...(safe.sort !== 'name-asc' ? { sort: safe.sort } : {}),
    ...(safe.page > 1 ? { page: String(safe.page) } : {}),
  }
}

const matchesTokens = (values, query) => {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean)
  if (tokens.length === 0) {
    return true
  }

  const haystack = normalizeForSearch(values.flat().join(' '))
  return tokens.every((token) => haystack.includes(token))
}

const getGlobalSearchValues = (service) => [
  service?.name,
  service?.summary,
  service?.suburb,
  service?.postcode,
  service?.address,
  service?.source?.organisation,
  service?.source?.checkedAt,
  formatCheckedDate(service?.source?.checkedAt),
  service?.status,
  toStringList(service?.actionTypes),
  toStringList(service?.actionTypes).map(formatActionType),
  toStringList(service?.acceptedItems),
  toStringList(service?.aliases),
]

const getLocationSearchValues = (service) => [
  service?.address,
  service?.suburb,
  service?.postcode,
  toStringList(service?.searchAreas),
]

const getLocationLabel = (service) => `${service?.suburb ?? ''} ${service?.postcode ?? ''}`.trim()

const compareText = (left, right) =>
  String(left ?? '').localeCompare(String(right ?? ''), 'en-AU', {
    numeric: true,
    sensitivity: 'base',
  })

const compareServices = (left, right, sort) => {
  switch (sort) {
    case 'name-desc':
      return compareText(right?.name, left?.name)
    case 'location-asc':
      return compareText(getLocationLabel(left), getLocationLabel(right))
    case 'location-desc':
      return compareText(getLocationLabel(right), getLocationLabel(left))
    case 'checked-asc':
      return compareText(left?.source?.checkedAt, right?.source?.checkedAt)
    case 'checked-desc':
      return compareText(right?.source?.checkedAt, left?.source?.checkedAt)
    default:
      return compareText(left?.name, right?.name)
  }
}

/**
 * Filters, stably sorts, and paginates public service records for staff review.
 * The source array and service objects are never mutated.
 *
 * @param {unknown} services Validated public catalogue records.
 * @param {Record<string, unknown>} [criteria={}] Search, filter, sort, and page state.
 * @returns {{
 *   rows: object[],
 *   totalResults: number,
 *   totalPages: number,
 *   page: number,
 *   pageStart: number,
 *   pageEnd: number
 * }} Current table page and result metadata.
 */
export function buildServiceRegisterPage(services, criteria = {}) {
  const source = Array.isArray(services) ? services : []
  const safe = normalizeServiceRegisterCriteria(criteria)

  const filtered = source.filter((service) => {
    const actions = new Set(toStringList(service?.actionTypes))
    return (
      matchesTokens(getGlobalSearchValues(service), safe.search) &&
      matchesTokens(getLocationSearchValues(service), safe.location) &&
      (!safe.action || actions.has(safe.action))
    )
  })

  const sorted = filtered
    .map((service, sourceIndex) => ({ service, sourceIndex }))
    .sort(
      (left, right) =>
        compareServices(left.service, right.service, safe.sort) ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ service }) => service)

  const totalResults = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalResults / SERVICE_REGISTER_PAGE_SIZE))
  const page = Math.min(safe.page, totalPages)
  const startIndex = (page - 1) * SERVICE_REGISTER_PAGE_SIZE
  const rows = sorted.slice(startIndex, startIndex + SERVICE_REGISTER_PAGE_SIZE)

  return {
    rows,
    totalResults,
    totalPages,
    page,
    pageStart: totalResults === 0 ? 0 : startIndex + 1,
    pageEnd: Math.min(startIndex + rows.length, totalResults),
  }
}
