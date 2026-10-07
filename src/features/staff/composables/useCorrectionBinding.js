import { computed, ref, toValue } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { CORRECTION_NOTICES, bindCorrection } from '../domain/correctionBinding.js'

import { useStaffCatalogue } from './useStaffCatalogue.js'

/** The refusal of a save bound to a correction triaged after the page loaded. */
const CORRECTION_NOT_OPEN = 'correction-not-open'

/**
 * The `?correction=<id>` of a record edit, for StaffRecordView:
 * the bound correction (or null) and the notice the page shows above the form. `saveWith(run)`
 * runs the page's save with the bound id (null unless bound), so the correction is marked applied
 * in that save's batch; after a save that carried it, the query key is dropped, and while that
 * save runs the notice is silent, so the page never goes on to say the correction "is already
 * handled" once the catalogue reloads with it applied. When that save is refused because the
 * correction was applied or dismissed in another window after the page loaded (`conflict` with
 * `details.code` `correction-not-open`), the record is saved again without it and the notice says
 * the correction is already handled.
 *
 * @param {{ kind: import('vue').MaybeRefOrGetter<string>, recordId: import('vue').MaybeRefOrGetter<string> }} options
 */
export function useCorrectionBinding({ kind, recordId }) {
  const route = useRoute()
  const router = useRouter()
  const catalogue = useStaffCatalogue()
  const applying = ref(null)
  // The id refused as no longer open; this page never sends it again.
  const handled = ref(null)

  const requestedId = computed(() => {
    const value = route.query.correction
    const first = Array.isArray(value) ? value[0] : value
    return typeof first === 'string' ? first : ''
  })
  // Without a `?correction=` the catalogue's corrections are not read at all.
  const binding = computed(() =>
    requestedId.value === ''
      ? { correction: null, notice: '' }
      : bindCorrection({
          correctionId: requestedId.value,
          kind: toValue(kind),
          recordId: toValue(recordId),
          corrections: catalogue.status.value === 'ready' ? catalogue.corrections.value : null,
        }),
  )
  const refusedHere = computed(() => handled.value !== null && handled.value === requestedId.value)
  const correction = computed(() => (refusedHere.value ? null : binding.value.correction))
  const correctionId = computed(() => correction.value?.id ?? null)
  const notice = computed(() => {
    if (applying.value !== null && applying.value === requestedId.value) return ''
    return refusedHere.value ? CORRECTION_NOTICES.notOpen : binding.value.notice
  })

  const isNotOpenRefusal = (error) =>
    error?.code === 'conflict' && error.details?.code === CORRECTION_NOT_OPEN

  /**
   * @template T
   * @param {(correctionId: string | null) => Promise<T>} run - the save, given the id to apply
   * @returns {Promise<T>}
   */
  const saveWith = async (run) => {
    const id = correctionId.value
    applying.value = id
    try {
      let saved
      try {
        saved = await run(id)
      } catch (error) {
        if (id === null || !isNotOpenRefusal(error)) throw error
        // Handled in another window since the page loaded: say so and save the record alone.
        handled.value = id
        applying.value = null
        return await run(null)
      }
      if (id !== null) {
        const query = { ...route.query }
        delete query.correction
        await router.replace({ query, hash: route.hash })
      }
      return saved
    } finally {
      applying.value = null
    }
  }

  return { correction, notice, correctionId, saveWith }
}
