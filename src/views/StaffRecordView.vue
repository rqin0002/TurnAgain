<script setup>
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ActivityForm from '@/features/staff/components/ActivityForm.vue'
import ServiceForm from '@/features/staff/components/ServiceForm.vue'
import SessionForm from '@/features/staff/components/SessionForm.vue'
import { useCorrectionBinding } from '@/features/staff/composables/useCorrectionBinding.js'
import { useRecordForm } from '@/features/staff/composables/useRecordForm.js'
import { useStaffRecord } from '@/features/staff/composables/useStaffRecord.js'
import {
  DRAFT_FIELD_LABELS,
  SESSION_LOCKED_FIELDS,
  blankActivityDraft,
  blankServiceDraft,
  blankSessionDraft,
  draftFieldOf,
  hasBookings,
  toActivityDraft,
  toServiceDraft,
  toSessionDraft,
  validateActivityDraft,
  validateServiceDraft,
  validateSessionDraft,
} from '@/features/staff/domain/recordDrafts.js'
import AppButton from '@/shared/components/AppButton.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { isValidId } from '@/shared/domain/catalogueValidation.js'

/**
 * Create and edit a service, an activity or a session: the record comes from
 * the staff catalogue (edit) or a blank draft (create; `?activity=` preselects a session's
 * activity), the form is one of three explicit templates, and the states are loading, not-found,
 * editing, saving, saved (the banner takes focus), conflict (the draft stays until Reload, which
 * then lists each changed field with "Use mine") and error. A create that succeeds becomes
 * the record's edit page. Nothing is ever removed: archive and cancel are register actions.
 */
const props = defineProps({
  kind: { type: String, required: true },
  recordId: { type: String, default: '' },
})

const KINDS = Object.freeze({
  services: {
    noun: 'service',
    blank: () => blankServiceDraft(),
    toDraft: toServiceDraft,
    validate: validateServiceDraft,
    newHeading: 'New service',
    back: '/staff/services',
  },
  activities: {
    noun: 'activity',
    blank: () => blankActivityDraft(),
    toDraft: toActivityDraft,
    validate: validateActivityDraft,
    newHeading: 'New activity',
    back: '/staff/sessions',
  },
  sessions: {
    noun: 'session',
    blank: (query) =>
      blankSessionDraft({ activityId: isValidId(query.activity) ? query.activity : '' }),
    toDraft: toSessionDraft,
    validate: validateSessionDraft,
    newHeading: 'New session',
    back: '/staff/sessions',
  },
})

const route = useRoute()
const router = useRouter()
const config = computed(() => KINDS[props.kind])
const isNew = computed(() => props.recordId === '')
// One instance serves successive records and a page can stay open past Melbourne midnight,
// so each save reads the clock; the source badge measures against the last reading.
const now = shallowRef(new Date())
const {
  catalogue,
  record,
  state: recordState,
  save,
  fetchLatest,
} = useStaffRecord(
  () => props.kind,
  () => props.recordId,
)
// `?correction=` is applied only with an open correction of this very service.
const { notice: correctionNotice, saveWith } = useCorrectionBinding({
  kind: () => props.kind,
  recordId: () => props.recordId,
})
const activities = computed(() => catalogue.activities.value)
const validate = (draft) => {
  now.value = new Date()
  return config.value.validate(draft, {
    isNew: isNew.value,
    now: now.value,
    activities: activities.value,
    locked: locked.value,
    storedType: record.value?.registrationType ?? null,
  })
}

const form = useRecordForm({
  initial: config.value.blank(route.query),
  validate,
  // A save keeps the create-or-edit it started as, the retry without a correction included.
  save: (values) => {
    const savingNew = isNew.value
    return saveWith((correctionId) => save(values, { isNew: savingNew, correctionId }))
  },
  fetchLatest: async () => config.value.toDraft(await fetchLatest()),
  fieldOf: (field) => draftFieldOf(props.kind, field),
  // After a conflict Reload, a session that gained bookings keeps its time, venue and
  // activity, so "Use mine" cannot put the stale ones back.
  lockedFields: (latest) =>
    props.kind === 'sessions' && hasBookings(latest) ? SESSION_LOCKED_FIELDS : [],
})
const { formRef, draft, errors, summary, state, message, conflictFields, submitting } = form
// A session with bookings keeps its time, venue and activity.
const locked = computed(() => props.kind === 'sessions' && hasBookings(draft.value))

