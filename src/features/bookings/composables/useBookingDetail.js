import { computed, onBeforeUnmount, ref, toValue, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { isAbortError } from '@/shared/data/RepositoryError.js'

import { fetchBooking, fetchBookingSession } from '../data/bookingRepository.js'

/**
 * One booking by id and its current session (spec 7.7). The page is refresh-safe: the owner
 * reads the booking by id, then the session in any status; a session that cannot be read leaves
 * `session` null, which the page shows as "Current session status not confirmed" (D6). Reloads
 * on a new id and on every identity change.
 *
 * @param {{ bookingId: import('vue').MaybeRefOrGetter<string> }} options
 */
export function useBookingDetail({ bookingId }) {
  const authStore = useAuthStore()
  const status = ref('idle')
  const error = ref(null)
  const errorMessage = computed(() => error.value?.message ?? '')
  const booking = ref(null)
  const session = ref(null)
  const sessionState = computed(() => {
    if (session.value === null) return 'unconfirmed'
    return session.value.status === 'cancelled' ? 'cancelled' : 'current'
  })

  let controller = null
  let generation = 0

  const load = async () => {
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    const run = ++generation
    status.value = 'loading'
    error.value = null
    booking.value = null
    session.value = null
    try {
      const loaded = await fetchBooking(toValue(bookingId), { signal })
      if (run !== generation) return
      let current = null
      try {
        current = await fetchBookingSession(loaded.sessionId, { signal })
      } catch (caught) {
        if (isAbortError(caught)) throw caught
      }
      if (run !== generation) return
      booking.value = loaded
      session.value = current
      status.value = 'ready'
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      error.value = caught
      status.value = 'error'
    }
  }

  watch([() => toValue(bookingId), () => authStore.identityEpoch], () => void load(), {
    immediate: true,
  })
  onBeforeUnmount(() => {
    generation += 1
    controller?.abort()
  })

  return { status, error, errorMessage, booking, session, sessionState, load, retry: load }
}
