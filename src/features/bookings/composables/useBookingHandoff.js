import { shallowRef } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'

/**
 * The confirmation hand-off: the review leaves the transaction's outcome here
 * for exactly one consumption by the confirmation page. It lives in memory only (never Firestore,
 * storage or the URL), so a refresh or a later visit never shows the waitlist position again. A
 * value set under another identity, or for another booking, is cleared without being returned.
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
