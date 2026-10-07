/**
 * iCalendar files (RFC 5545; spec 5.11, decision M5-D7). Pure: the booking email, the session
 * broadcast and the SPA's "Add to calendar" Blob build their files here. Times are written in UTC
 * (`Z`), so no VTIMEZONE is needed; lines end in CRLF and fold at 75 octets counted in UTF-8 bytes;
 * TEXT values escape backslash, semicolon, comma and newline. `stamp` (DTSTAMP) is passed in by
 * the caller, so the same input always gives the same file. Person-written text (the title, the
 * venue) is sanitised, never refused: an Add to calendar click or a confirmation email must not
 * fail because a title holds a control character.
 */

import { hasControlCharacter, isControlCodePoint } from './controlCharacters.js'
import { toDate } from './melbourneTime.js'
import { formatVenueLine } from './venue.js'

export const ICS_PRODID = '-//TurnAgain//Bookings//EN'
export const ICS_VERSION = '2.0'
export const SESSION_ICS_FILE_NAME = 'session.ics'

const CRLF = '\r\n'
const MAX_LINE_OCTETS = 75
const METHODS = [null, 'PUBLISH']
const STATUSES = ['CONFIRMED', 'CANCELLED']
/** SUMMARY when the title is empty, or holds nothing but control characters and spaces. */
const FALLBACK_SUMMARY = 'TurnAgain session'
const MAIL_ADDRESS = /^[^\s@;:,"<>]+@[^\s@;:,"<>]+$/u

/** 20261011T230000Z for a Date or an ISO string; throws TypeError when the value is not a time. */
export function toIcsUtc(value) {
  const date = toDate(value)
  if (!date) {
    throw new TypeError('toIcsUtc needs a valid Date or ISO string')
  }
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/u, 'Z')
    .replace(/[-:]/gu, '')
}

/**
 * RFC 5545 3.3.11 TEXT: backslash, semicolon and comma escaped; every line break becomes \n; any
 * other control character except a tab is dropped, because TEXT cannot carry it.
 */
export function escapeIcsText(value) {
  const escaped = String(value ?? '')
    .replace(/\\/gu, '\\\\')
    .replace(/;/gu, '\\;')
    .replace(/,/gu, '\\,')
    .replace(/\r\n|\r|\n/gu, '\\n')
  return Array.from(escaped)
    .filter((character) => character === '\t' || !isControlCodePoint(character.codePointAt(0)))
    .join('')
}

const utf8Length = (codePoint) => {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

/**
 * Folds one content line (RFC 5545 3.1): at most 75 octets per physical line, continuation lines
 * start with one space and so carry at most 74 octets of content, and a multi-byte character is
 * never split.
 */
export function foldIcsLine(line) {
  const physical = []
  let current = ''
  let octets = 0
  let limit = MAX_LINE_OCTETS
  for (const character of line) {
    const size = utf8Length(character.codePointAt(0))
    if (octets + size > limit) {
      physical.push(current)
      current = ''
      octets = 0
      limit = MAX_LINE_OCTETS - 1
    }
    current += character
    octets += size
  }
  physical.push(current)
  return physical.join(`${CRLF} `)
}

/** The UID is built by this module from document ids, so a malformed one is a programming error. */
const requireUid = (value) => {
  if (typeof value !== 'string' || value === '' || hasControlCharacter(value)) {
    throw new TypeError('buildIcs: uid must be a non-empty single-line string')
  }
  return value
}

/** The escaped SUMMARY: controls dropped by escapeIcsText, an empty result replaced. */
const summaryText = (summary) => {
  const escaped = escapeIcsText(summary)
  return escaped.trim() === '' ? FALLBACK_SUMMARY : escaped
}

/**
 * One VCALENDAR with one VEVENT. `method` is null (a plain file: the booking attachment and the
 * client Blob) or 'PUBLISH' (the session broadcast), and PUBLISH requires `organizer` (RFC 5546
 * 3.2.1). Empty `location` and `description` are left out; an empty `summary` becomes
 * 'TurnAgain session'; every line is folded and ends in CRLF.
 */
export function buildIcs({
  uid,
  sequence = 0,
  method = null,
  status = 'CONFIRMED',
  summary,
  description = '',
  location = '',
  start,
  end,
  stamp,
  organizer = null,
}) {
  requireUid(uid)
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new TypeError('buildIcs: sequence must be a non-negative integer')
  }
  if (!METHODS.includes(method)) {
    throw new TypeError(`buildIcs: unknown method ${method}`)
  }
  if (!STATUSES.includes(status)) {
    throw new TypeError(`buildIcs: unknown status ${status}`)
  }
  if (organizer !== null && (typeof organizer !== 'string' || !MAIL_ADDRESS.test(organizer))) {
    throw new TypeError('buildIcs: organizer must be an email address')
  }
  if (method === 'PUBLISH' && organizer === null) {
    throw new TypeError('buildIcs: METHOD:PUBLISH requires an organizer')
  }
  const lines = [
    'BEGIN:VCALENDAR',
    `VERSION:${ICS_VERSION}`,
    `PRODID:${ICS_PRODID}`,
    ...(method ? [`METHOD:${method}`] : []),
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(stamp)}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${summaryText(summary)}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    ...(organizer ? [`ORGANIZER;CN=TurnAgain:mailto:${organizer}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldIcsLine).join(CRLF) + CRLF
}

export const bookingIcsUid = (bookingId) => `booking-${bookingId}@turnagain`
export const sessionIcsUid = (sessionId) => `session-${sessionId}@turnagain`
export const bookingIcsFileName = (reference) => `turnagain-${reference}.ics`

/**
 * The booking's own file (email attachment and the client Blob): no METHOD, so no organizer and no
 * MAIL_FROM in the browser. `booking` holds ISO instants (`startsAt`, `endsAt`).
 */
export function buildBookingIcs(booking, { stamp }) {
  return buildIcs({
    uid: bookingIcsUid(booking.id),
    sequence: 0,
    method: null,
    status: 'CONFIRMED',
    summary: booking.activityTitle,
    location: formatVenueLine(booking),
    description: `TurnAgain booking ${booking.reference}. This calendar file does not follow later changes to the session.`,
    start: booking.startsAt,
    end: booking.endsAt,
    stamp,
  })
}

/**
 * session.ics for the staff broadcast (spec 5.5): METHOD:PUBLISH with the sender as organizer; a
 * cancelled session publishes STATUS:CANCELLED with SEQUENCE:1, so a calendar that imported the
 * first file retracts the event. `session` holds ISO instants.
 */
export function buildSessionIcs({ sessionId, session, activityTitle, organizer, stamp }) {
  const cancelled = session.status === 'cancelled'
  return buildIcs({
    uid: sessionIcsUid(sessionId),
    sequence: cancelled ? 1 : 0,
    method: 'PUBLISH',
    status: cancelled ? 'CANCELLED' : 'CONFIRMED',
    summary: activityTitle,
    location: formatVenueLine(session),
    start: session.startsAt,
    end: session.endsAt,
    stamp,
    organizer,
  })
}
