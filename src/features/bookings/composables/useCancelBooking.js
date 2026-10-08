import { ref, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'

import {
  cancelBooking,
  isBookingEmailEnabled,
  requestBookingEmail,
} from '../data/bookingRepository.js'

/**
 * One cancel at a time for a page. cancel(bookingId) resolves true once the cancellation has
 * committed, and false when it was refused (the reason stays in "error"), when another cancel
 * from this instance is still running, or when the identity epoch changed while it ran (another
 * account, a sign-out, or a re-read profile whose role, revision or email changed). After a commit
 * it asks for the "cancelled" email without waiting, when this build has functions; an email
 * failure never changes the result. "error" stays until the page calls clearError(), which the
 * page does whenever its dialog opens or closes. An identity-epoch change clears "cancelling" and
 * "error" at once; an answer from before it then sets neither and asks for no email.
 */
export function useCancelBooking() {
  const authStore = useAuthStore()
  const cancelling = ref(null)
  const error = ref(null)

  // An identity-epoch change (another account, a sign-out or a re-read profile change) ends the
  // running cancel for this page at once: busy and error clear, so the next account's dialog never
  // shows the previous account's attempt.
  watch(
    () => authStore.identityEpoch,
    () => {
      cancelling.value = null
      error.value = null
    },
    { flush: 'sync' },
  )

  /** @returns {Promise<boolean>} true when it committed and the identity epoch has not changed */
  const cancel = async (bookingId) => {
    if (cancelling.value !== null) return false
    // The identity epoch the cancel starts under. After any identity-epoch change (another account,
    // a sign-out, or a re-read profile whose role, revision or email changed, the same account's
    // included) this cancel touches no state, reports false and asks for no email.
    const epoch = authStore.identityEpoch
    const sameAccount = () => authStore.identityEpoch === epoch
    cancelling.value = bookingId
    error.value = null
    try {
      await cancelBooking(bookingId)
    } catch (caught) {
      if (sameAccount()) error.value = caught
      return false
    } finally {
      if (sameAccount()) cancelling.value = null
    }
    if (!sameAccount()) return false
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
