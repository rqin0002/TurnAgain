import { shallowRef } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'

/**
 * Passes the result of the booking just made on the review page to the booking page: the outcome
 * (confirmed or waitlisted), the waitlist position at the moment of joining, and whether a request
 * to join the waitlist got a place instead. One value for the whole app, kept in memory only
 * (never Firestore, storage or the URL), so a refresh or a later visit does not show the position
 * again. consumeHandoff() clears the value on every call and returns it only when the booking id
 * and the signed-in identity match the ones it was set with.
 */
const handoff = shallowRef(null)

export function useBookingHandoff() {
  const authStore = useAuthStore()

  /** @param {{ bookingId: string, position: number | null, kind: 'confirmed' | 'waitlisted', placeOpened: boolean }} value */
  const setHandoff = ({ bookingId, position = null, kind, placeOpened = false }) => {
    handoff.value = Object.freeze({
      bookingId,
      position,
      kind,
      placeOpened,
      epoch: authStore.identityEpoch,
    })
  }

  /** @returns {{ bookingId: string, position: number | null, kind: string, placeOpened: boolean } | null} */
  const consumeHandoff = (bookingId) => {
    const value = handoff.value
    handoff.value = null
    if (
      value === null ||
      value.bookingId !== bookingId ||
      value.epoch !== authStore.identityEpoch
    ) {
      return null
    }
    return {
      bookingId: value.bookingId,
      position: value.position,
      kind: value.kind,
      placeOpened: value.placeOpened,
    }
  }

  const clearHandoff = () => {
    handoff.value = null
  }

  return { setHandoff, consumeHandoff, clearHandoff }
}
