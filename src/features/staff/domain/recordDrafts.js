import { MELBOURNE_TIME_ZONE, melbourneDayKey } from '@shared/melbourneTime.js'

import { ACTIVITY_STATUSES, ACTIVITY_TYPES } from '@/features/activities/domain/activitySchema.js'
import { REGISTRATION_TYPES } from '@/features/activities/domain/sessionSchema.js'
import { ITEM_CATEGORY_IDS } from '@/features/discovery/domain/itemCategories.js'
import {
  GEO_PRECISIONS,
  SERVICE_ACTIONS,
  SERVICE_STATUSES,
} from '@/features/discovery/domain/serviceSchema.js'
import {
  ID_PATTERN,
  POSTCODE_PATTERN,
  isCalendarDate,
  isHttpsUrl,
} from '@/shared/domain/catalogueValidation.js'

/**
 * The three staff forms' drafts: every text field a string, every list one entry per line,
 * numbers as strings, a session's date and times in Melbourne wall time. The validators check
 * every field type (required and length, pattern, list bounds with
 * every element checked, numeric range, cross-field) against the bounds the rules and the schema
 * modules hold, and turn a valid draft into the record the writers store. Pure.
 */

export const GEO_PRECISION_HELP =
  "Choose 'area' when the source publishes no exact venue; never enter coordinates that the source does not give"
export const SESSION_LOCK_MESSAGE =
  'This session has bookings, so its time, venue and activity are locked. To change them, cancel this session, create a new one and email the participants.'

// Victoria's bounding box: a pin outside it is a typing or source error.
const VICTORIA = Object.freeze({ south: -39.2, north: -33.9, west: 140.9, east: 150.0 })
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/u
const HOUR_MS = 3_600_000
const MELBOURNE_OFFSET_HOURS = [11, 10]

export const isInsideVictoria = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= VICTORIA.south &&
  latitude <= VICTORIA.north &&
  longitude >= VICTORIA.west &&
  longitude <= VICTORIA.east

/** "Clayton Repair Hub" -> "clayton-repair-hub": lower case, [a-z0-9] runs, at most 60 characters. */
export function recordIdFrom(text) {
  const runs =
    String(text ?? '')
      .normalize('NFKD')
      .toLowerCase()
      .match(/[a-z0-9]+/gu) ?? []
  return runs.join('-').slice(0, 60).replace(/-+$/u, '')
}

