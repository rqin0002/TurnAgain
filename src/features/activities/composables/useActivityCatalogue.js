import { onBeforeUnmount, onMounted, ref } from 'vue'

import { useStaleWhileRevalidate } from '@/shared/composables/useStaleWhileRevalidate.js'

import {
  clearActivityCache,
  fetchPublicActivityCatalogue,
  readCachedActivityCatalogue,
} from '../data/activityRepository.js'

/**
 * Clears the five-minute in-memory catalogue cache after a booking or cancel changed session
 * counts, so the next catalogue load reads Firestore. Pages already showing the catalogue are not
 * refreshed, and the saved offline copy still paints first until that read replaces it.
 */
export function invalidateActivityCatalogue() {
  clearActivityCache()
}

/**
 * The public activity catalogue for the Activities list, an activity's page and Find nearby,
 * with one abortable request at a time. Stale-while-revalidate: the saved copy paints first with
 * `freshness: 'cached'`, the fetch replaces it with `'fresh'`, and a failed fetch keeps what is
 * showing; nothing is cleared when a load starts. `loader` and `cached` can be replaced (tests
 * do; `cached: null` never paints a saved copy). The load state itself is
 * useStaleWhileRevalidate's; this adds the activity fields and the page clock (`now`).
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
