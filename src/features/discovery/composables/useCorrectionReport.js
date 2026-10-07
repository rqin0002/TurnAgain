import { reactive, ref, shallowRef, toValue, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'

import { createCorrection } from '../data/correctionRepository.js'
import { validateCorrectionInput } from '../domain/correctionValidation.js'

const EMPTY_ERRORS = Object.freeze({
  field: '',
  message: '',
  reporterEmail: '',
})

/**
 * The correction form's state: anonymous submission is allowed; a signed-in person's
 * uid becomes `reporterUid` and their email is offered in the email field (they may clear it).
 * A filled honeypot is answered exactly like a successful send, without a write, so an automated
 * submitter learns nothing. Nothing here is persisted.
 *
 * @param {import('vue').MaybeRefOrGetter<{ id: string, name: string }>} service
 */
export function useCorrectionReport(service) {
  const authStore = useAuthStore()
  const values = reactive({
    field: '',
    message: '',
    reporterEmail: authStore.user?.email ?? '',
    website: '',
  })
  const errors = ref({ ...EMPTY_ERRORS })
  const state = ref('idle')
  const error = shallowRef(null)

  // The store may settle after the form mounted: offer the address once, never over typed text.
  watch(
    () => authStore.user?.email ?? '',
    (email) => {
      if (email !== '' && values.reporterEmail === '') values.reporterEmail = email
    },
  )

  /** @returns {Promise<boolean>} whether the form reached the sent state */
  const submit = async () => {
    if (state.value === 'submitting') return false
    const check = validateCorrectionInput(values)
    if (check.isSpam) {
      errors.value = { ...EMPTY_ERRORS }
      state.value = 'sent'
      return true
    }
    errors.value = check.errors
    if (!check.isValid) {
      // An earlier thanks or failure no longer describes this form, and the view only moves
      // focus to the first invalid field from the idle state.
      state.value = 'idle'
      error.value = null
      return false
    }
    const target = toValue(service)
    state.value = 'submitting'
    error.value = null
    try {
      await createCorrection({
        serviceId: target.id,
        serviceName: target.name,
        field: check.values.field,
        message: check.values.message,
        reporterEmail: check.values.reporterEmail,
        reporterUid: authStore.user?.uid ?? null,
      })
      values.field = ''
      values.message = ''
      state.value = 'sent'
      return true
    } catch (caught) {
      error.value = caught
      state.value = 'failed'
      return false
    }
  }

  return { values, errors, state, error, submit }
}
