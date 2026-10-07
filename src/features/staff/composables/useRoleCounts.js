import { ref, shallowRef, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { isAbortError } from '@/shared/data/RepositoryError.js'

import { countUsersByRole } from '../data/staffRepository.js'

/**
 * Accounts by role for the Overview: administrators only (a staff store reads
 * nothing and stays `idle`); every load reads afresh, so the counts follow a Team change; nothing
 * is cached or persisted, and an identity change clears what was read under the old one.
 */
export function useRoleCounts() {
  const authStore = useAuthStore()
  const counts = ref(null)
  const status = ref('idle')
  const error = shallowRef(null)
  let generation = 0

  const clear = () => {
    counts.value = null
    error.value = null
    status.value = 'idle'
  }

  const load = async () => {
    const run = ++generation
    if (!authStore.canAccess(['admin'])) {
      clear()
      return
    }
    error.value = null
    status.value = 'loading'
    try {
      const result = await countUsersByRole({ signal: authStore.identitySignal })
      if (run !== generation) return
      counts.value = result
      status.value = 'ready'
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      error.value = caught
      status.value = 'error'
    }
  }

  watch(
    () => authStore.identityEpoch,
    () => {
      generation += 1
      clear()
    },
    { flush: 'sync' },
  )

  return { counts, status, error, load }
}
