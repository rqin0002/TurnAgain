const ACTIVITY_TYPES = new Set(['repair', 'reuse', 'workshop'])
const ACTIVITY_SORTS = new Set(['soonest', 'title-asc', 'title-desc'])
const PUBLIC_SESSION_STATUSES = new Set(['scheduled', 'full', 'cancelled'])

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

const compareText = (left, right) =>
  String(left ?? '').localeCompare(String(right ?? ''), 'en-AU', {
    numeric: true,
    sensitivity: 'base',
  })

const toTime = (value) => {
  const time = Date.parse(value)
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

const isCurrentOrFuture = (session, now) =>
  PUBLIC_SESSION_STATUSES.has(session?.status) && toTime(session?.endsAt) > now.getTime()

const getActivitySessions = (activityId, sessions, now) =>
  sessions
    .filter((session) => session?.activityId === activityId && isCurrentOrFuture(session, now))
    .sort((left, right) => toTime(left.startsAt) - toTime(right.startsAt))

const matchesSearch = (activity, activitySessions, query) => {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean)
  if (tokens.length === 0) {
    return true
  }

  const haystack = normalizeForSearch([
    activity.title,
    activity.summary,
    activity.providerName,
    activity.suitableItems,
    activitySessions.map((session) => [session.venueName, session.suburb, session.postcode]),
  ])
  return tokens.every((token) => haystack.includes(token))
}

/** Normalizes public activity filters from route or component state. */
export function normalizeActivityCriteria(input = {}) {
  const type = normalizeText(input.type, 20)
  const sort = normalizeText(input.sort, 20)

  return {
    search: normalizeText(input.q ?? input.search),
    type: ACTIVITY_TYPES.has(type) ? type : '',
    sort: ACTIVITY_SORTS.has(sort) ? sort : 'soonest',
  }
}

/** Serializes non-default public activity criteria into a shareable URL. */
export function toActivityQuery(criteria) {
  const safe = normalizeActivityCriteria(criteria)
  return {
    ...(safe.search ? { q: safe.search } : {}),
    ...(safe.type ? { type: safe.type } : {}),
    ...(safe.sort !== 'soonest' ? { sort: safe.sort } : {}),
  }
}

/**
 * Joins activities to future sessions, then filters and sorts without mutating
 * Firestore-projected records.
 */
export function buildActivityCatalogue(activities, sessions, criteria = {}, now = new Date()) {
  const sourceActivities = Array.isArray(activities) ? activities : []
  const sourceSessions = Array.isArray(sessions) ? sessions : []
  const safe = normalizeActivityCriteria(criteria)

  const rows = sourceActivities
    .map((activity) => {
      const activitySessions = getActivitySessions(activity.id, sourceSessions, now)
      return {
        activity,
        sessions: activitySessions,
        // Keep cancellation visible when every remaining session is cancelled.
        nextSession:
          activitySessions.find((session) => session.status !== 'cancelled') ??
          activitySessions[0] ??
          null,
      }
    })
    .filter(
      ({ activity, sessions: activitySessions }) =>
        (!safe.type || activity.activityType === safe.type) &&
        matchesSearch(activity, activitySessions, safe.search),
    )

  rows.sort((left, right) => {
    if (safe.sort === 'title-asc') {
      return compareText(left.activity.title, right.activity.title)
    }
    if (safe.sort === 'title-desc') {
      return compareText(right.activity.title, left.activity.title)
    }

    return (
      toTime(left.nextSession?.startsAt) - toTime(right.nextSession?.startsAt) ||
      compareText(left.activity.title, right.activity.title)
    )
  })

  return rows
}

export const formatActivityType = (value) =>
  ({ repair: 'Repair', reuse: 'Reuse', workshop: 'Workshop' })[value] ?? 'Activity'

export const formatSessionStatus = (value) =>
  ({
    scheduled: 'Scheduled',
    full: 'Full',
    cancelled: 'Cancelled',
    completed: 'Completed',
  })[value] ?? 'Status unavailable'

export const formatSessionDate = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'full',
    timeZone: 'Australia/Melbourne',
  }).format(date)
}

export const formatSessionTime = (startsAt, endsAt) => {
  const starts = new Date(startsAt)
  const ends = new Date(endsAt)
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    return 'Time unavailable'
  }

  const formatter = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Melbourne',
  })
  return `${formatter.format(starts)}–${formatter.format(ends)}`
}

/**
 * Returns a numeric remainder only when the provider supplied a complete
 * capacity pair. Null is meaningful: it must not be presented as zero places.
 */
export const getRemainingCapacity = (session) => {
  const capacity = session?.capacity
  const bookedCount = session?.bookedCount

  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    !Number.isInteger(bookedCount) ||
    bookedCount < 0 ||
    bookedCount > capacity
  ) {
    return null
  }

  return Math.max(0, capacity - bookedCount)
}

/** Builds public availability copy without inventing external capacity data. */
export const formatSessionAvailability = (session) => {
  if (!session || ['full', 'cancelled', 'completed'].includes(session.status)) {
    return ''
  }

  const remaining = getRemainingCapacity(session)
  if (remaining !== null && remaining > 0) {
    return `${remaining} ${remaining === 1 ? 'place' : 'places'} remaining`
  }

  if (session.registrationType === 'provider') {
    return 'Availability managed by provider'
  }

  if (session.registrationType === 'drop-in') {
    return 'Drop-in; no booking required'
  }

  return 'Availability requires confirmation'
}
