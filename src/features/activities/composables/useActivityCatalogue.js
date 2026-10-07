import { onBeforeUnmount, onMounted, ref } from 'vue'

import { useStaleWhileRevalidate } from '@/shared/composables/useStaleWhileRevalidate.js'

import {
  clearActivityCache,
  fetchPublicActivityCatalogue,
  readCachedActivityCatalogue,
} from '../data/activityRepository.js'

/**
 * Drops the five-minute module cache after a booking or a cancel moved the counters, so
 * the next catalogue load reads Firestore; the bookings feature calls this, never the repository.
 */
export function invalidateActivityCatalogue() {
  clearActivityCache()
}

/**
 * Owns one abortable activity-catalogue request, stale-while-revalidate: the persisted
 * copy paints first with `freshness: 'cached'`, the fetch replaces it with `'fresh'`, and a
 * failed fetch keeps what is showing. Nothing is cleared when a load starts. Staff inject the
 * staff repository loader and `cached: null`, so the public cache never paints a register. The
 * load state itself is useStaleWhileRevalidate's; this adds the activity fields and the clock.
 *
 * @param {object} [options]
 * @param {(options: { signal: AbortSignal, force: boolean }) => Promise<object>} [options.loader]
 * @param {(() => { value: object, savedAt: Date } | null) | null} [options.cached]
 * @param {boolean} [options.autoLoad=true]
 */
export function useActivityCatalogue({
  loader = fetchPublicActivityCatalogue,
  cached = readCachedActivityCatalogue,
  autoLoad = true,
} = {}) {
  const activities = ref([])
  const sessions = ref([])
  const truncated = ref(false)
  const skippedCount = ref(0)
  const now = ref(new Date())

  let clockInterval

  // Session expiry is local presentation state; advancing it does not poll
  // Firestore or introduce extra reads while an activity page stays open.
  const updateClock = () => {
    now.value = new Date()
  }

  const apply = (catalogue) => {
    activities.value = catalogue.activities
    sessions.value = catalogue.sessions
    truncated.value = catalogue.truncated === true
    skippedCount.value = catalogue.skippedCount ?? 0
  }

  const reset = () => {
    activities.value = []
    sessions.value = []
    truncated.value = false
    skippedCount.value = 0
  }

  // Registered before the load state's own hooks, so the clock is current when the load starts.
  onMounted(() => {
    updateClock()
    clockInterval = window.setInterval(updateClock, 30000)
    document.addEventListener('visibilitychange', updateClock)
  })
  onBeforeUnmount(() => {
    window.clearInterval(clockInterval)
    document.removeEventListener('visibilitychange', updateClock)
  })

  const loadState = useStaleWhileRevalidate({ loader, cached, apply, reset, autoLoad })

  return { ...loadState, activities, sessions, truncated, skippedCount, now }
}