const lines = (text) =>
  String(text ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
const joinLines = (list) => (Array.isArray(list) ? list.join('\n') : '')
const text = (value) => String(value ?? '').trim()
const orNull = (value) => (text(value) === '' ? null : text(value))

// ---- Melbourne wall time <-> instants ----------------------------------------------------------

const wallFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: MELBOURNE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "HH:mm" in Melbourne for an ISO instant. */
const melbourneTime = (iso) => wallFormat.format(new Date(iso))

/**
 * The instant at which Melbourne's clock reads `date` `time`, or null when that wall time does not
 * exist (the skipped hour when daylight saving starts). The repeated hour when it ends resolves to
 * the earlier instant.
 */
export function melbourneInstant(date, time) {
  if (!isCalendarDate(date) || !TIME_PATTERN.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hours, minutes)
  for (const offset of MELBOURNE_OFFSET_HOURS) {
    const candidate = new Date(wall - offset * HOUR_MS)
    if (melbourneDayKey(candidate) === date && melbourneTime(candidate) === time) {
      return candidate.toISOString()
    }
  }
  return null
}

// ---- messages ---------------------------------------------------------------------------------

const required = (label) => `Enter ${label}.`
const tooLong = (maximum) => `Use ${maximum.toLocaleString('en-AU')} characters or fewer.`
const HTTPS = 'Enter a link that starts with https://.'
const POSTCODE = 'Enter a four-digit postcode.'

const checkText = (value, { label, maximum, optional = false }) => {
  const trimmed = text(value)
  if (trimmed === '') return optional ? '' : required(label)
  return trimmed.length > maximum ? tooLong(maximum) : ''
}
const checkList = (value, { label, minimum, maximum, entryMaximum }) => {
  const entries = lines(value)
  if (entries.length < minimum) {
    return minimum === 1 ? `List at least one ${label}, one per line.` : ''
  }
  if (entries.length > maximum) return `List at most ${maximum} entries, one per line.`
  if (entries.some((entry) => entry.length > entryMaximum)) {
    return `Keep each line to ${entryMaximum} characters or fewer.`
  }
  return ''
}
const checkCheckedDate = (value, now) => {
  if (!isCalendarDate(value)) return 'Enter the date you checked the source.'
  return value > melbourneDayKey(now) ? 'The checked date cannot be in the future.' : ''
}
const checkHttps = (value) => (isHttpsUrl(text(value)) ? '' : HTTPS)
const checkId = (value, isNew) => {
  if (!isNew) return ''
  if (text(value) === '') return 'Enter an id for the address of this record.'
  return ID_PATTERN.test(text(value))
    ? ''
    : 'Use letters, digits, hyphens and underscores, starting with a letter or digit.'
}

const result = (errors, values) => ({
  isValid: Object.values(errors).every((message) => message === ''),
  errors,
  values,
})

// ---- services -----------------------------------------------------------------------------------

export function blankServiceDraft() {
  return {
    id: '',
    name: '',
    actionTypes: [],
    acceptedItems: '',
    aliases: '',
    summary: '',
    address: '',
    suburb: '',
    postcode: '',
    searchAreas: '',
    status: 'published',
    sourceOrganisation: '',
    sourceUrl: '',
    sourceCheckedAt: '',
    itemCategories: [],
    acceptanceConditions: '',
    preparation: '',
    access: '',
    openingHours: '',
    cost: '',
    showOnMap: false,
    latitude: '',
    longitude: '',
    precision: 'venue',
    geoSourceUrl: '',
    geoCheckedAt: '',
    revision: 0,
    createdAt: null,
  }
}

export function toServiceDraft(record) {
  return {
    id: record.id,
    name: record.name,
    actionTypes: [...record.actionTypes],
    acceptedItems: joinLines(record.acceptedItems),
    aliases: joinLines(record.aliases),
    summary: record.summary,
    address: record.address ?? '',
    suburb: record.suburb,
    postcode: record.postcode,
    searchAreas: joinLines(record.searchAreas),
    status: record.status,
    sourceOrganisation: record.source.organisation,
    sourceUrl: record.source.url,
    sourceCheckedAt: record.source.checkedAt,
    itemCategories: [...record.itemCategories],
    acceptanceConditions: joinLines(record.acceptanceConditions),
    preparation: joinLines(record.preparation),
    access: joinLines(record.access),
    openingHours: joinLines(record.openingHours),
    cost: record.cost ?? '',
    showOnMap: record.geo !== null,
    latitude: record.geo ? String(record.geo.latitude) : '',
    longitude: record.geo ? String(record.geo.longitude) : '',
    precision: record.geo?.precision ?? 'venue',
    geoSourceUrl: record.geo?.sourceUrl ?? '',
    geoCheckedAt: record.geo?.checkedAt ?? '',
    revision: record.revision,
    createdAt: record.createdAt,
  }
}

const parseCoordinate = (value) => (text(value) === '' ? Number.NaN : Number(text(value)))

export function validateServiceDraft(draft, { isNew = false, now = new Date() } = {}) {
  const latitude = parseCoordinate(draft.latitude)
  const longitude = parseCoordinate(draft.longitude)
  const errors = {
    id: checkId(draft.id, isNew),
    name: checkText(draft.name, { label: 'the service name', maximum: 150 }),
    actionTypes:
      draft.actionTypes.length > 0 &&
      draft.actionTypes.every((action) => SERVICE_ACTIONS.includes(action))
        ? ''
        : 'Choose at least one action.',
    acceptedItems: checkList(draft.acceptedItems, {
      label: 'accepted item',
      minimum: 1,
      maximum: 40,
      entryMaximum: 100,
    }),
    aliases: checkList(draft.aliases, {
      label: 'other name people use',
      minimum: 1,
      maximum: 20,
      entryMaximum: 100,
    }),
    summary: checkText(draft.summary, { label: 'a summary', maximum: 600 }),
    address: checkText(draft.address, { label: 'the address', maximum: 200, optional: true }),
    suburb: checkText(draft.suburb, { label: 'the suburb', maximum: 100 }),
    postcode: POSTCODE_PATTERN.test(text(draft.postcode)) ? '' : POSTCODE,
    searchAreas: checkList(draft.searchAreas, {
      label: 'suburb or area served',
      minimum: 1,
      maximum: 20,
      entryMaximum: 100,
    }),
    status: SERVICE_STATUSES.includes(draft.status) ? '' : 'Choose a status.',
    sourceOrganisation: checkText(draft.sourceOrganisation, {
      label: 'the source organisation',
      maximum: 150,
    }),
    sourceUrl: checkHttps(draft.sourceUrl),
    sourceCheckedAt: checkCheckedDate(draft.sourceCheckedAt, now),
    itemCategories:
      draft.itemCategories.length <= 10 &&
      draft.itemCategories.every((id) => ITEM_CATEGORY_IDS.includes(id))
        ? ''
        : 'Choose at most 10 item categories.',
    acceptanceConditions: checkList(draft.acceptanceConditions, {
      minimum: 0,
      maximum: 8,
      entryMaximum: 200,
    }),
    preparation: checkList(draft.preparation, { minimum: 0, maximum: 8, entryMaximum: 200 }),
    access: checkList(draft.access, { minimum: 0, maximum: 6, entryMaximum: 200 }),
    openingHours: checkList(draft.openingHours, { minimum: 0, maximum: 8, entryMaximum: 100 }),
    cost: checkText(draft.cost, { label: 'the cost', maximum: 200, optional: true }),
    latitude: '',
    longitude: '',
    precision: '',
    geoSourceUrl: '',
    geoCheckedAt: '',
  }
  if (draft.showOnMap) {
    errors.latitude = Number.isFinite(latitude) ? '' : 'Enter the latitude as a number.'
    errors.longitude = Number.isFinite(longitude) ? '' : 'Enter the longitude as a number.'
    if (!errors.latitude && !errors.longitude && !isInsideVictoria(latitude, longitude)) {
      errors.latitude = 'These coordinates are outside Victoria.'
    }
    errors.precision = GEO_PRECISIONS.includes(draft.precision) ? '' : 'Choose venue or area.'
    errors.geoSourceUrl = checkHttps(draft.geoSourceUrl)
    errors.geoCheckedAt = checkCheckedDate(draft.geoCheckedAt, now)
  }
  return result(errors, {
    id: text(draft.id),
    name: text(draft.name),
    actionTypes: SERVICE_ACTIONS.filter((action) => draft.actionTypes.includes(action)),
    acceptedItems: lines(draft.acceptedItems),
    aliases: lines(draft.aliases),
    summary: text(draft.summary),
    address: orNull(draft.address),
    suburb: text(draft.suburb),
    postcode: text(draft.postcode),
    searchAreas: lines(draft.searchAreas),
    status: draft.status,
    source: {
      organisation: text(draft.sourceOrganisation),
      url: text(draft.sourceUrl),
      checkedAt: draft.sourceCheckedAt,
    },
    geo: draft.showOnMap
      ? {
          latitude,
          longitude,
          precision: draft.precision,
          sourceUrl: text(draft.geoSourceUrl),
          checkedAt: draft.geoCheckedAt,
        }
      : null,
    itemCategories: [...draft.itemCategories],
    acceptanceConditions: lines(draft.acceptanceConditions),
    preparation: lines(draft.preparation),
    access: lines(draft.access),
    openingHours: lines(draft.openingHours),
    cost: orNull(draft.cost),
    revision: draft.revision,
    createdAt: draft.createdAt,
  })
}

// ---- activities ---------------------------------------------------------------------------------

export function blankActivityDraft() {
  return {
    id: '',
    title: '',
    summary: '',
    activityType: 'repair',
    suitableItems: '',
    acceptedConditions: '',
    excludedConditions: '',
    costLabel: '',
    whatToBring: '',
    accessibilityLabel: '',
    cancellationLabel: '',
    providerName: '',
    providerUrl: '',
    sourceCheckedAt: '',
    status: 'published',
    revision: 0,
    createdAt: null,
  }
}

export function toActivityDraft(record) {
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    activityType: record.activityType,
    suitableItems: joinLines(record.suitableItems),
    acceptedConditions: joinLines(record.acceptedConditions),
    excludedConditions: joinLines(record.excludedConditions),
    costLabel: record.costLabel,
    whatToBring: joinLines(record.whatToBring),
    accessibilityLabel: record.accessibilityLabel,
    cancellationLabel: record.cancellationLabel,
    providerName: record.providerName,
    providerUrl: record.providerUrl,
    sourceCheckedAt: record.sourceCheckedAt,
    status: record.status,
    revision: record.revision,
    createdAt: record.createdAt,
  }
}

