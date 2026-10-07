import { collection, doc, getDoc, query, where } from 'firebase/firestore/lite'

import { projectActivity } from '@/features/activities/domain/activitySchema.js'
import { projectSession } from '@/features/activities/domain/sessionSchema.js'
import { firebaseAuth } from '@/firebase/firebaseAuthClient.js'
import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import { capabilities } from '@/firebase/firebaseFunctionsClient.js'
import { callFunction } from '@/shared/data/callFunction.js'
import { readAll } from '@/shared/data/readAll.js'
import { readByIds } from '@/shared/data/readByIds.js'
import {
  RepositoryError,
  notifyPermissionDenied,
  throwIfAborted,
  toRepositoryError,
} from '@/shared/data/RepositoryError.js'
import { isValidId } from '@/shared/domain/catalogueValidation.js'

import { BOOKING_MESSAGES } from '../domain/bookingMessages.js'
import { isBookingId, projectBooking } from '../domain/bookingValidation.js'

import { cancelBookingTx, createBookingTx } from './bookingTransactions.js'

/**
 * The bookings feature's only data module (spec 7.1, M5-D4): the two transactions wired to the
 * app's Lite and Auth singletons, the member's own reads (Q8, the booking by id), the session
 * and activity reads the booking pages need (projected with the activities domain, never through
 * activityRepository), and the email callable. Every failure is a RepositoryError.
 */

/** A refused commit on a session this close to its start (device clock) reads as started (N11). */
export const CLOCK_SKEW_MS = 5 * 60 * 1000

const startsWithinSkew = (error) => {
  const startsAt = Date.parse(error?.details?.sessionStartsAt)
  return Number.isFinite(startsAt) && Math.abs(startsAt - Date.now()) <= CLOCK_SKEW_MS
}

// Lite gave up after its retries (C2.4e): `aborted` maps to conflict/aborted and a commit
// precondition to unavailable; for a create both mean another booking won the place.
const isExhaustedRetry = (error) =>
  (error?.code === 'conflict' && error.details?.code === 'aborted') ||
  (error?.code === 'unavailable' && error.cause?.code === 'failed-precondition')

/** Spec 7.6 L948, without `myBookings` (the overlap check runs in useBookingReview first). */
export async function createBooking({ sessionId, uid, contactName, itemDescription, intent }) {
  try {
    return await createBookingTx(firestoreLite, firebaseAuth, {
      sessionId,
      uid,
      contactName,
      itemDescription,
      intent,
    })
  } catch (error) {
    if (error?.code === 'permission' && startsWithinSkew(error)) {
      throw new RepositoryError('conflict', BOOKING_MESSAGES.closed.started, {
        details: { outcome: 'session-unavailable', reason: 'started', bookingId: null },
        cause: error,
      })
    }
    // createBookingTx leaves the event to this decision: a rules refusal that is not a session
    // that has just started is a lost access, so the profile is re-checked (spec 9.3).
    if (error?.code === 'permission' && error.cause?.code === 'permission-denied') {
      notifyPermissionDenied()
    }
    if (isExhaustedRetry(error)) {
      throw new RepositoryError('conflict', BOOKING_MESSAGES.sessionFilled, {
        details: { outcome: 'session-filled', reason: null, bookingId: null },
        cause: error,
      })
    }
    throw error
  }
}

/**
 * cancelBookingTx leaves a rules refusal to this decision (spec 7.9, N11): a session within the
 * clock skew of its start reads as closed(started) with the cancel sentence; a commit refused
 * after every read passed is a lost counter race; only a refused booking read is a lost access,
 * and only that re-checks the profile (spec 9.3).
 */
export async function cancelBooking(bookingId) {
  try {
    return await cancelBookingTx(firestoreLite, firebaseAuth, bookingId)
  } catch (error) {
    if (error?.code === 'permission' && error.cause?.code === 'permission-denied') {
      if (startsWithinSkew(error)) {
        throw new RepositoryError('conflict', BOOKING_MESSAGES.cancelStartedRefusal, {
          details: { outcome: 'session-unavailable', reason: 'started', bookingId },
          cause: error,
        })
      }
      // Refused at commit after every read passed: a counter race lost COMMIT_ATTEMPTS times.
      if (error.details?.sessionStartsAt != null) {
        throw new RepositoryError('unavailable', undefined, { cause: error })
      }
      notifyPermissionDenied()
    }
    throw error
  }
}

