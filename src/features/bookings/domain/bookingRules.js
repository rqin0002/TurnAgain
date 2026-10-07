import { hasKnownCapacity } from '@/features/activities/domain/sessionSchema.js'

/**
 * The booking rules: pure decisions over projected
 * sessions and bookings (ISO instants), shared by the review, the transaction, the session rows
 * and My Bookings. The transaction turns a refusal reason into a RepositoryError; this module
 * never imports a data layer (domain-pure).
 */

export const WAITLIST_LIMIT = 10
export const BOOKING_STATUSES = Object.freeze(['confirmed', 'waitlisted', 'cancelled'])
export const LIVE_BOOKING_STATUSES = Object.freeze(['confirmed', 'waitlisted'])

// 32 characters without I, O, 0 and 1: `byte % 32` is unbiased because 256 is a multiple of 32.
export const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const REFERENCE_PATTERN = /^TA-[A-HJ-NP-Z2-9]{6}$/u

/** "TA-7K3M9X" from six random bytes; the byte source is injectable for tests. */
export function generateReference({
  getRandomValues = (array) => globalThis.crypto.getRandomValues(array),
} = {}) {
  const bytes = getRandomValues(new Uint8Array(6))
  let code = ''
  for (const byte of bytes) {
    code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]
  }
  return `TA-${code}`
}

/** The one place the `{uid}_{sessionId}` document id is built. */
export const bookingIdFor = (uid, sessionId) => `${uid}_${sessionId}`

export const isLiveBooking = (booking) => LIVE_BOOKING_STATUSES.includes(booking?.status)

export const CLOSED_REASONS = Object.freeze([
  'cancelled',
  'completed',
  'started',
  'external',
  'waitlist-full',
])

/** True from the start instant on, and for an unreadable start, so nothing books it. */
export const hasStarted = (session, now) => !(Date.parse(session?.startsAt) > now.getTime())

/*
 * The availability rules, stated once for the session row and the calendar so the two never
 * disagree. Full or queued: a seat freed while anyone waits stays reserved
 * for the waitlist until staff promote, so no remaining places show then.
 */
export const isFullOrQueued = (session) =>
  session.waitlistCount > 0 || session.bookedCount >= session.capacity
export const remainingPlaces = (session) => session.capacity - session.bookedCount
export const isLimited = (session) =>
  remainingPlaces(session) <= Math.max(1, Math.ceil(session.capacity * 0.2))

/**
 * Why a session cannot be booked through TurnAgain, or null when it can: a `turnagain` session
 * with known counters, scheduled or full, that has not started.
 *
 * @returns {null | 'cancelled' | 'completed' | 'started' | 'external'}
 */
export function bookabilityOf(session, now) {
  if (session?.status === 'cancelled') return 'cancelled'
  if (session?.status === 'completed') return 'completed'
  if (session?.registrationType !== 'turnagain' || !hasKnownCapacity(session)) return 'external'
  if (hasStarted(session, now)) return 'started'
  return null
}

const INTENTS = new Set(['book', 'waitlist'])

/**
 * The outcome the transaction commits (the rules' bookingFitsSession): a seat only while one is
 * free and nobody waits; otherwise the waitlist (at most 10), and only when the person asked for
 * it, so a `book` intent that meets a full or queued session is refused as `session-filled`.
 *
 * @param {{ bookedCount: number, capacity: number, waitlistCount: number }} counters
 * @param {'book' | 'waitlist'} intent
 * @returns {'confirmed' | 'waitlisted' | 'session-filled' | 'waitlist-full'}
 */
export function decideOutcome({ bookedCount, capacity, waitlistCount }, intent) {
  if (!INTENTS.has(intent)) {
    throw new RangeError(`decideOutcome: unknown intent ${String(intent)}`)
  }
  if (bookedCount < capacity && waitlistCount === 0) return 'confirmed'
  if (waitlistCount >= WAITLIST_LIMIT) return 'waitlist-full'
  return intent === 'waitlist' ? 'waitlisted' : 'session-filled'
}

const intersects = (left, right) =>
  Date.parse(left.startsAt) < Date.parse(right.endsAt) &&
  Date.parse(right.startsAt) < Date.parse(left.endsAt)

/** The first live booking of another session whose [startsAt, endsAt) meets this one (advisory). */
export function findOverlap(session, bookings) {
  if (!session || !Array.isArray(bookings)) return null
  return (
    bookings.find(
      (booking) =>
        isLiveBooking(booking) && booking.sessionId !== session.id && intersects(session, booking),
    ) ?? null
  )
}

