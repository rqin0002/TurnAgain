import { ref } from 'vue'

import {
  cancelBooking,
  isBookingEmailEnabled,
  requestBookingEmail,
} from '../data/bookingRepository.js'

/**
 * Cancels one booking, then asks for the "cancelled" email when this build has functions (spec
 * 7.7 L956). The email is fire-and-forget: a failed email never affects the booking (L954), so
 * its failure is swallowed and the cancel resolves as soon as the transaction committed.
 * A refusal stays in `error` until the page clears it, so the page calls clearError() whenever the
 * dialog opens or closes: a refusal belongs to the attempt it answered, never to the next dialog.
 */
export function useCancelBooking() {
  const cancelling = ref(null)
  const error = ref(null)

  /** @returns {Promise<boolean>} true when the cancel committed */
  const cancel = async (bookingId) => {
    if (cancelling.value !== null) return false
    cancelling.value = bookingId
    error.value = null
    try {
      await cancelBooking(bookingId)
    } catch (caught) {
      error.value = caught
      return false
    } finally {
      cancelling.value = null
    }
    if (isBookingEmailEnabled()) {
      requestBookingEmail({ bookingId, kind: 'cancelled' }).catch(() => undefined)
    }
    return true
  }

  const clearError = () => {
    error.value = null
  }

  return { cancelling, error, cancel, clearError }
}
