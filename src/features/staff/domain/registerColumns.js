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
 * The column specs of the two registers (spec 8.3 L991, contract section 2.2). Each column's
 * `text(row)` is what the cell shows and what the CSV and JSON carry (M6-D6), so the export equals
 * the screen; `value(row)` is what it sorts on. Every data column has a sort and its own filter
 * (D.3). Pure.
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

/** Spec 8.2 L985 copy. */
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

export const SERVICE_COLUMNS = Object.freeze([
  {
    key: 'service',
    label: 'Service',
    value: (row) => row.name,
    sort: 'text',
    filter: 'text',
    searchValues: (row) => [row.name, row.aliases],
  },
  {
    key: 'actions',
    label: 'Actions',
    value: actionsText,
    text: actionsText,
    sort: 'text',
    filter: 'select',
    options: ACTION_OPTIONS,
    matchValues: (row) => [...(row.actionTypes ?? [])],
  },
  {
    key: 'location',
    label: 'Location',
    value: (row) => row.suburb,
    text: (row) => `${row.suburb} ${row.postcode}`,
    sort: 'text',
    filter: 'text',
    searchValues: (row) => [row.suburb, row.postcode, row.address, row.searchAreas],
  },
  {
    key: 'items',
    label: 'Items',
    value: (row) => row.acceptedItems?.length ?? 0,
    text: itemsText,
    sort: 'number',
    filter: 'text',
    searchValues: (row) => [row.acceptedItems, (row.itemCategories ?? []).map(categoryLabel)],
  },
  {
    key: 'source',
    label: 'Source',
    value: (row) => row.source?.organisation ?? '',
    sort: 'text',
    filter: 'text',
    searchValues: (row) => [row.source?.organisation, row.source?.url],
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
  },
  {
    key: 'status',
    label: 'Status',
    value: (row) => row.status,
    text: (row) => optionLabel(SERVICE_STATUS_OPTIONS, row.status),
    sort: 'text',
    filter: 'select',
    options: SERVICE_STATUS_OPTIONS,
  },
])

export const SERVICE_DEFAULT_SORT = Object.freeze({ key: 'service', direction: 'asc' })

const whenText = (row) =>
  `${formatDate(row.startsAt, { dateStyle: 'medium' })}, ${formatTimeRange(row.startsAt, row.endsAt)}`
const bookedText = (row) => {
  const remaining = getRemainingCapacity(row)
  return remaining === null
    ? 'Provider managed'
    : `${row.bookedCount}/${row.capacity} booked, ${remaining} remaining`
}
const waitlistText = (row) =>
  Number.isInteger(row.waitlistCount) ? String(row.waitlistCount) : 'Not tracked'

export const SESSION_COLUMNS = Object.freeze([
  {
    key: 'activity',
    label: 'Activity',
    value: (row) => row.activityTitle,
    sort: 'text',
    filter: 'text',
  },
  {
    key: 'date',
    label: 'Date and time',
    value: (row) => row.startsAt,
    text: whenText,
    sort: 'date',
    filter: 'text',
    searchValues: (row) => [whenText(row)],
  },
  {
    key: 'location',
    label: 'Location',
    value: (row) => row.venueName,
    text: (row) => `${row.venueName}, ${row.suburb}`,
    sort: 'text',
    filter: 'text',
    searchValues: (row) => [row.venueName, row.address, row.suburb, row.postcode],
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
  },
  {
    key: 'type',
    label: 'Type',
    value: (row) => row.registrationType,
    text: (row) => optionLabel(SESSION_TYPE_OPTIONS, row.registrationType),
    sort: 'text',
    filter: 'select',
    options: SESSION_TYPE_OPTIONS,
  },
  {
    key: 'status',
    label: 'Status',
    value: (row) => row.status,
    text: (row) => formatSessionStatus(row.status),
    sort: 'text',
    filter: 'select',
    options: SESSION_STATUS_OPTIONS,
  },
])

export const SESSION_DEFAULT_SORT = Object.freeze({ key: 'date', direction: 'asc' })

/** Session rows with the joined activity title ("Activity" when unknown, invariant 12). */
export const toSessionRows = (sessions, activities) => withActivityTitles(sessions, activities)

const ACTIVITY_STATUS_LABELS = Object.freeze({ published: 'Published', archived: 'Archived' })
const OPEN_STATUSES = Object.freeze(['scheduled', 'full'])

/** The Activities section of the Sessions page (spec 8.1): one entry per activity, by title. */
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
