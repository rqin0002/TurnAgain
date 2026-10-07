import { computed, shallowRef, toValue, watch } from 'vue'

import { useStaleWhileRevalidate } from '@/shared/composables/useStaleWhileRevalidate.js'

import { fetchService, readCachedServiceCatalogue } from '../data/serviceRepository.js'

/**
 * One published service for Service Detail, on the
 * stale-while-revalidate primitive: the persisted catalogue copy paints the record
 * at once when it holds the id, and `fetchService` (the catalogue memory cache first, then one
 * `getDoc`) replaces it, so list -> detail -> Back is one read. A copy without the id paints
 * nothing: the loading panel stays while the fetch runs, because a saved copy that predates the
 * record proves nothing about it. `notFound` is the fetch's own answer (`RepositoryError`
 * `not-found`), never an inference from the copy, and it outranks the copy: the saved record is
 * cleared, while a network failure keeps it on screen. A new id (the router reuses the
 * view) starts over as a first load, so nothing of the previous id stays on screen.
 *
 * @param {import('vue').MaybeRefOrGetter<string>} serviceId
 * @param {object} [options]
 * @param {(serviceId: string, options: { signal: AbortSignal, force: boolean }) => Promise<object>} [options.loader]
 * @param {(() => { value: { services: object[] }, savedAt: Date } | null) | null} [options.cached]
 * @param {boolean} [options.autoLoad=true]
 */
export function useService(
  serviceId,
  { loader = fetchService, cached = readCachedServiceCatalogue, autoLoad = true } = {},
) {
  const service = shallowRef(null)

  const cachedRecord = () => {
    const hit = cached ? cached() : null
    const copy = hit?.value?.services?.find((candidate) => candidate.id === toValue(serviceId))
    return copy ? { value: copy, savedAt: hit.savedAt } : null
  }

  const loadState = useStaleWhileRevalidate({
    loader: ({ signal, force }) => loader(toValue(serviceId), { signal, force }),
    cached: cached ? cachedRecord : null,
    apply: (record) => {
      service.value = record
    },
    reset: () => {
      service.value = null
    },
    autoLoad,
  })

  const notFound = computed(() => loadState.error.value?.code === 'not-found')
  // The primitive keeps a painted copy through any failed fetch. The server saying the record does
  // not exist is not a connection problem: the copy goes, as for a first load with nothing saved.
  watch(
    notFound,
    (gone) => {
      if (!gone) return
      service.value = null
      loadState.freshness.value = 'none'
      loadState.savedAt.value = null
      loadState.status.value = 'error'
    },
    { flush: 'sync' },
  )

  // The primitive keeps whatever is showing across loads. That is right for the same
  // record and wrong for another one: clear the record and the freshness first, so the new id's
  // saved copy may paint, the loading panel shows otherwise, and a failed fetch is an error, not
  // the previous record relabelled as a saved copy.
  watch(
    () => toValue(serviceId),
    () => {
      service.value = null
      loadState.freshness.value = 'none'
      loadState.savedAt.value = null
      void loadState.load()
    },
  )

  return { ...loadState, service, notFound }
}
