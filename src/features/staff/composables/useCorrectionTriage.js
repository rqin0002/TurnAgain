import { nextTick, ref, shallowRef } from 'vue'

import { resolveCorrection } from '../data/staffRepository.js'

import { useStaffCatalogue } from './useStaffCatalogue.js'

/**
 * Mark applied and Dismiss on the corrections queue (spec 8.5). One triage at a time; after any
 * answer the catalogue reloads, so a card that someone else handled moves to its new status
 * instead of offering a second triage the rules would refuse. The result line is plain text for
 * a mounted `role="status"` element; with `focusTarget` (a ref to that line, which carries
 * tabindex="-1"), focus moves there once a started triage settles, because the card's buttons are
 * gone by then and would leave focus on <body> (M6-D22).
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
      // The catalogue reports its own failure (spec 11: the loaded lists stay).
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
