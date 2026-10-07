import { doc, runTransaction, serverTimestamp } from 'firebase/firestore/lite'

import { projectActivity } from '@/features/activities/domain/activitySchema.js'
import { deriveSessionStatus, projectSession } from '@/features/activities/domain/sessionSchema.js'
import { RepositoryError, toRepositoryError } from '@/shared/data/RepositoryError.js'

import { BOOKING_MESSAGES } from '../domain/bookingMessages.js'
import {
  bookabilityOf,
  bookingIdFor,
  canCancel,
  decideOutcome,
  generateReference,
  isLiveBooking,
} from '../domain/bookingRules.js'

/**
 * The booking write path (spec 7.6, contract sections 3.1-3.3): two Lite transactions that take
 * their Firestore and Auth instances as arguments and import nothing from @/firebase (M5-D5), so
 * the emulator test drives two signed-in apps at once while bookingRepository wires the
 * singletons. Each callback reads before it writes and is pure over its reads, so every run
 * decides again from fresh data. A refusal is a RepositoryError('conflict') with
 * `details.outcome`; it is not a FirebaseError, so the SDK never retries it (F4.3).
 */

/**
 * How many times a callback may run when its commit is refused by the rules. Under the M5 rules
 * the loser of two concurrent bookings is refused with permission-denied (the rules evaluate the
 * commit against the winner's counters before any precondition), which Lite treats as permanent;
 * running the callback again on fresh reads turns it into session-filled or waitlisted. A refusal
 * that survives every run is a real one.
 */
export const COMMIT_ATTEMPTS = 3

const runWithCommitRetry = async (db, callback) => {
  for (let attempt = 1; ; attempt += 1) {
    let decided = false
    try {
      return await runTransaction(db, async (transaction) => {
        decided = false
        const result = await callback(transaction)
        decided = true
        return result
      })
    } catch (error) {
      const refusedAtCommit = decided && error?.code === 'permission-denied'
      if (!refusedAtCommit || attempt >= COMMIT_ATTEMPTS) {
        throw error
      }
    }
  }
}

const refusal = (outcome, { reason = null, bookingId = null, action = 'book' } = {}) => {
  const message =
    outcome === 'session-filled'
      ? BOOKING_MESSAGES.sessionFilled
      : outcome === 'duplicate'
        ? BOOKING_MESSAGES.duplicate
        : reason === 'booking-cancelled'
          ? BOOKING_MESSAGES.cancelledHeading
          : action === 'cancel' && reason === 'started'
            ? BOOKING_MESSAGES.cancelStartedRefusal
            : (BOOKING_MESSAGES.closed[reason] ?? BOOKING_MESSAGES.sessionNotFound)
  return new RepositoryError('conflict', message, { details: { outcome, reason, bookingId } })
}

const currentUid = (auth) => auth?.currentUser?.uid ?? null

/**
 * A member-readable session: the sessions `get` rule refuses a member a session outside the public
 * statuses that they never booked, which reads as a session they cannot book (as for the activity
 * below), never as a lost access.
 */
const readSessionSnapshot = async (transaction, sessionRef) => {
  try {
    return await transaction.get(sessionRef)
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw refusal('session-unavailable', { reason: 'not-found' })
    }
    throw error
  }
}

/**
 * A member-readable activity: a missing or archived one is refused by the activities `get` rule
 * for a member (published or staff only), which reads here as a session no longer bookable.
 */
const readPublishedActivity = async (transaction, db, activityId) => {
  let snapshot
  try {
    snapshot = await transaction.get(doc(db, 'activities', activityId))
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw refusal('session-unavailable', { reason: 'external' })
    }
    throw error
  }
  const activity = snapshot.exists() ? projectActivity(snapshot.id, snapshot.data()) : null
  if (activity === null || activity.status !== 'published') {
    throw refusal('session-unavailable', { reason: 'external' })
  }
  return snapshot.data()
}

/**
 * Creates the caller's booking, or rebooks a cancelled one, and moves the session counters in
 * the same commit (spec 7.6 L948; rules sessionCountersMoved / memberCountersMatchBooking).
 * A commit the rules still refuse after every run is a RepositoryError('permission') carrying
 * `details.sessionStartsAt` and no permission-denied event: createBooking decides whether it is a
 * session that has just started (N11) or a lost access, and only the latter re-checks the profile.
 *
 * @param {import('firebase/firestore/lite').Firestore} db
 * @param {{ currentUser: { uid: string, email: string } | null }} auth
 * @param {{ sessionId: string, uid: string, contactName: string, itemDescription: string | null, intent: 'book' | 'waitlist' }} input
 * @returns {Promise<{ bookingId: string, outcome: 'confirmed' | 'waitlisted', position: number | null, placeOpened: boolean }>}
 */
