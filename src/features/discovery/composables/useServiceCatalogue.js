import { ref } from 'vue'

import { useStaleWhileRevalidate } from '@/shared/composables/useStaleWhileRevalidate.js'

import { fetchServiceCatalogue, readCachedServiceCatalogue } from '../data/serviceRepository.js'

/**
 * Owns the asynchronous lifecycle for the public service catalogue, stale-while-revalidate
 * (spec 11): a persisted copy paints first with `freshness: 'cached'`, the fetch replaces it with
 * `'fresh'`, and a failed fetch keeps whatever is showing (the view says "Showing results saved
 * {relative time}"). Nothing is cleared when a load starts; the error panel is for a failure
 * with nothing to show. The load state itself is useStaleWhileRevalidate's.
 *
 * @param {object} [options]
 * @param {(options: { signal: AbortSignal, force: boolean }) => Promise<object>} [options.loader]
 *   Injectable loader used by production code and deterministic component tests.
 * @param {(() => { value: object, savedAt: Date } | null) | null} [options.cached]
 *   Reads the persisted copy; pass null where the public cache must never paint (staff views).
 * @param {boolean} [options.autoLoad=true]
 *   Set false when a route must redirect before making a network request.
 * @returns {{
 *   status: import('vue').Ref<'idle' | 'loading' | 'ready' | 'error'>,
 *   services: import('vue').Ref<object[]>,
 *   metadata: import('vue').Ref<object>,
 *   truncated: import('vue').Ref<boolean>,
 *   skippedCount: import('vue').Ref<number>,
 *   freshness: import('vue').Ref<'none' | 'cached' | 'fresh'>,
 *   savedAt: import('vue').Ref<Date | null>,
 *   error: import('vue').Ref<import('@/shared/data/RepositoryError.js').RepositoryError | null>,
 *   errorMessage: import('vue').ComputedRef<string>,
 *   revalidating: import('vue').ComputedRef<boolean>,
 *   load: (options?: { force?: boolean }) => Promise<void>,
 *   retry: () => Promise<void>
 * }}
 */
export function useServiceCatalogue({
  loader = fetchServiceCatalogue,
  cached = readCachedServiceCatalogue,
  autoLoad = true,
} = {}) {
  const services = ref([])
  const metadata = ref({})
  const truncated = ref(false)
  const skippedCount = ref(0)

  const apply = (catalogue) => {
    services.value = catalogue.services
    metadata.value = catalogue.metadata ?? {}
    truncated.value = catalogue.truncated === true
    skippedCount.value = catalogue.skippedCount ?? 0
  }

  const reset = () => {
    services.value = []
    metadata.value = {}
    truncated.value = false
    skippedCount.value = 0
  }

  const loadState = useStaleWhileRevalidate({ loader, cached, apply, reset, autoLoad })

  return { ...loadState, services, metadata, truncated, skippedCount }
}
