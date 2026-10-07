<script setup>
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { CORRECTION_FIELD_LABELS } from '@/features/discovery/domain/correctionValidation.js'
import { useCorrectionTriage } from '@/features/staff/composables/useCorrectionTriage.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import {
  correctionsWithStatus,
  normalizeCorrectionStatus,
  validateResolutionNote,
} from '@/features/staff/domain/correctionBinding.js'
import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { formatDate, formatTime } from '@/shared/domain/formatDate.js'

/**
 * The corrections queue: a card list per `?status=` (open by default), newest
 * first, from the staff catalogue. An open card links to the listing's edit form with the
 * correction bound (`?correction=`), and offers Mark applied and Dismiss with an optional note.
 * There is no Delete and no export, so reporter emails never leave the queue.
 */
const route = useRoute()
const catalogue = useStaffCatalogue()
// The result line takes focus once a triage settles: the card and its buttons are gone by then.
const resultLine = ref(null)
const triage = useCorrectionTriage({ focusTarget: resultLine })

const TABS = Object.freeze([
  { status: 'open', label: 'Open' },
  { status: 'applied', label: 'Applied' },
  { status: 'dismissed', label: 'Dismissed' },
])
const EMPTY_MESSAGES = Object.freeze({
  open: 'No open corrections.',
  applied: 'No applied corrections.',
  dismissed: 'No dismissed corrections.',
})

const current = computed(() => normalizeCorrectionStatus(route.query.status))
const countOf = (status) =>
  catalogue.corrections.value.filter((correction) => correction.status === status).length
const cards = computed(() => correctionsWithStatus(catalogue.corrections.value, current.value))
const tabTarget = (status) => ({
  path: '/staff/corrections',
  query: status === 'open' ? {} : { status },
})
const loading = computed(() => ['idle', 'loading'].includes(catalogue.status.value))
const staleNotice = computed(() =>
  catalogue.status.value === 'ready' && catalogue.error.value
    ? `Showing the corrections loaded earlier. ${catalogue.errorMessage.value}`
    : '',
)

// Try again leaves with its error panel once the reload starts, so focus moves first to the heading
// that stays mounted over the loading state.
const heading = ref(null)
const retry = () => {
  heading.value?.focus()
  return catalogue.reload()
}

const notes = reactive({})
const noteErrors = reactive({})
const when = (iso) => `${formatDate(iso, { dateStyle: 'medium' })}, ${formatTime(iso)}`
const resolvedLine = (correction) =>
  `${correction.status === 'applied' ? 'Applied' : 'Dismissed'} ${when(correction.resolvedAt)}`

const resolve = async (correction, status) => {
  const note = validateResolutionNote(notes[correction.id])
  noteErrors[correction.id] = note.error
  if (!note.isValid) return
  const done = await triage.resolve(correction, {
    status,
    resolutionNote: note.value,
  })
  if (done) delete notes[correction.id]
}
</script>

