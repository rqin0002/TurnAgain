import { computed, onBeforeUnmount, ref, toValue, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'

import {
  createBooking,
  fetchBookingActivity,
  fetchBookingSession,
  isBookingEmailEnabled,
  listMyBookings,
  requestBookingEmail,
} from '../data/bookingRepository.js'
import { describeBookingError } from '../domain/bookingMessages.js'
import { bookabilityOf, decideOutcome, findOverlap, isLiveBooking } from '../domain/bookingRules.js'

/** An activity read the rules refused (`details.reason: 'unreadable'`) settles as no activity. */
const unreadableAsNull = (caught) => {
  if (caught?.code === 'not-found' && caught.details?.reason === 'unreadable') return null
  throw caught
}

/**
 * The review step (spec 7.5): loads the session, its activity and the member's bookings in
 * parallel, then settles on one state: `loading -> not-found | closed | duplicate | overlap |
 * ready -> submitting -> session-filled | duplicate | closed | failed | booked`. A success returns
 * the transaction's result and leaves `submitting` set (the view navigates away, or settles
 * `booked` through `markBooked` when that navigation fails). Every answer that lands after the
 * page is gone, or after a newer load, is ignored. A session the rules refuse (finished or never
 * public, and not booked) is `not-found`; an activity they refuse is `closed(external)`; neither
 * reaches the failed panel (ruling R-5c.34).
 *
 * @param {{ activityId: import('vue').MaybeRefOrGetter<string>, sessionId: import('vue').MaybeRefOrGetter<string> }} options
 */
export function useBookingReview({ activityId, sessionId }) {
  const authStore = useAuthStore()
  const state = ref('loading')
  const reason = ref(null)
  const error = ref(null)
  const session = ref(null)
  const activity = ref(null)
  const existingBooking = ref(null)
  const overlapping = ref(null)
  // After a session-filled refusal the stale counters still say "free": the next submit joins
  // the waitlist (spec 7.5: "Join the waitlist instead?").
  const offeredWaitlist = ref(false)

  let generation = 0
  let disposed = false

  const intent = computed(() =>
    offeredWaitlist.value ||
    (session.value !== null && decideOutcome(session.value, 'book') === 'session-filled')
      ? 'waitlist'
      : 'book',
  )
  const contactNameDefault = computed(() => authStore.user?.displayName ?? '')
  const accountEmail = computed(() => authStore.user?.email ?? '')

  const settle = (nextState, nextReason = null) => {
    state.value = nextState
    reason.value = nextReason
  }

  const load = async () => {
    const run = ++generation
    const requestedActivityId = toValue(activityId)
    const requestedSessionId = toValue(sessionId)
    settle('loading')
    error.value = null
    session.value = null
    activity.value = null
    existingBooking.value = null
    overlapping.value = null
    offeredWaitlist.value = false
    try {
      const [loadedSession, loadedActivity, mine] = await Promise.all([
        fetchBookingSession(requestedSessionId),
        // A member reads only a published activity: one the rules refuse is closed to booking.
        fetchBookingActivity(requestedActivityId).catch(unreadableAsNull),
        listMyBookings(authStore.user?.uid),
      ])
      if (disposed || run !== generation) return
      // N3: a session that does not belong to the activity in the URL is not this page's.
      if (loadedSession.activityId !== requestedActivityId) {
        settle('not-found')
        return
      }
      session.value = loadedSession
      activity.value = loadedActivity
      if (loadedActivity === null || loadedActivity.status !== 'published') {
        settle('closed', 'external')
        return
      }
      const closedReason = bookabilityOf(loadedSession, new Date())
      if (closedReason !== null) {
        settle('closed', closedReason)
        return
      }
      const existing = mine.bookings.find(
        (booking) => booking.sessionId === loadedSession.id && isLiveBooking(booking),
      )
      if (existing) {
        existingBooking.value = existing
        settle('duplicate')
        return
      }
      if (decideOutcome(loadedSession, 'waitlist') === 'waitlist-full') {
        settle('closed', 'waitlist-full')
        return
      }
      const clash = findOverlap(loadedSession, mine.bookings)
      if (clash) {
        overlapping.value = clash
        settle('overlap')
        return
      }
      settle('ready')
    } catch (caught) {
      if (disposed || run !== generation) return
      if (caught?.code === 'not-found') {
        settle('not-found')
        return
      }
      error.value = caught
      settle('failed', caught?.code ?? 'unavailable')
    }
  }

  /**
   * The booking committed but its page did not open, a navigation guard refused it: settle on a
   * link to it.
   *
   * @param {string} bookingId
   */
  const markBooked = (bookingId) => {
    existingBooking.value = { id: bookingId }
    settle('booked')
  }

  /** The overlap is advisory (spec 7.5): "Book anyway" proceeds to the form. */
  const acceptOverlap = () => {
    if (state.value === 'overlap') settle('ready')
  }

  /**
   * @param {{ contactName: string, itemDescription: string | null }} values
   * @returns {Promise<{ bookingId: string, outcome: string, position: number | null, placeOpened: boolean } | null>}
   */
  const submit = async (values) => {
    if (state.value === 'submitting' || session.value === null) return null
    const run = generation
    const requestedIntent = intent.value
    // Set before the first await, so a second click finds the review already submitting (C1.2).
    settle('submitting')
    error.value = null
    try {
      const result = await createBooking({
        sessionId: session.value.id,
        uid: authStore.user?.uid,
        contactName: values.contactName,
        itemDescription: values.itemDescription,
        intent: requestedIntent,
      })
      if (disposed || run !== generation) {
        // The page whose ?new=1 visit would have asked for the confirmation is gone; the callable
        // is idempotent per series, so asking here can never send it twice.
        if (isBookingEmailEnabled()) {
          requestBookingEmail({ bookingId: result.bookingId, kind: result.outcome }).catch(
            () => undefined,
          )
        }
        return null
      }
      return result
    } catch (caught) {
      if (disposed || run !== generation) return null
      const described = describeBookingError(caught)
      error.value = caught
      if (described.state === 'session-filled') {
        offeredWaitlist.value = true
        settle('session-filled')
      } else if (described.state === 'duplicate') {
        existingBooking.value = { id: described.bookingId }
        settle('duplicate')
      } else if (described.state === 'closed') {
        settle(described.reason === 'not-found' ? 'not-found' : 'closed', described.reason)
      } else {
        settle('failed', described.reason)
      }
      return null
    }
  }

  watch([() => toValue(activityId), () => toValue(sessionId)], () => void load(), {
    immediate: true,
  })
  onBeforeUnmount(() => {
    disposed = true
  })

  return {
    state,
    reason,
    error,
    session,
    activity,
    existingBooking,
    overlapping,
    intent,
    contactNameDefault,
    accountEmail,
    acceptOverlap,
    submit,
    markBooked,
    retry: load,
  }
}
