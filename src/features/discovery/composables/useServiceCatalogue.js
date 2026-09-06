import { onBeforeUnmount, onMounted, ref } from 'vue'

import { fetchServiceCatalogue } from '../data/serviceRepository.js'

const PUBLIC_ERROR_MESSAGE =
  'We could not load the service catalogue. Check your connection and try again.'

/**
 * Owns the asynchronous lifecycle for the public service catalogue.
 *
 * @param {object} [options]
 * @param {(options: { signal: AbortSignal }) => Promise<object>} [options.loader]
 *   Injectable loader used by production code and deterministic component tests.
 * @param {boolean} [options.autoLoad=true]
 *   Set false when a route must redirect before making a network request.
 * @returns {{
 *   status: import('vue').Ref<string>,
 *   services: import('vue').Ref<object[]>,
 *   metadata: import('vue').Ref<object>,
 *   errorMessage: import('vue').Ref<string>,
 *   retry: () => Promise<void>
 * }}
 */
export function useServiceCatalogue({ loader = fetchServiceCatalogue, autoLoad = true } = {}) {
  const status = ref('idle')
  const services = ref([])
  const metadata = ref({})
  const errorMessage = ref('')

  let activeController
  // A sequence guard prevents a slower superseded request from overwriting a
  // newer result even when an injected loader does not honour AbortSignal.
  let requestSequence = 0

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

      services.value = catalogue.services
      metadata.value = catalogue.metadata ?? {}
      status.value = 'ready'
    } catch (error) {
      if (error?.name === 'AbortError' || requestId !== requestSequence) {
        return
      }

      services.value = []
      metadata.value = {}
      errorMessage.value = PUBLIC_ERROR_MESSAGE
      status.value = 'error'
    }
  }

  const retry = () => load()

  onMounted(() => {
    if (autoLoad) {
      void load()
    }
  })
  onBeforeUnmount(() => {
    ++requestSequence
    activeController?.abort()
  })

  return {
    status,
    services,
    metadata,
    errorMessage,
    retry,
  }
}