const activityList = (value, label, minimum = 1) =>
  checkList(value, { label, minimum, maximum: 12, entryMaximum: 160 })

export function validateActivityDraft(draft, { isNew = false, now = new Date() } = {}) {
  const errors = {
    id: checkId(draft.id, isNew),
    title: checkText(draft.title, { label: 'the activity title', maximum: 150 }),
    summary: checkText(draft.summary, { label: 'a summary', maximum: 1200 }),
    activityType: ACTIVITY_TYPES.includes(draft.activityType) ? '' : 'Choose a type.',
    suitableItems: activityList(draft.suitableItems, 'suitable item'),
    acceptedConditions: activityList(draft.acceptedConditions, 'accepted condition'),
    excludedConditions: activityList(draft.excludedConditions, 'excluded condition', 0),
    costLabel: checkText(draft.costLabel, { label: 'the cost', maximum: 300 }),
    whatToBring: activityList(draft.whatToBring, 'thing to bring'),
    accessibilityLabel: checkText(draft.accessibilityLabel, {
      label: 'the accessibility information',
      maximum: 500,
    }),
    cancellationLabel: checkText(draft.cancellationLabel, {
      label: 'the cancellation terms',
      maximum: 500,
    }),
    providerName: checkText(draft.providerName, { label: 'the provider name', maximum: 150 }),
    providerUrl: checkHttps(draft.providerUrl),
    sourceCheckedAt: checkCheckedDate(draft.sourceCheckedAt, now),
    status: ACTIVITY_STATUSES.includes(draft.status) ? '' : 'Choose a status.',
  }
  return result(errors, {
    id: text(draft.id),
    title: text(draft.title),
    summary: text(draft.summary),
    activityType: draft.activityType,
    suitableItems: lines(draft.suitableItems),
    acceptedConditions: lines(draft.acceptedConditions),
    excludedConditions: lines(draft.excludedConditions),
    costLabel: text(draft.costLabel),
    whatToBring: lines(draft.whatToBring),
    accessibilityLabel: text(draft.accessibilityLabel),
    cancellationLabel: text(draft.cancellationLabel),
    providerName: text(draft.providerName),
    providerUrl: text(draft.providerUrl),
    sourceCheckedAt: draft.sourceCheckedAt,
    status: draft.status,
    revision: draft.revision,
    createdAt: draft.createdAt,
  })
}

