import { deepFreeze } from '@/shared/domain/deepFreeze.js'
import { describeError } from '@/shared/domain/errorCopy.js'

/**
 * Every sentence the booking screens show (spec 7.4-7.7, M5-D6), and the two readers that turn
 * a RepositoryError into one of them. The client maps `code` and `details`, never a message
 * (spec 5.9); a RepositoryError's or AuthError's own message is used only for an error this table
 * cannot name; anything else is the generic line.
 */

export const BOOKING_MESSAGES = deepFreeze({
  signInToBook:
    "Sign in to continue to your booking. We'll bring you back to the session you chose.",
  joinWaitlistInstead: 'Join the waitlist instead?',
  placeOpened: "A place opened up: you're booked",
  waitlistPositionHeading: "You're on the waitlist (position {n} when you joined)",
  waitlistHeading: "You're on the waitlist",
  confirmedHeading: "You're booked",
  cancelledHeading: 'This booking is cancelled',
  duplicate: 'You already have a booking for this session.',
  overlap: 'This session overlaps another of your bookings.',
  bookAnyway: 'Book anyway',
  cancelUntilStart: 'You can cancel from My Bookings until the session starts',
  icsNote: 'This calendar file does not follow later changes to the session',
  sessionUnconfirmed: 'Current session status not confirmed',
  refreshToConfirm: 'Refresh to confirm the session status',
  sessionCancelledByTurnAgain: 'Session cancelled by TurnAgain',
  sessionNotInList: 'Session not in the list',
  undeliverable:
    "This account's email address can't receive mail, so no confirmation was sent. Your booking is unaffected.",
  sessionFilled: 'The last place was taken while you were reviewing. Nothing was booked.',
  sessionNotFound: 'We could not find that session.',
  emailChecking: 'Checking the email status',
  bookingPageHeading: 'Your booking',
  bookedNotOpened: 'Your booking is saved, but its page did not open.',
  cancelStarted: "This session has started, so it can't be cancelled here.",
  contactUsIfAbsent: "Contact us if you can't attend",
  cancelStartedRefusal:
    "This session has started, so it can't be cancelled here. Contact us if you can't attend.",
  closed: {
    cancelled: 'This session was cancelled by the organiser.',
    completed: 'This session has finished.',
    started: "This session has started, so it can't be booked.",
    external: 'This session is booked with its provider, not through TurnAgain.',
    'waitlist-full': 'The waitlist for this session is full.',
  },
})

/** The email status line (spec 7.7 L954, verbatim). */
export const EMAIL_STATUS_COPY = deepFreeze({
  sending: 'Sending your confirmation',
  accepted: 'Sent to the email provider',
  failed: "Couldn't send",
  unknown: "We can't tell whether it was sent",
  'dry-run': 'Email sending is in test mode',
})

export const EMAIL_ACTIONS = deepFreeze({
  resend: 'Resend',
  checkStatus: 'Check status',
  sendAgain: 'Send again',
  checkEmailStatus: 'Check email status',
})

/**
 * A refused or failed booking write as one of the review's states (spec 7.6 L948).
 *
 * @returns {{ state: 'session-filled' | 'duplicate' | 'closed' | 'failed', reason: string | null, message: string, bookingId: string | null }}
 */
export function describeBookingError(error) {
  const details = error?.code === 'conflict' ? (error.details ?? {}) : {}
  if (details.outcome === 'session-filled') {
    return {
      state: 'session-filled',
      reason: null,
      message: BOOKING_MESSAGES.sessionFilled,
      bookingId: null,
    }
  }
  if (details.outcome === 'duplicate') {
    return {
      state: 'duplicate',
      reason: null,
      message: BOOKING_MESSAGES.duplicate,
      bookingId: details.bookingId ?? null,
    }
  }
  if (details.outcome === 'session-unavailable') {
    const reason = details.reason ?? null
    return {
      state: 'closed',
      reason,
      message:
        BOOKING_MESSAGES.closed[reason] ??
        (reason === 'not-found' ? BOOKING_MESSAGES.sessionNotFound : describeError(error)),
      bookingId: null,
    }
  }
  return {
    state: 'failed',
    reason: typeof error?.code === 'string' ? error.code : 'unavailable',
    message: describeError(error),
    bookingId: null,
  }
}

const REFUSAL_COPY = Object.freeze({
  'undeliverable-address': BOOKING_MESSAGES.undeliverable,
  'resend-too-soon': 'Wait a minute before sending again.',
  'attempts-exhausted': "You've reached 3 attempts today. Try again tomorrow.",
  promoted: 'Staff confirmed this booking; its email was sent separately.',
  'kind-mismatch': 'This booking changed. Reload the page.',
  'functions-off': '',
})

/** The `details.code` values the email line explains itself (contract section 3.6). */
export const EMAIL_REFUSAL_CODES = Object.freeze(Object.keys(REFUSAL_COPY))

/**
 * An email call that the function refused, as the line's copy (spec 7.7, M5-D6).
 *
 * @returns {{ code: string, message: string, retryAfterMs: number | null, untilTomorrow: boolean }}
 */
export function describeEmailRefusal(error) {
  const details = error?.details ?? {}
  const code =
    typeof details.code === 'string'
      ? details.code
      : typeof error?.code === 'string'
        ? error.code
        : 'unavailable'
  const retryAfterMs =
    Number.isFinite(details.retryAfterMs) && details.retryAfterMs >= 0 ? details.retryAfterMs : null
  return {
    code,
    message: Object.hasOwn(REFUSAL_COPY, code) ? REFUSAL_COPY[code] : describeError(error),
    retryAfterMs,
    untilTomorrow: code === 'attempts-exhausted',
  }
}
