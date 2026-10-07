import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

import { isAbortError } from '@/shared/data/RepositoryError.js'

import { DUPLICATE_ID_MESSAGE } from '../data/staffWrites.js'

/**
 * One record form (spec 8.2 L985): the draft, its errors and the save, for the three staff forms.
 * `validate(draft)` returns `{ isValid, errors, values }` (an empty string for a valid field) and
 * `save(values)` writes the record. A refused save maps to a state: `conflict` (another window
 * saved first, R1), field errors (invalid-data, with "A record with this id already exists." for a
 * create collision, M6-D4) or `error`. After a conflict, `reload()` loads the latest record and
 * lists the person's changed fields beside the current values; nothing is merged on its own, so a
 * Save straight after Reload writes the latest record and no stale field (M6-D4). A changed field
 * the latest record locks (`lockedFields(latest)`, M6-D8: a session with bookings keeps its time,
 * venue and activity) is listed as `locked` and "Use mine" is refused for it. A dirty form asks
 * before the page changes: leaving its route, or the same route moving to another record (history
 * between two edit pages keeps the instance); a query or hash change does not ask. The instance
 * is reused across records, so a save or a Reload still in flight when the form is reset (the
 * next record, or the form unmounted) settles without touching the new draft: `submit` then
 * resolves null and the view skips its saved epilogue. `fieldOf` maps a stored field a
 * classification names to the form's field (a drafter addition; the identity by default).
 */

export const LEAVE_CONFIRM = 'Leave this page? Your unsaved changes will be lost.'
const CHECK_FIELD = 'Check this field.'

// Drafts are plain data (strings, numbers, booleans, null, arrays of strings); a JSON round trip
// copies them deeply and reads through Vue's reactive proxies.
const copy = (value) => JSON.parse(JSON.stringify(value))
const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export function useRecordForm({
  initial,
  validate,
  save,
  fetchLatest,
  fieldOf = (field) => field,
  lockedFields = () => [],
}) {
  const formRef = ref(null)
  const draft = ref(copy(initial))
  const baseline = shallowRef(copy(initial))
  const errors = ref({})
  const state = ref('editing')
  const error = shallowRef(null)
  const conflictFields = ref([])

  // The round the form is in: a reset (the next record) or the unmount starts a new one, and an
  // async step that began in an earlier round changes nothing when it settles.
  let round = 0
  const isCurrent = (started) => started === round
  onScopeDispose(() => {
    round += 1
  })

  const dirtyFields = computed(() =>
    Object.keys(draft.value).filter((key) => !sameValue(draft.value[key], baseline.value[key])),
  )
  const dirty = computed(() => dirtyFields.value.length > 0)
  const summary = computed(() => Object.values(errors.value).filter(Boolean))
  const submitting = computed(() => state.value === 'saving')
  const message = computed(() =>
    state.value === 'saved' ? 'Saved.' : (error.value?.message ?? ''),
  )

  // Editing after a save starts a new round: the saved banner gives way to the form state.
  watch(dirty, (isDirty) => {
    if (isDirty && state.value === 'saved') state.value = 'editing'
  })

  const focusFirstInvalid = async (started) => {
    await nextTick()
    if (!isCurrent(started)) return
    formRef.value?.querySelector('[aria-invalid="true"]')?.focus()
  }

  async function submit() {
    if (state.value === 'saving') return null
    const started = round
    const checked = validate(draft.value)
    errors.value = checked.errors
    if (!checked.isValid) {
      await focusFirstInvalid(started)
      return null
    }
    state.value = 'saving'
    error.value = null
    try {
      const saved = await save(checked.values)
      // A sent write completes, but it belongs to the record this form held when it started.
      if (!isCurrent(started)) return null
      // The next save steps from the stored revision, never from the one the form loaded.
      draft.value = { ...draft.value, revision: saved.revision }
      baseline.value = copy(draft.value)
      conflictFields.value = []
      state.value = 'saved'
      return saved
    } catch (caught) {
      if (!isCurrent(started)) return null
      error.value = caught
      if (caught?.code === 'conflict') {
        state.value = 'conflict'
      } else if (caught?.code === 'invalid-data' && caught.details?.fields) {
        errors.value = Object.fromEntries(
          Object.entries(caught.details.fields).map(([field, reason]) => [
            fieldOf(field),
            reason === 'exists' ? DUPLICATE_ID_MESSAGE : CHECK_FIELD,
          ]),
        )
        state.value = 'editing'
        await focusFirstInvalid(started)
      } else {
        state.value = 'error'
      }
      return null
    }
  }

  /** Starts over from `next` (or the last saved draft); whatever was in flight no longer counts. */
  function reset(next = baseline.value) {
    round += 1
    draft.value = copy(next)
    baseline.value = copy(next)
    errors.value = {}
    error.value = null
    conflictFields.value = []
    state.value = 'editing'
  }

  /**
   * M6-D4: the latest record becomes the draft; the person's changed fields wait for "Use mine",
   * except the ones the latest record locks (M6-D8), which are listed but cannot be restored. A
   * read an identity change aborted (E7) leaves the form as it was, conflict and message included.
   */
  async function reload() {
    const started = round
    let latest
    try {
      latest = copy(await fetchLatest())
    } catch (caught) {
      if (isCurrent(started) && !isAbortError(caught)) error.value = caught
      return
    }
    if (!isCurrent(started)) return
    const locked = new Set(lockedFields(latest))
    const changed = dirtyFields.value
      .filter((field) => !sameValue(draft.value[field], latest[field]))
      .map((field) => ({
        field,
        mine: copy(draft.value[field]),
        current: copy(latest[field]),
        locked: locked.has(field),
      }))
    reset(latest)
    conflictFields.value = changed
  }

  function useMine(field) {
    const entry = conflictFields.value.find((item) => item.field === field)
    if (!entry || entry.locked) return
    draft.value = { ...draft.value, [field]: copy(entry.mine) }
    conflictFields.value = conflictFields.value.filter((item) => item.field !== field)
  }

  // The leave guard follows a reused instance to its new route record (vue-router's RouterView
  // carries it over, so the edit page a create becomes still asks); the update guard covers the
  // same record with other params.
  const confirmLeave = (to, from) => {
    if (to.path === from.path || !dirty.value || state.value === 'saved') return true
    return window.confirm(LEAVE_CONFIRM)
  }
  onBeforeRouteLeave(confirmLeave)
  onBeforeRouteUpdate(confirmLeave)

  return {
    formRef,
    draft,
    errors,
    summary,
    state,
    error,
    message,
    dirty,
    dirtyFields,
    conflictFields,
    submitting,
    submit,
    reset,
    reload,
    useMine,
  }
}