// ---- sessions -----------------------------------------------------------------------------------

export function blankSessionDraft({ activityId = '' } = {}) {
  return {
    id: '',
    activityId,
    date: '',
    startTime: '',
    endTime: '',
    venueName: '',
    address: '',
    suburb: '',
    postcode: '',
    capacity: '',
    registrationType: 'turnagain',
    registrationUrl: '',
    sourceCheckedAt: '',
    participantNotice: '',
    status: 'scheduled',
    bookedCount: null,
    waitlistCount: null,
    cancellationNoticeAt: null,
    storedStartsAt: null,
    storedEndsAt: null,
    revision: 0,
    createdAt: null,
  }
}

export function toSessionDraft(record) {
  return {
    id: record.id,
    activityId: record.activityId,
    date: melbourneDayKey(record.startsAt) ?? '',
    startTime: melbourneTime(record.startsAt),
    endTime: melbourneTime(record.endsAt),
    venueName: record.venueName,
    address: record.address,
    suburb: record.suburb,
    postcode: record.postcode,
    capacity: record.capacity === null ? '' : String(record.capacity),
    registrationType: record.registrationType,
    registrationUrl: record.registrationUrl ?? '',
    sourceCheckedAt: record.sourceCheckedAt,
    participantNotice: record.participantNotice ?? '',
    status: record.status,
    bookedCount: record.bookedCount,
    waitlistCount: record.waitlistCount,
    cancellationNoticeAt: record.cancellationNoticeAt,
    // The instants as stored, which a locked session saves unchanged: the wall time
    // above drops seconds, and in the hour daylight saving repeats it names two instants.
    storedStartsAt: record.startsAt,
    storedEndsAt: record.endsAt,
    revision: record.revision,
    createdAt: record.createdAt,
  }
}

