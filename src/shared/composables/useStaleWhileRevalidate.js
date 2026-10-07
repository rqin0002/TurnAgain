import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { RepositoryError, isRepositoryError } from '../data/RepositoryError.js'

/**
 * The stale-while-revalidate load state shared by the public catalogues (spec 11): a persisted
 * copy paints first with `freshness: 'cached'`, the fetch replaces it with `'fresh'`, and a
 * failed fetch keeps whatever is showing (the views say "Showing results saved {relative time}").
 * Nothing is cleared when a load starts; the error status is for a failure with nothing to show.
 * The caller owns its data refs and hands over how to fill them (`apply`) and empty them
 * (`reset`).
 *
 * @param {object} options
 * @param {(options: { signal: AbortSignal, force: boolean }) => Promise<object>} options.loader
 * @param {(() => { value: object, savedAt: Date } | null) | null} options.cached
 *   Reads the persisted copy; null where the public cache must never paint (staff views).
 * @param {(catalogue: object) => void} options.apply Copies a catalogue into the caller's refs.
 * @param {() => void} options.reset Empties the caller's refs when a load fails with no copy.
 * @param {boolean} options.autoLoad Loads on mount when true.
 * @returns {{
 *   status: import('vue').Ref<'idle' | 'loading' | 'ready' | 'error'>,
 *   freshness: import('vue').Ref<'none' | 'cached' | 'fresh'>,
 *   savedAt: import('vue').Ref<Date | null>,
 *   error: import('vue').Ref<RepositoryError | null>,
 *   errorMessage: import('vue').ComputedRef<string>,
 *   revalidating: import('vue').ComputedRef<boolean>,
 *   load: (options?: { force?: boolean }) => Promise<void>,
 *   retry: () => Promise<void>
 * }}
 */
export function useStaleWhileRevalidate({ loader, cached, apply, reset, autoLoad }) {
  const status = ref('idle')
  const freshness = ref('none')
  const savedAt = ref(null)
  const error = ref(null)
  const errorMessage = computed(() => error.value?.message ?? '')
  // A cached paint stays unconfirmed until the fetch answers: success makes it fresh and a
  // failure sets the error, so a record missing from the copy is not yet known to be gone.
  const revalidating = computed(() => freshness.value === 'cached' && error.value === null)

  let activeController
  // A sequence guard prevents a slower superseded request from overwriting a
  // newer result even when an injected loader does not honour AbortSignal.
  let requestSequence = 0
  let loadedAt = null

  const paintCachedCopy = () => {
    const hit = cached ? cached() : null
    if (!hit) {
      return
    }
    apply(hit.value)
    freshness.value = 'cached'
    savedAt.value = hit.savedAt
    status.value = 'ready'
  }

  const load = async ({ force = false } = {}) => {
    activeController?.abort()
    activeController = new AbortController()
    const requestId = ++requestSequence

    error.value = null
    if (freshness.value === 'none') {
      paintCachedCopy()
    }
    if (freshness.value === 'none') {
      status.value = 'loading'
    }

    try {
      const catalogue = await loader({ signal: activeController.signal, force })
      if (requestId !== requestSequence || activeController.signal.aborted) {
        return
      }

      apply(catalogue)
      loadedAt = new Date()
      freshness.value = 'fresh'
      savedAt.value = null
      status.value = 'ready'
    } catch (caught) {
      if (caught?.name === 'AbortError' || requestId !== requestSequence) {
        return
      }

      error.value = isRepositoryError(caught)
        ? caught
        : new RepositoryError('unavailable', undefined, { cause: caught })
      if (freshness.value === 'none') {
        reset()
        status.value = 'error'
        return
      }
      // Whatever is showing stays; it is now a saved copy, dated by its own paint or fetch.
      freshness.value = 'cached'
      savedAt.value = savedAt.value ?? loadedAt
    }
  }

  const retry = () => load({ force: true })

  onMounted(() => {
    if (autoLoad) {
      void load()
    }
  })
  onBeforeUnmount(() => {
    requestSequence += 1
    activeController?.abort()
  })

  return { status, freshness, savedAt, error, errorMessage, revalidating, load, retry }
}
