import { melbourneDayKey } from '@shared/melbourneTime.js'

import {
  formatActivityType,
  formatSessionStatus,
  getRemainingCapacity,
  withActivityTitles,
} from '@/features/activities/domain/activityCatalogue.js'
import { categoryLabel } from '@/features/discovery/domain/itemCategories.js'
import { formatCheckedDate } from '@/features/discovery/domain/servicePresentation.js'
import { isCalendarDate } from '@/shared/domain/catalogueValidation.js'
import { formatDate, formatTimeRange } from '@/shared/domain/formatDate.js'
import { compareText } from '@/shared/domain/tableQuery.js'

/**
 * The column specs of the two registers. Each column's `text(row)` is what the cell shows and
 * what the CSV and JSON carry, so the export equals the screen; `value(row)` is what it sorts
 * on. Every data column has a sort and its own filter; Actions filters on any of several actions.
 * A session's Booked text depends on its registration mode and on whether it is still open.
 * `width`, `nowrap` and `wrap` are layout hints for the wide table and `quickFilter` keeps a
 * filter in view; none of them changes data. Pure.
 */

const DAY_MS = 86_400_000
export const STALE_SOURCE_DAYS = 180

/** Whole Melbourne days from a `YYYY-MM-DD` date to the Melbourne day of `now`; null otherwise. */
export function daysSinceChecked(calendarDate, now) {
  const today = melbourneDayKey(now)
  if (!isCalendarDate(calendarDate) || today === null) {
    return null
  }
  return Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${calendarDate}T00:00:00Z`)) / DAY_MS,
  )
}

export const isStaleSource = (service, now) => {
  const days = daysSinceChecked(service?.source?.checkedAt, now)
  return days !== null && days > STALE_SOURCE_DAYS
}

export const staleSourceLabel = (days) => `Stale: last checked ${days} days ago`

const optionLabel = (options, value) =>
  options.find((option) => option.value === value)?.label ?? String(value ?? '')

const ACTION_OPTIONS = Object.freeze([
  { value: 'repair', label: 'Repair' },
  { value: 'reuse', label: 'Reuse' },
  { value: 'recycle', label: 'Recycle' },
])
const ON_MAP_OPTIONS = Object.freeze([
  { value: 'yes', label: 'Yes' },
  { value: 'area', label: 'Area only' },
  { value: 'no', label: 'No' },
])
const SERVICE_STATUS_OPTIONS = Object.freeze([
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
])
const SESSION_TYPE_OPTIONS = Object.freeze([
  { value: 'turnagain', label: 'TurnAgain' },
  { value: 'provider', label: 'Provider' },
  { value: 'drop-in', label: 'Drop-in' },
])
const SESSION_STATUS_OPTIONS = Object.freeze(
  ['scheduled', 'full', 'cancelled', 'completed'].map((value) => ({
    value,
    label: formatSessionStatus(value),
  })),
)

const actionsText = (row) =>
  (row.actionTypes ?? []).map((action) => optionLabel(ACTION_OPTIONS, action)).join(', ')
const onMapValue = (row) => {
  if (!row.geo) return 'no'
  return row.geo.precision === 'venue' ? 'yes' : 'area'
}
const itemsText = (row) => {
  const count = row.acceptedItems?.length ?? 0
  return count === 1 ? '1 item' : `${count} items`
}

// The Items filter finds a row by its accepted items and the names of its categories.
const itemsSearch = (categoryIndex) => (row) => [
  row.acceptedItems,
  (row.itemCategories ?? []).map((id) => categoryLabel(id, categoryIndex)),
]

export const SERVICE_COLUMNS = Object.freeze([
  {
    key: 'service',
    label: 'Service',
    value: (row) => row.name,
    sort: 'text',
    filter: 'text',
    searchValues: (row) => [row.name, row.aliases],
    placeholder: 'Name or alias…',
    width: 'wide',
    wrap: true,
    quickFilter: true,
  },
  {
    key: 'actions',
    label: 'Actions',
    value: actionsText,
    text: actionsText,
    sort: 'text',
    filter: 'multi',
    options: ACTION_OPTIONS,
    matchValues: (row) => [...(row.actionTypes ?? [])],
    nowrap: true,
  },
  {
    key: 'location',
    label: 'Location',
    value: (row) => row.suburb,
    text: (row) => `${row.suburb} ${row.postcode}`,
    sort: 'text',
    filter: 'text',
    searchValues: (row) => [row.suburb, row.postcode, row.address, row.searchAreas],
    placeholder: 'Suburb or postcode…',
    nowrap: true,
  },
  {
    key: 'items',
    label: 'Items',
    value: (row) => row.acceptedItems?.length ?? 0,
    text: itemsText,
    sort: 'number',
    filter: 'text',
    searchValues: itemsSearch(),
    width: 'narrow',
    nowrap: true,
  },
  {
    key: 'source',
    label: 'Source',
    value: (row) => row.source?.organisation ?? '',
    sort: 'text',
    filter: 'text',
    searchValues: (row) => [row.source?.organisation, row.source?.url],
    wrap: true,
  },
  {
    key: 'checked',
    label: 'Source checked',
    value: (row) => row.source?.checkedAt ?? null,
    text: (row) => formatCheckedDate(row.source?.checkedAt),
    sort: 'date',
    filter: 'text',
    nullsLast: true,
    searchValues: (row) => [formatCheckedDate(row.source?.checkedAt), row.source?.checkedAt],
  },
  {
    key: 'onmap',
    label: 'On map',
    value: onMapValue,
    text: (row) => optionLabel(ON_MAP_OPTIONS, onMapValue(row)),
    sort: 'text',
    filter: 'select',
    options: ON_MAP_OPTIONS,
    anyLabel: 'On map: any',
    width: 'narrow',
    nowrap: true,
  },
  {
    key: 'status',
    label: 'Status',
    value: (row) => row.status,
    text: (row) => optionLabel(SERVICE_STATUS_OPTIONS, row.status),
    sort: 'text',
    filter: 'select',
    options: SERVICE_STATUS_OPTIONS,
    width: 'narrow',
    nowrap: true,
    quickFilter: true,
  },
])

/**
 * The Service Register's columns with the Items filter reading category names from
 * `categoryIndex` (useItemCategories' index), so a row is found by the name of a category an admin
 * added. SERVICE_COLUMNS is the same with the twelve only.
 */
export function serviceColumnsFor(categoryIndex) {
  return Object.freeze(
    SERVICE_COLUMNS.map((column) =>
      column.key === 'items' ? { ...column, searchValues: itemsSearch(categoryIndex) } : column,
    ),
  )
}

export const SERVICE_DEFAULT_SORT = Object.freeze({ key: 'service', direction: 'asc' })

/** A session's day ("12 Oct 2030") and time range, the two lines of the register's date cell. */
export const sessionWhen = (row) => ({
  day: formatDate(row.startsAt, { dateStyle: 'medium' }),
  time: formatTimeRange(row.startsAt, row.endsAt),
})
const whenText = (row) => {
  const { day, time } = sessionWhen(row)
  return `${day}, ${time}`
}

const OPEN_STATUSES = Object.freeze(['scheduled', 'full'])
// Why a session has no booking counts on the platform, by its registration mode.
const NO_COUNTS_TEXT = Object.freeze({
  provider: 'Provider managed',
  'drop-in': 'Drop-in, no booking',
})

/** Whether the platform holds a usable capacity and booked count for the session. */
export const hasBookingCounts = (row) => getRemainingCapacity(row) !== null
/** Whether the platform tracks the session's waitlist. */
export const hasWaitlistCount = (row) => Number.isInteger(row.waitlistCount)

// The counts while the session is open; once it is cancelled or completed it takes no more
// bookings, so the counts are history and say nothing about places. Without usable counts the
// registration mode explains why; a TurnAgain session always has counts, so its missing counts
// read "Not recorded" rather than a mode that is not its own.
const bookedText = (row) => {
  const remaining = getRemainingCapacity(row)
  if (remaining === null) {
    return NO_COUNTS_TEXT[row.registrationType] ?? 'Not recorded'
  }
  const counts = `${row.bookedCount}/${row.capacity} booked`
  return OPEN_STATUSES.includes(row.status) ? `${counts}, ${remaining} remaining` : counts
}
const waitlistText = (row) => (hasWaitlistCount(row) ? String(row.waitlistCount) : 'Not tracked')

export const SESSION_COLUMNS = Object.freeze([
  {
    key: 'activity',
    label: 'Activity',
    value: (row) => row.activityTitle,
    sort: 'text',
    filter: 'text',
    width: 'wide',
    wrap: true,
    quickFilter: true,
  },
  {
    key: 'date',
    label: 'Date and time',
    value: (row) => row.startsAt,
    text: whenText,
    sort: 'date',
    filter: 'text',
    searchValues: (row) => [whenText(row)],
    nowrap: true,
  },
  {
    key: 'location',
    label: 'Location',
    value: (row) => row.venueName,
    text: (row) => `${row.venueName}, ${row.suburb}`,
    sort: 'text',
    filter: 'text',
    searchValues: (row) => [row.venueName, row.address, row.suburb, row.postcode],
    placeholder: 'Venue or suburb…',
    width: 'wide',
    wrap: true,
  },
  {
    key: 'booked',
    label: 'Booked',
    value: getRemainingCapacity,
    text: bookedText,
    sort: 'number',
    filter: 'text',
    nullsLast: true,
    searchValues: (row) => [bookedText(row)],
  },
  {
    key: 'waitlist',
    label: 'Waitlist',
    value: (row) => (Number.isInteger(row.waitlistCount) ? row.waitlistCount : null),
    text: waitlistText,
    sort: 'number',
    filter: 'text',
    nullsLast: true,
    searchValues: (row) => [waitlistText(row)],
    width: 'narrow',
    nowrap: true,
  },
  // How people register for the session (TurnAgain, Provider, Drop-in), not the activity type;
  // the URL key stays `type` so existing links keep working.
  {
    key: 'type',
    label: 'Registration',
    value: (row) => row.registrationType,
    text: (row) => optionLabel(SESSION_TYPE_OPTIONS, row.registrationType),
    sort: 'text',
    filter: 'select',
    options: SESSION_TYPE_OPTIONS,
    width: 'narrow',
    nowrap: true,
    quickFilter: true,
  },
  {
    key: 'status',
    label: 'Status',
    value: (row) => row.status,
    text: (row) => formatSessionStatus(row.status),
    sort: 'text',
    filter: 'select',
    options: SESSION_STATUS_OPTIONS,
    width: 'narrow',
    nowrap: true,
    quickFilter: true,
  },
])

export const SESSION_DEFAULT_SORT = Object.freeze({ key: 'date', direction: 'asc' })

/** Session rows with the joined activity title ("Activity" when unknown). */
export const toSessionRows = (sessions, activities) => withActivityTitles(sessions, activities)

const ACTIVITY_STATUS_LABELS = Object.freeze({ published: 'Published', archived: 'Archived' })

/** The Activities section of the Sessions page: one entry per activity, by title. */
export function summariseActivities(activities, sessions, now) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)
  const list = Array.isArray(sessions) ? sessions : []
  return (Array.isArray(activities) ? activities : [])
    .map((activity) => ({
      id: activity.id,
      title: activity.title,
      activityType: activity.activityType,
      typeLabel: formatActivityType(activity.activityType),
      status: activity.status,
      statusLabel: ACTIVITY_STATUS_LABELS[activity.status] ?? activity.status,
      upcomingCount: list.filter(
        (session) =>
          session.activityId === activity.id &&
          OPEN_STATUSES.includes(session.status) &&
          Date.parse(session.startsAt) > nowMs,
      ).length,
    }))
    .sort((left, right) => compareText(left.title, right.title) || compareText(left.id, right.id))
}