// An edit starts from the catalogue's record once it is there; a later catalogue refresh (a save
// elsewhere, an identity change) never resets the draft. A create starts blank.
let loadedFromRecord = isNew.value
watch(
  record,
  (value) => {
    if (value && !loadedFromRecord) {
      loadedFromRecord = true
      form.reset(config.value.toDraft(value))
    }
  },
  { immediate: true },
)
// History to another record (or between a create and an edit page) keeps this instance, because
// the staff RouterView is unkeyed: the form starts over from that page's record, after
// useRecordForm has asked about unsaved changes. The replace that follows a create keeps its saved
// draft; onSubmit hands it the stored record.
watch(
  () => [props.kind, props.recordId],
  ([, nextId], [, previousId]) => {
    if (previousId === '' && nextId !== '' && state.value === 'saved') return
    loadedFromRecord = isNew.value || record.value !== null
    form.reset(record.value ? config.value.toDraft(record.value) : config.value.blank(route.query))
  },
)

const heading = computed(() => {
  if (isNew.value) return config.value.newHeading
  return `Edit ${record.value?.name ?? record.value?.title ?? config.value.noun}`
})
const labels = computed(() => DRAFT_FIELD_LABELS[props.kind])
const showValue = (value) => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '(none)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return value === '' || value === null ? '(empty)' : String(value)
}
const alertText = computed(() => {
  if (state.value === 'conflict' || state.value === 'error') return message.value
  return ''
})

// Reload and Use mine remove themselves, so focus moves on to what they leave behind.
const pageHeading = ref(null)
const changesSection = ref(null)
const changesHeading = ref(null)
// Try again leaves with its error panel once the reload starts, so focus moves first to the heading
// that stays mounted over the loading state.
const retryCatalogue = () => {
  pageHeading.value?.focus()
  return catalogue.reload()
}
const onReload = async () => {
  await form.reload()
  // A failed fetch keeps the conflict, its Reload and the focus on it; the alert says why.
  if (state.value === 'conflict') return
  await nextTick()
  ;(changesHeading.value ?? pageHeading.value)?.focus()
}
const onUseMine = async (field) => {
  const index = conflictFields.value.findIndex((entry) => entry.field === field)
  const restorable = (entry) => !entry.locked && entry.field !== field
  const next =
    conflictFields.value.slice(index + 1).find(restorable) ??
    conflictFields.value.slice(0, index).findLast(restorable)
  form.useMine(field)
  await nextTick()
  if (next) {
    changesSection.value?.querySelector(`[data-use-mine="${next.field}"]`)?.focus()
  } else if (conflictFields.value.length > 0) {
    changesHeading.value?.focus()
  } else {
    // A field with no control of its own on the page (a checkbox group, a map field while "Show on
    // map" is off) falls back to the page heading.
    const control = formRef.value?.querySelector(`#${config.value.noun}-${field}`)
    ;(control ?? pageHeading.value)?.focus()
  }
}

// A refused save turns Save disabled under the focus, and a failed one re-enables the
// fieldset after the browser has already moved the focus off the field that submitted with Enter;
// either way the focus would fall to <body>. An invalid draft already focuses its first field.
const conflictActions = ref(null)
const refocusAfterUnsavedSubmit = async (invoker) => {
  if (state.value === 'conflict') {
    await nextTick()
    conflictActions.value?.querySelector('button')?.focus()
  } else if (state.value === 'error') {
    await nextTick()
    if (document.activeElement && document.activeElement !== document.body) return
    const returnable = invoker?.isConnected && invoker !== document.body
    ;(returnable ? invoker : formRef.value?.querySelector('button[type="submit"]'))?.focus()
  }
}

const banner = ref(null)
const onSubmit = async () => {
  const invoker = document.activeElement
  const saved = await form.submit()
  if (!saved) {
    await refocusAfterUnsavedSubmit(invoker)
    return
  }
  if (isNew.value) {
    await router.replace({
      name: 'staff-record-edit',
      params: { kind: props.kind, recordId: saved.id },
    })
    // The page is now the record's edit page: the stored record (its stamps and counters, read
    // back by the save's catalogue reload) becomes the draft, and the saved banner stays.
    if (record.value) {
      form.reset(config.value.toDraft(record.value))
      state.value = 'saved'
    }
  }
  await nextTick()
  banner.value?.focus()
}
</script>