<template>
  <section class="staff-section" aria-labelledby="staff-corrections-heading">
    <h2 id="staff-corrections-heading" ref="heading" class="section-title" tabindex="-1">
      Corrections
    </h2>

    <nav class="staff-corrections__tabs" aria-label="Correction status">
      <ul>
        <li v-for="tab in TABS" :key="tab.status">
          <RouterLink v-slot="{ href, navigate }" :to="tabTarget(tab.status)" custom>
            <a
              :href="href"
              :aria-current="current === tab.status ? 'page' : undefined"
              @click="navigate"
              >{{ tab.label }} ({{ countOf(tab.status) }})</a
            >
          </RouterLink>
        </li>
      </ul>
    </nav>

    <p ref="resultLine" class="staff-corrections__result" role="status" tabindex="-1">
      {{ triage.message.value }}
    </p>
    <p class="staff-corrections__notice" role="status">{{ staleNotice }}</p>

    <StatePanel
      v-if="loading"
      variant="loading"
      title="Loading corrections"
      message="Reading the corrections queue…"
    />
    <StatePanel
      v-else-if="catalogue.status.value === 'error'"
      variant="error"
      title="Corrections are unavailable"
      :error="catalogue.error.value"
      @retry="retry"
    />
    <template v-else>
      <p v-if="catalogue.truncated.value.corrections" class="staff-corrections__truncated">
        Corrections, incomplete: first 1,000 records
      </p>
      <StatePanel v-if="cards.length === 0" variant="empty" :message="EMPTY_MESSAGES[current]" />
      <ul v-else class="staff-corrections__list">
        <li v-for="correction in cards" :key="correction.id" class="correction-card">
          <article :aria-labelledby="`correction-${correction.id}-title`">
            <h3 :id="`correction-${correction.id}-title`" class="correction-card__title">
              <span dir="auto">{{ correction.serviceName }}</span>
            </h3>
            <p class="correction-card__field">
              {{ CORRECTION_FIELD_LABELS[correction.field] }}
            </p>
            <p class="correction-card__message" dir="auto">
              {{ correction.message }}
            </p>
            <p v-if="correction.reporterEmail" class="correction-card__meta">
              Reported by <span dir="auto">{{ correction.reporterEmail }}</span>
            </p>
            <p class="correction-card__meta">Received {{ when(correction.createdAt) }}</p>
            <template v-if="correction.status !== 'open'">
              <p v-if="correction.resolutionNote" class="correction-card__message" dir="auto">
                Note: {{ correction.resolutionNote }}
              </p>
              <p v-if="correction.resolvedAt" class="correction-card__meta">
                {{ resolvedLine(correction) }}
              </p>
            </template>
            <div v-else class="correction-card__actions">
              <RouterLink
                class="button button--secondary"
                :to="{
                  name: 'staff-record-edit',
                  params: { kind: 'services', recordId: correction.serviceId },
                  query: { correction: correction.id },
                }"
                >Edit listing<span class="visually-hidden">
                  for {{ correction.serviceName }}</span
                ></RouterLink
              >
              <FormField
                :id="`correction-note-${correction.id}`"
                v-slot="{ control }"
                label="Note (optional)"
                :error="noteErrors[correction.id] ?? ''"
              >
                <textarea
                  v-bind="control"
                  v-model="notes[correction.id]"
                  class="form-control"
                  rows="2"
                  dir="auto"
                ></textarea>
              </FormField>
              <div class="correction-card__buttons">
                <AppButton
                  :busy="triage.pendingId.value === correction.id"
                  :disabled="
                    triage.pendingId.value !== null && triage.pendingId.value !== correction.id
                  "
                  @click="resolve(correction, 'applied')"
                  >Mark applied<span class="visually-hidden">
                    for {{ correction.serviceName }}</span
                  ></AppButton
                >
                <AppButton
                  variant="secondary"
                  :busy="triage.pendingId.value === correction.id"
                  :disabled="
                    triage.pendingId.value !== null && triage.pendingId.value !== correction.id
                  "
                  @click="resolve(correction, 'dismissed')"
                  >Dismiss<span class="visually-hidden">
                    for {{ correction.serviceName }}</span
                  ></AppButton
                >
              </div>
            </div>
          </article>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.staff-corrections__tabs ul {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}

.staff-corrections__tabs a[aria-current='page'] {
  font-weight: 700;
  text-decoration: underline;
}

.staff-corrections__list {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.correction-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  padding: 1rem;
}

.correction-card__title {
  margin: 0 0 0.5rem;
  color: var(--color-heading);
  font-size: 1.125rem;
}

.correction-card p {
  margin: 0 0 0.5rem;
}

.correction-card__message {
  white-space: pre-line;
}

.correction-card__meta {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.correction-card__actions,
.correction-card__buttons {
  display: grid;
  gap: 0.75rem;
}

@media (min-width: 576px) {
  .correction-card__buttons {
    display: flex;
    flex-wrap: wrap;
  }
}
</style>