/** Places taken or waited for: a session with any is locked. */
export const hasBookings = (session) =>
  (Number.isInteger(session?.bookedCount) ? session.bookedCount : 0) +
    (Number.isInteger(session?.waitlistCount) ? session.waitlistCount : 0) >
  0

/** The session draft fields the lock covers: the activity, the date and times, the venue. */
export const SESSION_LOCKED_FIELDS = Object.freeze([
  'activityId',
  'date',
  'startTime',
  'endTime',
  'venueName',
  'address',
  'suburb',
  'postcode',
])

const isWholeNumber = (value) => /^\d{1,5}$/u.test(text(value))

/**
 * `locked`: the activity, date, times and venue stay as loaded, so the checks that could
 * refuse an existing booked session (a start now in the past) do not run on them, and its start
 * and end are the stored instants, never rebuilt from the wall time. A session's registration
 * type is fixed once it exists: the counters of a TurnAgain session cannot become the null
 * counters of a provider one (the rules' counter equality).
 */
export function validateSessionDraft(
  draft,
  { isNew = false, now = new Date(), activities = [], locked = false, storedType = null } = {},
) {
  const startsAt = locked ? draft.storedStartsAt : melbourneInstant(draft.date, draft.startTime)
  const endsAt = locked ? draft.storedEndsAt : melbourneInstant(draft.date, draft.endTime)
  const turnagain = draft.registrationType === 'turnagain'
  const capacity = turnagain && isWholeNumber(draft.capacity) ? Number(text(draft.capacity)) : null
  const errors = {
    id: checkId(draft.id, isNew),
    activityId: activities.some((activity) => activity.id === draft.activityId)
      ? ''
      : 'Choose the activity.',
    date: '',
    startTime: '',
    endTime: '',
    venueName: checkText(draft.venueName, { label: 'the venue name', maximum: 150 }),
    address: checkText(draft.address, { label: 'the address', maximum: 200 }),
    suburb: checkText(draft.suburb, { label: 'the suburb', maximum: 100 }),
    postcode: POSTCODE_PATTERN.test(text(draft.postcode)) ? '' : POSTCODE,
    capacity: '',
    registrationType: REGISTRATION_TYPES.includes(draft.registrationType)
      ? ''
      : 'Choose how people register.',
    registrationUrl: '',
    sourceCheckedAt: checkCheckedDate(draft.sourceCheckedAt, now),
    participantNotice: checkText(draft.participantNotice, {
      label: 'a notice',
      maximum: 500,
      optional: true,
    }),
  }
  if (!locked) {
    if (!isCalendarDate(draft.date)) errors.date = 'Enter the date of the session.'
    if (!TIME_PATTERN.test(draft.startTime)) errors.startTime = 'Enter the start time.'
    else if (!errors.date && startsAt === null) {
      errors.startTime = 'This time does not exist in Melbourne (daylight saving starts).'
    }
    if (!TIME_PATTERN.test(draft.endTime)) errors.endTime = 'Enter the end time.'
    else if (!errors.date && endsAt === null) {
      errors.endTime = 'This time does not exist in Melbourne (daylight saving starts).'
    }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      errors.endTime = 'The session must end after it starts.'
    }
    if (isNew && startsAt && Date.parse(startsAt) <= now.getTime()) {
      errors.startTime = 'Choose a start time in the future.'
    }
  }
  if (turnagain) {
    if (capacity === null || capacity < 1 || capacity > 10000) {
      errors.capacity = 'Enter a capacity from 1 to 10,000.'
    } else if (Number.isInteger(draft.bookedCount) && capacity < draft.bookedCount) {
      errors.capacity = `Capacity cannot be lower than the ${draft.bookedCount} places already booked.`
    }
  }
  if (draft.registrationType === 'provider') {
    errors.registrationUrl = isHttpsUrl(text(draft.registrationUrl))
      ? ''
      : "Enter the provider's booking link (https://)."
  }
  if (!isNew && storedType && (storedType === 'turnagain') !== turnagain) {
    errors.registrationType =
      'A TurnAgain session cannot become a provider or drop-in session; create a new session instead.'
  }
  return result(errors, {
    id: text(draft.id),
    activityId: draft.activityId,
    startsAt,
    endsAt,
    venueName: text(draft.venueName),
    address: text(draft.address),
    suburb: text(draft.suburb),
    postcode: text(draft.postcode),
    capacity,
    registrationType: draft.registrationType,
    registrationUrl: draft.registrationType === 'provider' ? text(draft.registrationUrl) : null,
    sourceCheckedAt: draft.sourceCheckedAt,
    participantNotice: orNull(draft.participantNotice),
    status: draft.status,
    bookedCount: draft.bookedCount,
    waitlistCount: draft.waitlistCount,
    cancellationNoticeAt: draft.cancellationNoticeAt,
    revision: draft.revision,
    createdAt: draft.createdAt,
  })
}

