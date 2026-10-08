import { nextTick, ref, shallowRef } from 'vue'

import { resolveCorrection } from '../data/staffRepository.js'

import { useStaffCatalogue } from './useStaffCatalogue.js'

/**
 * Mark applied and Dismiss for the corrections queue, one correction at a time.
 * After a success, or a conflict (another staff member already handled it), the catalogue
 * reloads so the queue shows the new status; any other failure keeps the loaded queue and
 * reports the error. `message` is plain text for a mounted role="status" line; with
 * `focusTarget` (a ref to that line, tabindex="-1"), focus moves there when a started triage
 * settles, because the card's buttons may be gone and focus would otherwise fall to <body>.
 */
export function useCorrectionTriage({ focusTarget = null } = {}) {
  const catalogue = useStaffCatalogue()
  const pendingId = ref(null)
  const error = shallowRef(null)
  const message = ref('')

  const refresh = async () => {
    try {
      await catalogue.reload()
    } catch {
      // The catalogue reports its own failure (the loaded lists stay).
    }
  }

  /** @returns {Promise<boolean>} true when the correction was resolved */
  const resolve = async (correction, { status, resolutionNote = null }) => {
    if (pendingId.value !== null) return false
    pendingId.value = correction.id
    error.value = null
    message.value = ''
    try {
      await resolveCorrection(correction, { status, resolutionNote })
      message.value =
        status === 'applied'
          ? `Correction for ${correction.serviceName} marked applied.`
          : `Correction for ${correction.serviceName} dismissed.`
      await refresh()
      return true
    } catch (caught) {
      error.value = caught
      message.value = caught?.message ?? ''
      if (caught?.code === 'conflict') await refresh()
      return false
    } finally {
      pendingId.value = null
      await nextTick()
      focusTarget?.value?.focus()
    }
  }

  return { pendingId, error, message, resolve }
}