export async function createBookingTx(
  db,
  auth,
  { sessionId, uid, contactName, itemDescription, intent },
) {
  if (currentUid(auth) === null || currentUid(auth) !== uid) {
    throw new RepositoryError('permission')
  }
  const email = auth.currentUser.email
  const bookingId = bookingIdFor(uid, sessionId)
  const sessionRef = doc(db, 'activitySessions', sessionId)
  const bookingRef = doc(db, 'bookings', bookingId)
  // The session start the last run read, for the clock-skew mapping of a refused commit (N11).
  let readStartsAt = null

  try {
    return await runWithCommitRetry(db, async (transaction) => {
      const sessionSnapshot = await readSessionSnapshot(transaction, sessionRef)
      const session = sessionSnapshot.exists()
        ? projectSession(sessionSnapshot.id, sessionSnapshot.data())
        : null
      if (session === null) {
        throw refusal('session-unavailable', { reason: 'not-found' })
      }
      readStartsAt = session.startsAt
      const reason = bookabilityOf(session, new Date())
      if (reason !== null) {
        throw refusal('session-unavailable', { reason })
      }
      const raw = sessionSnapshot.data()
      const activity = await readPublishedActivity(transaction, db, raw.activityId)

      const bookingSnapshot = await transaction.get(bookingRef)
      const stored = bookingSnapshot.exists() ? bookingSnapshot.data() : null
      if (stored !== null && isLiveBooking(stored)) {
        throw refusal('duplicate', { bookingId })
      }

      const outcome = decideOutcome(session, intent)
      if (outcome === 'session-filled') {
        throw refusal('session-filled')
      }
      if (outcome === 'waitlist-full') {
        throw refusal('session-unavailable', { reason: 'waitlist-full' })
      }

      // Snapshots come from the raw documents read in this run (Timestamps, not the projection).
      transaction.set(bookingRef, {
        uid: stored?.uid ?? uid,
        email,
        contactName,
        itemDescription,
        sessionId: stored?.sessionId ?? sessionId,
        activityId: stored?.activityId ?? raw.activityId,
        activityTitle: activity.title,
        venueName: raw.venueName,
        address: raw.address,
        suburb: raw.suburb,
        postcode: raw.postcode,
        startsAt: raw.startsAt,
        endsAt: raw.endsAt,
        status: outcome,
        reference: generateReference(),
        waitlistedAt: outcome === 'waitlisted' ? serverTimestamp() : null,
        promotedAt: null,
        cancelledAt: null,
        // A rebook keeps the first createdAt (the update rule refuses any other value).
        createdAt: stored?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      const bookedCount = session.bookedCount + (outcome === 'confirmed' ? 1 : 0)
      const waitlistCount = session.waitlistCount + (outcome === 'waitlisted' ? 1 : 0)
      transaction.update(sessionRef, {
        bookedCount,
        waitlistCount,
        status: deriveSessionStatus({ ...session, bookedCount, waitlistCount }),
        updatedAt: serverTimestamp(),
      })

      return {
        bookingId,
        outcome,
        // D5: the position from this run's read, held in memory only.
        position: outcome === 'waitlisted' ? session.waitlistCount + 1 : null,
        placeOpened: intent === 'waitlist' && outcome === 'confirmed',
      }
    })
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw new RepositoryError('permission', undefined, {
        details: { sessionStartsAt: readStartsAt },
        cause: error,
      })
    }
    throw toRepositoryError(error)
  }
}

const closedReasonFor = (session) => {
  if (session === null) return 'not-found'
  if (session.status === 'cancelled' || session.status === 'completed') return session.status
  return 'started'
}

/**
 * Cancels the caller's live booking and gives its place back in the same commit (spec 7.6:
 * status cancelled, cancelledAt, the matching counter -1, status re-derived; cut-off at start).
 * A commit or read the rules refuse has the create's N11 shape: a RepositoryError('permission')
 * carrying `details.sessionStartsAt` (null when the booking read itself was refused) and
 * `bookingId`, and no permission-denied event. cancelBooking decides between a session that has
 * just started, a counter race lost on every run and a lost access, and only the last re-checks
 * the profile.
 *
 * @returns {Promise<{ bookingId: string, status: 'cancelled' }>}
 */
export async function cancelBookingTx(db, auth, bookingId) {
  const uid = currentUid(auth)
  if (uid === null || typeof bookingId !== 'string' || !bookingId.startsWith(`${uid}_`)) {
    throw new RepositoryError('permission')
  }
  const bookingRef = doc(db, 'bookings', bookingId)
  // The session start the last run read, for the clock-skew mapping of a refused commit (N11).
  let readStartsAt = null

  try {
    return await runWithCommitRetry(db, async (transaction) => {
      // Ruling C2: a run whose booking read is refused must not report an earlier run's start.
      readStartsAt = null
      const bookingSnapshot = await transaction.get(bookingRef)
      if (!bookingSnapshot.exists()) {
        throw new RepositoryError('not-found')
      }
      const stored = bookingSnapshot.data()
      if (!isLiveBooking(stored)) {
        // The member's own booking is already cancelled (a second tab, a stale list), not the
        // session, so the refusal must not borrow the organiser-cancelled sentence.
        throw refusal('session-unavailable', { reason: 'booking-cancelled', bookingId })
      }
      const sessionRef = doc(db, 'activitySessions', stored.sessionId)
      const sessionSnapshot = await transaction.get(sessionRef)
      const session = sessionSnapshot.exists()
        ? projectSession(sessionSnapshot.id, sessionSnapshot.data())
        : null
      readStartsAt = session?.startsAt ?? null
      if (!canCancel(stored, session, new Date())) {
        throw refusal('session-unavailable', {
          reason: closedReasonFor(session),
          bookingId,
          action: 'cancel',
        })
      }

      transaction.update(bookingRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      const bookedCount = session.bookedCount - (stored.status === 'confirmed' ? 1 : 0)
      const waitlistCount = session.waitlistCount - (stored.status === 'waitlisted' ? 1 : 0)
      transaction.update(sessionRef, {
        bookedCount,
        waitlistCount,
        status: deriveSessionStatus({ ...session, bookedCount, waitlistCount }),
        updatedAt: serverTimestamp(),
      })
      return { bookingId, status: 'cancelled' }
    })
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw new RepositoryError('permission', undefined, {
        details: { sessionStartsAt: readStartsAt, bookingId },
        cause: error,
      })
    }
    throw toRepositoryError(error)
  }
}
