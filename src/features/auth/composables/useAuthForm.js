import { nextTick, reactive, ref } from 'vue'

import { describeError } from '@/shared/domain/errorCopy.js'

const INVALID_SUMMARY = 'Check the highlighted fields and try again.'

/**
 * One scaffold for the auth forms (spec 9.2, decision M9): reactive values and per-field errors,
 * a form-level summary, a submitting flag, focus on the first invalid control, and the native
 * controls read at submit time because password managers fill them without an input event. The
 * action receives the validator's values (never a password) and the raw values (with it). An
 * AuthError or RepositoryError renders its message in the summary, so `AuthError('offline')` has
 * one surface (C4.15); anything else renders the shared generic line (`describeError`, C8).
 * The controls stay enabled while the action runs (a disabled control would drop focus to the
 * body); the guard below refuses a second submit instead. A rejected action moves focus to the
 * form's summary alert, the element marked `data-form-summary` with `tabindex="-1"`.
 *
 * @param {{
 *   initial: Record<string, string>,
 *   validate: (raw: Record<string, string>) => { isValid: boolean, values: object, errors: Record<string, string> },
 *   submit: (values: object, raw: Record<string, string>) => Promise<unknown>
 * }} options
 */
export function useAuthForm({ initial, validate, submit: action }) {
  const names = Object.keys(initial)
  const values = reactive({ ...initial })
  const errors = reactive(Object.fromEntries(names.map((name) => [name, ''])))
  const summary = ref('')
  const submitting = ref(false)

  const readNativeControls = (form) => {
    if (!form || typeof FormData === 'undefined') {
      return
    }
    const data = new FormData(form)
    for (const name of names) {
      const value = data.get(name)
      if (typeof value === 'string') {
        values[name] = value
      }
    }
  }

  const focusFirstInvalid = async (form) => {
    const name = names.find((field) => errors[field])
    if (!name) {
      return
    }
    await nextTick()
    form?.querySelector(`[name="${name}"]`)?.focus()
  }

  const focusSummary = async (form) => {
    await nextTick()
    form?.querySelector('[data-form-summary]')?.focus()
  }

  /** Bound to `@submit.prevent`; the event's form is read before validation. */
  const submit = async (event) => {
    if (submitting.value) {
      return false
    }
    const form = event?.currentTarget ?? null
    summary.value = ''
    readNativeControls(form)
    const validation = validate({ ...values })
    Object.assign(errors, validation.errors)
    if (!validation.isValid) {
      summary.value = INVALID_SUMMARY
      await focusFirstInvalid(form)
      return false
    }
    submitting.value = true
    try {
      await action(validation.values, { ...values })
      return true
    } catch (error) {
      summary.value = describeError(error)
      await focusSummary(form)
      return false
    } finally {
      submitting.value = false
    }
  }

  const reset = () => {
    Object.assign(values, initial)
    for (const name of names) {
      errors[name] = ''
    }
    summary.value = ''
    submitting.value = false
  }

  return { values, errors, summary, submitting, submit, reset }
}
