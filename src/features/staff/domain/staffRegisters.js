import {
  formatSessionDate,
  formatSessionStatus,
  formatSessionTime,
  getRemainingCapacity,
} from '../../activities/domain/activityCatalogue.js'
import { formatActionType, formatCheckedDate } from '../../discovery/domain/servicePresentation.js'

const ACTION_FILTERS = new Set(['repair', 'reuse', 'recycle'])
const SERVICE_SORT_OPTIONS = new Set([
  'name-asc',
  'name-desc',
  'location-asc',
  'location-desc',
  'checked-asc',
  'checked-desc',
])
const SESSION_STATUSES = new Set(['scheduled', 'full', 'cancelled', 'completed'])
const SESSION_SORT_OPTIONS = new Set([
  'date-asc',
  'date-desc',
  'activity-asc',
  'activity-desc',
  'capacity-asc',
  'capacity-desc',
])
const REGISTER_PAGE_SIZE = 10

const firstValue = (value) => (Array.isArray(value) ? value[0] : value)

const normalizeText = (value, maximumLength = 100) => {
  const candidate = firstValue(value)
  return typeof candidate === 'string'
    ? candidate.trim().replace(/\s+/gu, ' ').slice(0, maximumLength)
    : ''
}

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

const normalizeForSearch = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')

const matchesTokens = (values, query) => {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean)
  if (tokens.length === 0) {
    return true
  }

  const haystack = normalizeForSearch(values.flat().join(' '))
  return tokens.every((token) => haystack.includes(token))
}

const compareText = (left, right) =>
  String(left ?? '').localeCompare(String(right ?? ''), 'en-AU', {
    numeric: true,
    sensitivity: 'base',
  })

/** Both registers share stable ordering and bounded pages without mutating source records. */
const sortAndPaginate = (records, compareRecords, requestedPage) => {
  const sorted = records
    .map((record, sourceIndex) => ({ record, sourceIndex }))
    .sort(
      (left, right) =>
        compareRecords(left.record, right.record) || left.sourceIndex - right.sourceIndex,
    )
    .map(({ record }) => record)

  const totalResults = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalResults / REGISTER_PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const startIndex = (page - 1) * REGISTER_PAGE_SIZE
  const rows = sorted.slice(startIndex, startIndex + REGISTER_PAGE_SIZE)

  return {
    rows,
    totalResults,
    totalPages,
    page,
    pageStart: totalResults === 0 ? 0 : startIndex + 1,
    pageEnd: Math.min(startIndex + rows.length, totalResults),
  }
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
    sort: SERVICE_SORT_OPTIONS.has(sort) ? sort : 'name-asc',
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

const toStringList = (value) =>
  Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []

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

  return sortAndPaginate(
    filtered,
    (left, right) => compareServices(left, right, safe.sort),
    safe.page,
  )
}

/** Keeps records with unpublished capacity after all numeric records in either direction. */
const compareCapacity = (left, right, direction) => {
  const leftRemaining = getRemainingCapacity(left)
  const rightRemaining = getRemainingCapacity(right)

  if (leftRemaining === null && rightRemaining === null) {
    return 0
  }
  if (leftRemaining === null) {
    return 1
  }
  if (rightRemaining === null) {
    return -1
  }

  return direction === 'desc' ? rightRemaining - leftRemaining : leftRemaining - rightRemaining
}

const compareSessions = (left, right, sort) => {
  switch (sort) {
    case 'date-desc':
      return compareText(right?.startsAt, left?.startsAt)
    case 'activity-asc':
      return compareText(left?.activityTitle, right?.activityTitle)
    case 'activity-desc':
      return compareText(right?.activityTitle, left?.activityTitle)
    case 'capacity-asc':
      return compareCapacity(left, right, 'asc')
    case 'capacity-desc':
      return compareCapacity(left, right, 'desc')
    default:
      return compareText(left?.startsAt, right?.startsAt)
  }
}

/** Converts prefixed staff-session URL values into the bounded table contract. */
export function normalizeActivitySessionCriteria(input = {}) {
  const status = normalizeText(input.sstatus ?? input.status, 20)
  const sort = normalizeText(input.ssort ?? input.sort, 30)

  return {
    search: normalizeText(input.sq ?? input.search),
    status: SESSION_STATUSES.has(status) ? status : '',
    location: normalizeText(input.slocation ?? input.location),
    sort: SESSION_SORT_OPTIONS.has(sort) ? sort : 'date-asc',
    page: normalizePage(input.spage ?? input.page),
  }
}

/** Serializes staff session criteria without colliding with Service Register keys. */
export function toActivitySessionQuery(criteria) {
  const safe = normalizeActivitySessionCriteria(criteria)

  return {
    ...(safe.search ? { sq: safe.search } : {}),
    ...(safe.status ? { sstatus: safe.status } : {}),
    ...(safe.location ? { slocation: safe.location } : {}),
    ...(safe.sort !== 'date-asc' ? { ssort: safe.sort } : {}),
    ...(safe.page > 1 ? { spage: String(safe.page) } : {}),
  }
}

/** Filters, stably sorts, and paginates validated activity-session records. */
export function buildActivitySessionPage(sessions, criteria = {}) {
  const source = Array.isArray(sessions) ? sessions : []
  const safe = normalizeActivitySessionCriteria(criteria)

  const filtered = source.filter((session) => {
    const remaining = getRemainingCapacity(session)
    // Global search includes rendered columns, not just underlying title and
    // location fields. Null capacity stays unknown rather than matching zero.
    const capacityValues =
      remaining === null
        ? ['provider', 'drop-in'].includes(session?.registrationType)
          ? ['Provider managed']
          : []
        : [`${session.bookedCount}/${session.capacity} booked`, `${remaining} remaining`]
    const globalValues = [
      session?.activityTitle,
      session?.venueName,
      session?.address,
      session?.suburb,
      session?.postcode,
      session?.status,
      formatSessionStatus(session?.status),
      session?.startsAt,
      formatSessionDate(session?.startsAt),
      formatSessionTime(session?.startsAt, session?.endsAt),
      capacityValues,
      Number.isInteger(session?.waitlistCount) ? session.waitlistCount : '',
      session?.participantNotice,
    ]
    const locationValues = [
      session?.venueName,
      session?.address,
      session?.suburb,
      session?.postcode,
    ]

    return (
      matchesTokens(globalValues, safe.search) &&
      matchesTokens(locationValues, safe.location) &&
      (!safe.status || session?.status === safe.status)
    )
  })

  return sortAndPaginate(
    filtered,
    (left, right) => compareSessions(left, right, safe.sort),
    safe.page,
  )
}