const byStart = (left, right) =>
  Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id)

/** The signed-in member's bookings (Q8: `where uid ==`, every page), soonest first. */
export async function listMyBookings(uid, { signal } = {}) {
  if (!isValidId(uid)) {
    throw new RepositoryError('permission')
  }
  try {
    throwIfAborted(signal)
    const { docs, truncated } = await readAll(
      query(collection(firestoreLite, 'bookings'), where('uid', '==', uid)),
      { signal },
    )
    const bookings = []
    let skippedCount = 0
    for (const snapshot of docs) {
      const booking = projectBooking(snapshot.id, snapshot.data())
      if (booking === null) skippedCount += 1
      else bookings.push(booking)
    }
    return { bookings: bookings.sort(byStart), skippedCount, truncated }
  } catch (error) {
    throw toRepositoryError(error)
  }
}

const readOne = async (reference, projector, signal) => {
  throwIfAborted(signal)
  const snapshot = await getDoc(reference)
  throwIfAborted(signal)
  const record = snapshot.exists() ? projector(snapshot.id, snapshot.data()) : null
  if (record === null) {
    throw new RepositoryError('not-found')
  }
  return record
}

/** One booking by id; the owner may read it in any status (rules: ownsBookingId). */
export async function fetchBooking(bookingId, { signal } = {}) {
  if (!isBookingId(bookingId)) {
    throw new RepositoryError('not-found')
  }
  try {
    return await readOne(doc(firestoreLite, 'bookings', bookingId), projectBooking, signal)
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/**
 * The rules refuse a member a document they may not see: an activity that is not published, a
 * session outside the public statuses that they never booked. For these two reads that refusal is
 * the page's answer, not a lost access, so it reads as `not-found` with `details.reason:
 * 'unreadable'` and never dispatches the permission-denied event (as readPublishedActivity does
 * inside the transaction, ruling R-5c.3).
 */
const unreadableOr = (error) =>
  error?.code === 'permission-denied'
    ? new RepositoryError('not-found', undefined, {
        details: { reason: 'unreadable' },
        cause: error,
      })
    : toRepositoryError(error)

/** One session by id in any status the rules let the caller read (a booking owner: any). */
export async function fetchBookingSession(sessionId, { signal } = {}) {
  if (!isValidId(sessionId)) {
    throw new RepositoryError('not-found')
  }
  try {
    return await readOne(doc(firestoreLite, 'activitySessions', sessionId), projectSession, signal)
  } catch (error) {
    throw unreadableOr(error)
  }
}

/** One activity by id (a member reads published ones; the review refuses any other status). */
export async function fetchBookingActivity(activityId, { signal } = {}) {
  if (!isValidId(activityId)) {
    throw new RepositoryError('not-found')
  }
  try {
    return await readOne(doc(firestoreLite, 'activities', activityId), projectActivity, signal)
  } catch (error) {
    throw unreadableOr(error)
  }
}

/** The current sessions of My Bookings in chunks of 30 (Q6), with per-chunk tolerance (D6). */
export async function fetchSessionsForBookings(sessionIds, { signal } = {}) {
  try {
    const { records, skippedCount, failedIds } = await readByIds(
      collection(firestoreLite, 'activitySessions'),
      sessionIds,
      { project: projectSession, signal },
    )
    return { sessions: records, skippedCount, failedIds }
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/**
 * Whether this build calls the email function at all (spec 5.9: decided from configuration, never
 * from an error). The composables read it here because only a data module may import the wiring.
 */
export const isBookingEmailEnabled = () => capabilities.functions

/** The booking email callable (spec 5.5); `resend` is sent only when true. */
export async function requestBookingEmail({ bookingId, kind, resend = false }) {
  return callFunction('sendBookingEmail', { bookingId, kind, ...(resend ? { resend: true } : {}) })
}
