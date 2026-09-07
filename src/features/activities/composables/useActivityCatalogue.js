import { onBeforeUnmount, onMounted, ref } from 'vue'

import { fetchPublicActivityCatalogue } from '../data/activityRepository.js'

const PUBLIC_ERROR_MESSAGE =
  'We could not load the activity catalogue. Check your connection and try again.'

/**
 * Owns one abortable activity-catalogue request and prevents superseded reads
 * from replacing newer state. Staff can inject the staff repository loader.
 */
export function useActivityCatalogue({
  loader = fetchPublicActivityCatalogue,
  autoLoad = true,
} = {}) {
  const status = ref('idle')
  const activities = ref([])
  const sessions = ref([])
  const now = ref(new Date())
  const errorMessage = ref('')

  let activeController
  let requestSequence = 0
  let clockInterval

  // Session expiry is local presentation state; advancing it does not poll
  // Firestore or introduce extra reads while an activity page stays open.
  const updateClock = () => {
    now.value = new Date()
  }

  const load = async () => {
    activeController?.abort()
    activeController = new AbortController()
    const requestId = ++requestSequence

    status.value = 'loading'
    errorMessage.value = ''

    try {
      const catalogue = await loader({ signal: activeController.signal })
      if (requestId !== requestSequence || activeController.signal.aborted) {
        return
      }

      activities.value = catalogue.activities
      sessions.value = catalogue.sessions
      status.value = 'ready'
    } catch (error) {
      if (error?.name === 'AbortError' || requestId !== requestSequence) {
        return
      }

      activities.value = []
      sessions.value = []
      errorMessage.value = PUBLIC_ERROR_MESSAGE
      status.value = 'error'
    }
  }

  onMounted(() => {
    updateClock()
    clockInterval = window.setInterval(updateClock, 30000)
    document.addEventListener('visibilitychange', updateClock)
    if (autoLoad) {
      void load()
    }
  })
  onBeforeUnmount(() => {
    requestSequence += 1
    activeController?.abort()
    window.clearInterval(clockInterval)
    document.removeEventListener('visibilitychange', updateClock)
  })

  return { status, activities, sessions, now, errorMessage, retry: load }
}
