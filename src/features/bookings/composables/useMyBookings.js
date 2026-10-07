import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toValue, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { isAbortError } from '@/shared/data/RepositoryError.js'

import { fetchSessionsForBookings, listMyBookings } from '../data/bookingRepository.js'
import { splitBookings } from '../domain/bookingRules.js'

/**
 * One signal that aborts when either of two does (AbortSignal.any is not in every engine). The
 * identity signal lives as long as the session, so `release()` takes the listener off both
 * sources once a load settles instead of leaving one behind per load.
 */
const eitherSignal = (first, second) => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const sources = []
  for (const signal of [first, second]) {
    if (!signal) continue
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', abort, { once: true })
    sources.push(signal)
  }
  const release = () => {
    for (const signal of sources) signal.removeEventListener('abort', abort)
  }
  return { signal: controller.signal, release }
}

/**
 * The signed-in member's bookings: snapshots render as soon as they load,
 * then the current sessions arrive in chunks; a session that did not load leaves its bookings
 * `unconfirmed`, never cancelled. Member-private, so nothing is persisted, and every identity
 * change aborts the requests in flight, empties the lists and loads again.
 * `autoLoad` may be a getter: the list then loads on mount, on an identity change and when the
 * getter turns true, only while it reads true.
 *
 * @param {{ autoLoad?: import('vue').MaybeRefOrGetter<boolean>, withSessions?: boolean }} [options]
 */
export function useMyBookings({ autoLoad = true, withSessions = true } = {}) {
  const authStore = useAuthStore()
  const status = ref('idle')
  const error = ref(null)
  const errorMessage = computed(() => error.value?.message ?? '')
  const bookings = ref([])
  const truncated = ref(false)
  const sessionsById = shallowRef(new Map())
  const sessionsLoading = ref(false)
  const now = ref(new Date())

  const split = computed(() => splitBookings(bookings.value, sessionsById.value, now.value))
  const wanted = () => toValue(autoLoad)

  let controller = null
  let generation = 0
  let mounted = false

  const clear = () => {
    bookings.value = []
    truncated.value = false
    sessionsById.value = new Map()
    sessionsLoading.value = false
    error.value = null
    status.value = 'idle'
  }

  const loadSessions = async (run, signal) => {
    sessionsLoading.value = true
    try {
      const ids = [...new Set(bookings.value.map((booking) => booking.sessionId))]
      const { sessions } = await fetchSessionsForBookings(ids, { signal })
      if (run !== generation) return
      sessionsById.value = new Map(sessions.map((session) => [session.id, session]))
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      // Every booking stays unconfirmed: the snapshots still show, nothing reads as cancelled.
      sessionsById.value = new Map()
    } finally {
      if (run === generation) sessionsLoading.value = false
    }
  }

  const load = async () => {
    controller?.abort()
    controller = new AbortController()
    const run = ++generation
    if (!authStore.isSignedIn || !authStore.user?.uid) {
      clear()
      return
    }
    const { signal, release } = eitherSignal(authStore.identitySignal, controller.signal)
    error.value = null
    if (status.value !== 'ready') status.value = 'loading'
    try {
      const result = await listMyBookings(authStore.user.uid, { signal })
      if (run !== generation) return
      bookings.value = result.bookings
      truncated.value = result.truncated
      now.value = new Date()
      status.value = 'ready'
      if (withSessions) await loadSessions(run, signal)
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      error.value = caught
      status.value = 'error'
    } finally {
      release()
    }
  }

  watch(
    () => authStore.identityEpoch,
    () => {
      controller?.abort()
      generation += 1
      clear()
      if (mounted && wanted()) void load()
    },
  )
  watch(wanted, (value) => {
    if (value && mounted && status.value === 'idle') void load()
  })

  onMounted(() => {
    mounted = true
    if (wanted()) void load()
  })
  onBeforeUnmount(() => {
    mounted = false
    generation += 1
    controller?.abort()
  })

  return {
    status,
    error,
    errorMessage,
    bookings,
    truncated,
    sessionsById,
    sessionsLoading,
    now,
    split,
    load,
    retry: load,
  }
}