<template>
  <section class="staff-section" aria-labelledby="record-heading">
    <h2 id="record-heading" ref="pageHeading" class="section-title" tabindex="-1" dir="auto">
      {{ heading }}
    </h2>

    <StatePanel v-if="recordState === 'loading'" variant="loading" message="Loading the record…" />
    <StatePanel
      v-else-if="recordState === 'error'"
      variant="error"
      title="The record could not be loaded"
      :error="catalogue.error.value"
      @retry="retryCatalogue"
    />
    <div v-else-if="recordState === 'not-found'" class="record-missing">
      <StatePanel
        variant="notice"
        title="We could not find that record."
        message="It may have been removed, or the link may be incomplete."
      />
      <RouterLink :to="config.back">Back to the register</RouterLink>
    </div>

    <template v-else>
      <p
        v-if="state === 'saved'"
        ref="banner"
        class="record-banner"
        data-record-banner
        tabindex="-1"
      >
        Saved.
      </p>

      <div class="record-alerts" role="alert">
        <p v-if="alertText">{{ alertText }}</p>
        <template v-if="summary.length > 0">
          <p>Check these fields:</p>
          <ul>
            <li v-for="line in summary" :key="line">{{ line }}</li>
          </ul>
        </template>
      </div>

      <div v-if="state === 'conflict'" ref="conflictActions" class="record-conflict">
        <AppButton variant="secondary" @click="onReload">Reload</AppButton>
      </div>
      <section
        v-if="conflictFields.length > 0"
        ref="changesSection"
        class="record-changes"
        aria-labelledby="record-changes-heading"
      >
        <h3 id="record-changes-heading" ref="changesHeading" tabindex="-1">
          Your changes that differ from the latest version
        </h3>
        <ul>
          <li v-for="entry in conflictFields" :key="entry.field">
            <p class="record-changes__field">{{ labels[entry.field] ?? entry.field }}</p>
            <p>
              Your value: <span dir="auto">{{ showValue(entry.mine) }}</span>
            </p>
            <p>
              Current value: <span dir="auto">{{ showValue(entry.current) }}</span>
            </p>
            <p v-if="entry.locked" class="record-changes__locked">
              Locked: this session has bookings, so the current value stays.
            </p>
            <AppButton
              v-else
              variant="secondary"
              :data-use-mine="entry.field"
              @click="onUseMine(entry.field)"
            >
              Use mine
              <span class="visually-hidden">for {{ labels[entry.field] ?? entry.field }}</span>
            </AppButton>
          </li>
        </ul>
      </section>

      <p class="record-correction" role="status">{{ correctionNotice }}</p>
      <form ref="formRef" class="record-form-shell" novalidate @submit.prevent="onSubmit">
        <fieldset class="record-form-shell__fields" :disabled="submitting">
          <legend class="visually-hidden">{{ heading }}</legend>
          <ServiceForm
            v-if="kind === 'services'"
            v-model="draft"
            :errors="errors"
            :is-new="isNew"
            :now="now"
          />
          <ActivityForm
            v-else-if="kind === 'activities'"
            v-model="draft"
            :errors="errors"
            :is-new="isNew"
          />
          <SessionForm
            v-else
            v-model="draft"
            :errors="errors"
            :is-new="isNew"
            :activities="activities"
            :locked="locked && !isNew"
          />
        </fieldset>
        <div class="record-form-shell__actions">
          <AppButton type="submit" :busy="submitting" :disabled="state === 'conflict'">
            Save
          </AppButton>
          <RouterLink :to="config.back">Back to the register</RouterLink>
        </div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.staff-section {
  display: grid;
  gap: 1.25rem;
  max-width: 48rem;
  margin-top: 2rem;
}

.record-banner {
  margin: 0;
  border-left: 4px solid var(--color-brand);
  padding: 0.75rem 1rem;
  background: var(--color-brand-soft);
  color: var(--color-heading);
  font-weight: 600;
}

.record-alerts {
  color: var(--color-danger);
  font-weight: 600;
}

.record-alerts p,
.record-alerts ul {
  margin: 0;
}

.record-changes {
  display: grid;
  gap: 0.75rem;
  border: 1px solid var(--color-warning);
  border-radius: 0.5rem;
  padding: 1rem;
  background: var(--color-warning-soft);
}

.record-changes h3 {
  margin: 0;
  font-size: 1.125rem;
}

.record-changes ul {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.record-changes p {
  margin: 0;
}

.record-changes__field {
  color: var(--color-heading);
  font-weight: 600;
}

.record-changes__locked {
  color: var(--color-heading);
  font-style: italic;
}

.record-form-shell {
  display: grid;
  gap: 1.5rem;
}

.record-form-shell__fields {
  margin: 0;
  border: 0;
  padding: 0;
}

.record-form-shell__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem 1.5rem;
}
</style>
