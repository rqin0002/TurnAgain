import {
  formatSessionDate,
  formatSessionStatus,
  formatSessionTime,
  getRemainingCapacity,
} from '../../activities/domain/activityCatalogue.js'

const SESSION_STATUSES = new Set(['scheduled', 'full', 'cancelled', 'completed'])
const SORT_OPTIONS = new Set([
  'date-asc',
  'date-desc',
  'activity-asc',
  'activity-desc',
  'capacity-asc',
  'capacity-desc',
])

export const ACTIVITY_SESSION_PAGE_SIZE = 10

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
    sort: SORT_OPTIONS.has(sort) ? sort : 'date-asc',
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

  const sorted = filtered
    .map((session, sourceIndex) => ({ session, sourceIndex }))
    .sort(
      (left, right) =>
        compareSessions(left.session, right.session, safe.sort) ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ session }) => session)

  const totalResults = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalResults / ACTIVITY_SESSION_PAGE_SIZE))
  const page = Math.min(safe.page, totalPages)
  const startIndex = (page - 1) * ACTIVITY_SESSION_PAGE_SIZE
  const rows = sorted.slice(startIndex, startIndex + ACTIVITY_SESSION_PAGE_SIZE)

  return {
    rows,
    totalResults,
    totalPages,
    page,
    pageStart: totalResults === 0 ? 0 : startIndex + 1,
    pageEnd: Math.min(startIndex + rows.length, totalResults),
  }
}