// ---- labels and field mapping (the conflict list and the classified refusals) ---------------------

export const DRAFT_FIELD_LABELS = Object.freeze({
  services: Object.freeze({
    id: 'Id',
    name: 'Name',
    actionTypes: 'Actions',
    acceptedItems: 'Items accepted',
    aliases: 'Other names',
    summary: 'Summary',
    address: 'Address',
    suburb: 'Suburb',
    postcode: 'Postcode',
    searchAreas: 'Areas served',
    status: 'Status',
    sourceOrganisation: 'Source organisation',
    sourceUrl: 'Source link',
    sourceCheckedAt: 'Source checked',
    itemCategories: 'Item categories',
    acceptanceConditions: 'Acceptance conditions',
    preparation: 'Before you go',
    access: 'Access',
    openingHours: 'Opening hours',
    cost: 'Cost',
    showOnMap: 'Show on map',
    latitude: 'Latitude',
    longitude: 'Longitude',
    precision: 'Map precision',
    geoSourceUrl: 'Location source link',
    geoCheckedAt: 'Location checked',
  }),
  activities: Object.freeze({
    id: 'Id',
    title: 'Title',
    summary: 'Summary',
    activityType: 'Type',
    suitableItems: 'Suitable items',
    acceptedConditions: 'Accepted conditions',
    excludedConditions: 'Excluded conditions',
    costLabel: 'Cost',
    whatToBring: 'What to bring',
    accessibilityLabel: 'Accessibility',
    cancellationLabel: 'Cancellation',
    providerName: 'Provider',
    providerUrl: 'Provider link',
    sourceCheckedAt: 'Source checked',
    status: 'Status',
  }),
  sessions: Object.freeze({
    id: 'Id',
    activityId: 'Activity',
    date: 'Date',
    startTime: 'Starts',
    endTime: 'Ends',
    venueName: 'Venue',
    address: 'Address',
    suburb: 'Suburb',
    postcode: 'Postcode',
    capacity: 'Capacity',
    registrationType: 'Registration',
    registrationUrl: 'Booking link',
    sourceCheckedAt: 'Source checked',
    participantNotice: 'Notice for participants',
  }),
})

const STORED_TO_DRAFT = Object.freeze({
  services: Object.freeze({ source: 'sourceOrganisation', geo: 'latitude', keys: 'name' }),
  activities: Object.freeze({ keys: 'title', timestampsOrdered: 'sourceCheckedAt' }),
  sessions: Object.freeze({
    keys: 'venueName',
    startsAt: 'date',
    endsAt: 'endTime',
    status: 'capacity',
  }),
})

/** The form field that shows a stored field's refusal (useRecordForm's `fieldOf`). */
export const draftFieldOf = (kind, field) => STORED_TO_DRAFT[kind]?.[field] ?? field
