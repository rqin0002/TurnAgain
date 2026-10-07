import {
  categoryLabel,
  deriveItemCategories,
  resolveItemQuery,
} from '@/features/discovery/domain/itemCategories.js'
import { normalizeForSearch } from '@/features/discovery/domain/textNormalization.js'
import { normalizePagination } from '@/shared/domain/pagination.js'
import { formatDate, formatTimeRange } from '@/shared/domain/formatDate.js'

const ACTIVITY_TYPES = new Set(['repair', 'reuse', 'workshop'])
const ACTIVITY_SORTS = new Set(['soonest', 'title-asc', 'title-desc'])
const PUBLIC_SESSION_STATUSES = new Set(['scheduled', 'full', 'cancelled'])

/** The List | Calendar control (spec 3.6 `?view=calendar`, M5-D9); the list is the default. */
export const ACTIVITY_VIEWS = Object.freeze(['list', 'calendar'])

const firstValue = (value) => (Array.isArray(value) ? value[0] : value)

const normalizeText = (value, maximumLength = 100) => {
  const candidate = firstValue(value)
  return typeof candidate === 'string'
    ? candidate.trim().replace(/\s+/gu, ' ').slice(0, maximumLength)
    : ''
}

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

/** The categories an activity's `suitableItems` resolve to (spec 6.1: the same matcher). */
const activityCategories = (activity) =>
  deriveItemCategories({ acceptedItems: activity?.suitableItems ?? [], aliases: [] })

const intersects = (left, right) => left.some((id) => right.includes(id))

/**
 * The activities search box keeps its text containment over title, summary, provider, suitable
 * items and venues; a row also matches when the query resolves to a category one of its suitable
 * items belongs to ("appliances" finds the repair cafe that lists "microwave").
 */
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
  if (tokens.every((token) => haystack.includes(token))) {
    return true
  }
  const { categoryIds } = resolveItemQuery(query)
  return categoryIds.length > 0 && intersects(categoryIds, activityCategories(activity))
}

/** `'calendar'` only for exactly that value; anything else is the list. */
export const normalizeActivityView = (value) =>
  firstValue(value) === 'calendar' ? 'calendar' : 'list'

/** Normalizes public activity filters from route or component state. */
export function normalizeActivityCriteria(input = {}) {
  const type = normalizeText(input.type, 20)
  const sort = normalizeText(input.sort, 20)

  return {
    search: normalizeText(input.q ?? input.search),
    type: ACTIVITY_TYPES.has(type) ? type : '',
    sort: ACTIVITY_SORTS.has(sort) ? sort : 'soonest',
    view: normalizeActivityView(input.view),
    ...normalizePagination(input),
  }
}

/** Serializes non-default public activity criteria into a shareable URL. */
export function toActivityQuery(criteria) {
  const safe = normalizeActivityCriteria(criteria)
  return {
    ...(safe.search ? { q: safe.search } : {}),
    ...(safe.type ? { type: safe.type } : {}),
    ...(safe.sort !== 'soonest' ? { sort: safe.sort } : {}),
    ...(safe.page !== 1 ? { page: String(safe.page) } : {}),
    ...(safe.pageSize !== 10 ? { pageSize: String(safe.pageSize) } : {}),
    ...(safe.view === 'calendar' ? { view: 'calendar' } : {}),
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
      return (
        compareText(left.activity.title, right.activity.title) ||
        compareText(left.activity.id, right.activity.id)
      )
    }
    if (safe.sort === 'title-desc') {
      return (
        compareText(right.activity.title, left.activity.title) ||
        compareText(left.activity.id, right.activity.id)
      )
    }

    return (
      toTime(left.nextSession?.startsAt) - toTime(right.nextSession?.startsAt) ||
      compareText(left.activity.title, right.activity.title) ||
      compareText(left.activity.id, right.activity.id)
    )
  })

  return rows
}

/**
 * The "Repair Cafe Clayton also fixes small appliances, next session ..." rows of Find Nearby
 * (spec 6.1): the activities whose suitable items share a category with the resolved query and
 * have an upcoming session that is not cancelled, soonest first, at most three. `categoryLabel`
 * is the label of the first shared category in table order; an unresolved query yields nothing.
 *
 * @returns {Array<{ activity: object, nextSession: object, categoryLabel: string }>}
 */
export function selectRelatedActivities(activities, sessions, resolved, now = new Date()) {
  const categoryIds = Array.isArray(resolved?.categoryIds) ? resolved.categoryIds : []
  if (categoryIds.length === 0) return []
  return buildActivityCatalogue(activities, sessions, {}, now)
    .filter(({ nextSession }) => nextSession !== null && nextSession.status !== 'cancelled')
    .map((row) => {
      const shared = categoryIds.find((id) => activityCategories(row.activity).includes(id))
      return shared === undefined
        ? null
        : {
            activity: row.activity,
            nextSession: row.nextSession,
            categoryLabel: categoryLabel(shared),
          }
    })
    .filter((row) => row !== null)
    .sort((left, right) => toTime(left.nextSession.startsAt) - toTime(right.nextSession.startsAt))
    .slice(0, 3)
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

export const formatSessionDate = (value) => formatDate(value)

export const formatSessionTime = (startsAt, endsAt) => formatTimeRange(startsAt, endsAt)

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

/**
 * Sessions carry no title (C7). The UI derives the current activity title from the activities it
 * has already loaded; "Activity" stands in until the join resolves. Display-only: the value is
 * never written back.
 */
export function withActivityTitles(sessions, activities) {
  const titles = new Map((Array.isArray(activities) ? activities : []).map((a) => [a.id, a.title]))
  return (Array.isArray(sessions) ? sessions : []).map((session) => ({
    ...session,
    activityTitle: titles.get(session.activityId) ?? 'Activity',
  }))
}
