/**
 * The four booking emails (spec 5.5, 5.11): subject, plain text and HTML for one booking. Pure:
 * the caller converts Firestore Timestamps to ISO strings first and attaches the calendar file
 * itself. Every user string in the HTML goes through `escapeHtml`; `itemDescription` is never read
 * (spec 4.3 L272: what the member brings stays between the member and staff).
 */

import { formatSessionWhen } from './melbourneTime.js'
import { formatVenueLine } from './venue.js'

export const BOOKING_EMAIL_KINDS = Object.freeze([
  'confirmed',
  'waitlisted',
  'cancelled',
  'promoted',
])

/** The kinds whose email carries the booking's .ics (D7, spec 13.1 L1201). */
export const ICS_EMAIL_KINDS = Object.freeze(['confirmed', 'promoted'])

export const bookingEmailHasIcs = (kind) => ICS_EMAIL_KINDS.includes(kind)

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text safe inside HTML element content and quoted attribute values. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => HTML_ESCAPES[character])
}

const SUBJECTS = {
  confirmed: (title) => `Your TurnAgain booking is confirmed: ${title}`,
  waitlisted: (title) => `You're on the TurnAgain waitlist: ${title}`,
  cancelled: (title) => `Your TurnAgain booking is cancelled: ${title}`,
  promoted: (title) => `A place is now yours: ${title}`,
}

const LEADS = {
  confirmed: (title) => `Your place at ${title} is confirmed.`,
  waitlisted: (title) =>
    `You're on the waitlist for ${title}. If a place opens up for you, we'll email you.`,
  cancelled: (title) => `Your booking for ${title} is cancelled.`,
  promoted: (title) =>
    `A place opened up and is now yours: your booking for ${title} is confirmed.`,
}

const MANAGE_LINE = 'To see or cancel this booking, sign in to TurnAgain and open My bookings.'
const CALENDAR_LINE = 'A calendar file (.ics) for this session is attached.'

/**
 * `booking` is `{ reference, contactName, venueName, address, suburb, postcode, startsAt, endsAt }`
 * with ISO instants. The Where line is left out when no venue part is present. Throws TypeError
 * for a kind outside BOOKING_EMAIL_KINDS.
 */
export function buildBookingEmail({ kind, booking, activityTitle }) {
  if (!BOOKING_EMAIL_KINDS.includes(kind)) {
    throw new TypeError(`buildBookingEmail: unknown kind ${kind}`)
  }
  const when = formatSessionWhen(booking.startsAt, booking.endsAt)
  const where = formatVenueLine(booking)
  const details = [
    ['Reference', booking.reference],
    ['When', when],
    ...(where ? [['Where', where]] : []),
  ]
  const closing = [...(bookingEmailHasIcs(kind) ? [CALENDAR_LINE] : []), MANAGE_LINE]
  const greeting = `Hello ${booking.contactName},`
  const lead = LEADS[kind](activityTitle)

  const text = [
    greeting,
    '',
    lead,
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    ...closing,
    '',
    'TurnAgain',
    '',
  ].join('\n')

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(lead)}</p>`,
    `<p>${details.map(([label, value]) => `<strong>${label}:</strong> ${escapeHtml(value)}`).join('<br>')}</p>`,
    ...closing.map((line) => `<p>${escapeHtml(line)}</p>`),
    '<p>TurnAgain</p>',
  ].join('\n')

  return { subject: SUBJECTS[kind](activityTitle), text, html }
}