/** A member may cancel a live booking until the session starts. */
export function canCancel(booking, session, now) {
  return (
    isLiveBooking(booking) &&
    session != null &&
    (session.status === 'scheduled' || session.status === 'full') &&
    !hasStarted(session, now)
  )
}

/**
 * Started -> no member cancel, contact us; a session that has ended is past, not started
 * (Upcoming until endsAt), even while its status is still `scheduled`.
 */
export function isCancelClosedByStart(booking, session, now) {
  return (
    isLiveBooking(booking) &&
    session != null &&
    (session.status === 'scheduled' || session.status === 'full') &&
    hasStarted(session, now) &&
    Date.parse(session.endsAt) > now.getTime()
  )
}

const placesLabel = (remaining) =>
  remaining === 1 ? 'Only 1 place left' : `Only ${remaining} places left`

/**
 * One row's action. Remaining places are never shown while anyone waits: a freed seat stays
 * reserved for the waitlist until staff promote. The organiser's cancel comes before the
 * member's own booking: it leaves that booking live, and
 * "You're booked" on a cancelled session would send the member to it.
 *
 * @returns {{ action: 'book' | 'waitlist' | 'booked' | 'none' | 'external', tone: 'open' | 'limited' | 'waitlist' | 'booked' | 'closed' | 'cancelled' | 'external', label: string }}
 */
export function describeSessionAvailability(session, now, { myBooking = null } = {}) {
  if (session.status === 'cancelled') {
    return { action: 'none', tone: 'cancelled', label: 'Cancelled by the organiser' }
  }
  if (isLiveBooking(myBooking)) {
    return {
      action: 'booked',
      tone: 'booked',
      label:
        myBooking.status === 'confirmed'
          ? `You're booked, ${myBooking.reference}`
          : `You're on the waitlist, ${myBooking.reference}`,
    }
  }
  if (session.registrationType !== 'turnagain' || !hasKnownCapacity(session)) {
    return { action: 'external', tone: 'external', label: '' }
  }
  if (session.status === 'completed') {
    return { action: 'none', tone: 'closed', label: 'This session has finished' }
  }
  if (hasStarted(session, now)) {
    return { action: 'none', tone: 'closed', label: 'This session has started' }
  }
  if (isFullOrQueued(session)) {
    return session.waitlistCount < WAITLIST_LIMIT
      ? { action: 'waitlist', tone: 'waitlist', label: 'Join waitlist' }
      : { action: 'none', tone: 'closed', label: 'The waitlist is full' }
  }
  if (isLimited(session)) {
    return { action: 'book', tone: 'limited', label: placesLabel(remainingPlaces(session)) }
  }
  return { action: 'book', tone: 'open', label: 'Book this session' }
}

const byStart = (left, right) =>
  Date.parse(left.booking.startsAt) - Date.parse(right.booking.startsAt) ||
  left.booking.id.localeCompare(right.booking.id)

/**
 * My Bookings: a booking whose session did not load is `unconfirmed`, never
 * cancelled. Upcoming = live, snapshot `endsAt` still ahead, session not known to be cancelled,
 * soonest first; everything else is Past and cancelled, latest first.
 *
 * @param {object[]} bookings projected bookings
 * @param {Map<string, object>} sessionsById the sessions that loaded
 * @param {Date} now
 */
export function splitBookings(bookings, sessionsById, now) {
  const entries = (Array.isArray(bookings) ? bookings : []).map((booking) => {
    const session = sessionsById?.get(booking.sessionId) ?? null
    const sessionState =
      session === null ? 'unconfirmed' : session.status === 'cancelled' ? 'cancelled' : 'current'
    return { booking, session, sessionState }
  })
  const isUpcoming = (entry) =>
    isLiveBooking(entry.booking) &&
    Date.parse(entry.booking.endsAt) > now.getTime() &&
    entry.sessionState !== 'cancelled'
  return {
    upcoming: entries.filter(isUpcoming).sort(byStart),
    past: entries.filter((entry) => !isUpcoming(entry)).sort((left, right) => byStart(right, left)),
  }
}

/** The booking review path the sign-in page recognises. */
export const isBookingReviewPath = (path) =>
  typeof path === 'string' && /^\/activities\/[^/]+\/book\//u.test(path)
