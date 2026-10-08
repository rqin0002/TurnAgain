import { LIVE_BOOKING_STATUSES } from '@/features/bookings/domain/bookingRules.js'
import { formatDate, formatTime } from '@/shared/domain/formatDate.js'

/**
 * The participants of one session on the staff session page: the table columns (every cell's
 * text is also the export's text), the waitlist position the promotion follows (earliest
 * `waitlistedAt`, then the booking id), the selection modes, the recipient summary above Send,
 * the "recent promotion" window and the promotion copy. Bookings are the `projectBooking` shape.
 * Pure.
 */

const STATUS_OPTIONS = Object.freeze([
  Object.freeze({ value: 'confirmed', label: 'Confirmed' }),
  Object.freeze({ value: 'waitlisted', label: 'Waitlisted' }),
  Object.freeze({ value: 'cancelled', label: 'Cancelled' }),
])
const STATUS_LABELS = Object.freeze(
  Object.fromEntries(STATUS_OPTIONS.map(({ value, label }) => [value, label])),
)

/** "2 Oct 2026, 10:00 am" in Melbourne time, or '' for no instant. */
const melbourneDateTime = (iso) =>
  iso ? `${formatDate(iso, { dateStyle: 'medium' })}, ${formatTime(iso)}` : ''
const positionText = (row) => (row.waitlistPosition === null ? '' : `#${row.waitlistPosition}`)

export const PARTICIPANT_TABLE_COLUMNS = Object.freeze(
  [
    {
      key: 'name',
      label: 'Name',
      value: (row) => row.contactName,
      sort: 'text',
      filter: 'text',
    },
    {
      key: 'email',
      label: 'Email',
      value: (row) => row.email,
      sort: 'text',
      filter: 'text',
    },
    {
      key: 'status',
      label: 'Status',
      value: (row) => row.status,
      text: (row) => STATUS_LABELS[row.status] ?? row.status,
      sort: 'text',
      filter: 'select',
      options: STATUS_OPTIONS,
    },
    {
      key: 'reference',
      label: 'Reference',
      value: (row) => row.reference,
      sort: 'text',
      filter: 'text',
    },
    {
      key: 'item',
      label: 'Item',
      value: (row) => row.itemDescription ?? '',
      sort: 'text',
      filter: 'text',
    },
    {
      key: 'position',
      label: 'Waitlist position',
      value: (row) => row.waitlistPosition,
      text: positionText,
      searchValues: (row) => [positionText(row)],
      sort: 'number',
      filter: 'text',
      nullsLast: true,
    },
    {
      key: 'booked',
      label: 'Booked at',
      value: (row) => row.createdAt,
      text: (row) => melbourneDateTime(row.createdAt),
      searchValues: (row) => [melbourneDateTime(row.createdAt)],
      sort: 'date',
      filter: 'text',
    },
    {
      key: 'promoted',
      label: 'Promoted at',
      value: (row) => row.promotedAt,
      text: (row) => melbourneDateTime(row.promotedAt),
      searchValues: (row) => [melbourneDateTime(row.promotedAt)],
      sort: 'date',
      filter: 'text',
      nullsLast: true,
    },
  ].map((column) => Object.freeze(column)),
)

export const PARTICIPANT_DEFAULT_SORT = Object.freeze({
  key: 'booked',
  direction: 'asc',
})

const byId = (left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
const waitlistedTime = (booking) => {
  const time = Date.parse(booking.waitlistedAt)
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

/** Position 1, 2, ... of each waitlisted booking: earliest `waitlistedAt`, then id. */
export function waitlistPositions(bookings) {
  const queue = bookings
    .filter((booking) => booking.status === 'waitlisted')
    .sort((left, right) => waitlistedTime(left) - waitlistedTime(right) || byId(left, right))
  return new Map(queue.map((booking, index) => [booking.id, index + 1]))
}

/** The table rows: each booking with its waitlist position (null unless waitlisted). */
export function toParticipantRows(bookings) {
  const positions = waitlistPositions(bookings)
  return bookings.map((booking) => ({
    ...booking,
    waitlistPosition: positions.get(booking.id) ?? null,
  }))
}

export const isLiveParticipant = (booking) => LIVE_BOOKING_STATUSES.includes(booking?.status)

/** Confirmed and waitlisted bookings: the people a session email can reach. */
export const liveParticipants = (bookings) => bookings.filter(isLiveParticipant)

/**
 * The ids a selection button picks, from every live booking of the session (never only the page
 * or the filtered rows).
 *
 * @param {'all' | 'confirmed' | 'waitlisted'} mode
 */
export function selectIds(bookings, mode) {
  return liveParticipants(bookings)
    .filter((booking) => mode === 'all' || booking.status === mode)
    .map((booking) => booking.id)
}

/** "1 participant", "3 participants". */
export const formatParticipantCount = (count) =>
  `${count} ${count === 1 ? 'participant' : 'participants'}`

/** The live count line beside the selection buttons. */
export function selectionCountText(count, liveCount) {
  return count > 0 && count === liveCount
    ? `All ${formatParticipantCount(count)} selected`
    : `${count} selected`
}

/** The summary above Send: the sentence and every selected name, in selection order. */
export function recipientSummary(selectedBookings, liveCount) {
  const count = selectedBookings.length
  return {
    count,
    total: liveCount,
    sentence:
      count === 0
        ? 'No participants selected; only your copy will be sent'
        : `Send to ${count} of ${formatParticipantCount(liveCount)}`,
    names: selectedBookings.map((booking) => booking.contactName),
  }
}

/** How long a promoted row keeps "Send promotion email" after a lost answer. */
export const RECENT_PROMOTION_MS = 10 * 60 * 1000

/** Confirmed bookings promoted within the window (either side of the device clock). */
export function recentPromotions(bookings, now) {
  const nowMs = now.getTime()
  return bookings.filter((booking) => {
    if (booking.status !== 'confirmed' || !booking.promotedAt) return false
    const elapsed = nowMs - Date.parse(booking.promotedAt)
    return Math.abs(elapsed) <= RECENT_PROMOTION_MS
  })
}

/** The promotion line, which explains each outcome in words. */
export const PROMOTION_MESSAGES = Object.freeze({
  promoted: (reference) => `Promoted ${reference}`,
  'no-free-place': 'There is no free place in this session now. The session has been reloaded.',
  'no-waitlist': 'Nobody is on the waitlist now. The session has been reloaded.',
  'session-not-open':
    'This session is cancelled, completed or has started, so nobody can be promoted.',
  'counter-mismatch':
    "The waitlist count does not match the bookings. Reload the page; if it persists, check this session's bookings.",
  'live-admin-disabled': 'Admin changes against the live project are disabled in development mode',
  emailNotSent: 'Promotion email not sent',
})
