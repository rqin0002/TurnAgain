<script setup>
import { computed, nextTick, ref } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'

import { useCorrectionReport } from '../composables/useCorrectionReport.js'
import { CORRECTION_FIELDS, CORRECTION_FIELD_LABELS } from '../domain/correctionValidation.js'

/**
 * "Something wrong with this listing?" on Service Detail: Farah tells staff what
 * changed; staff check the source before the listing changes. The honeypot `website` sits in a
 * visually hidden, aria-hidden wrapper that keyboard users never reach. Both live lines are
 * mounted from the start and hold text only.
 */
const props = defineProps({
  service: { type: Object, required: true },
})

const THANKS = 'Thanks. TurnAgain staff will check this listing.'
const REFUSED = 'This listing cannot take corrections right now.'

const form = ref(null)
const { values, errors, state, error, submit } = useCorrectionReport(() => props.service)

const statusText = computed(() => (state.value === 'sent' ? THANKS : ''))
const failureText = computed(() => {
  if (state.value !== 'failed') return ''
  return error.value?.code === 'permission' ? REFUSED : (error.value?.message ?? '')
})

const send = async () => {
  const sent = await submit()
  if (sent || state.value === 'failed') return
  await nextTick()
  form.value?.querySelector('[aria-invalid="true"]')?.focus()
}
</script>

<template>
  <details class="correction-form">
    <summary class="correction-form__summary">Something wrong with this listing?</summary>
    <form ref="form" class="correction-form__form" novalidate @submit.prevent="send">
      <FormField
        id="correction-field"
        v-slot="{ control }"
        label="What is wrong?"
        :error="errors.field"
        required
      >
        <select v-bind="control" v-model="values.field" class="form-control" name="field">
          <option value="">Choose one</option>
          <option v-for="field in CORRECTION_FIELDS" :key="field" :value="field">
            {{ CORRECTION_FIELD_LABELS[field] }}
          </option>
        </select>
      </FormField>
      <FormField
        id="correction-message"
        v-slot="{ control }"
        label="Tell us what changed"
        :error="errors.message"
        required
      >
        <textarea
          v-bind="control"
          v-model="values.message"
          class="form-control"
          name="message"
          rows="4"
          dir="auto"
        ></textarea>
      </FormField>
      <FormField
        id="correction-email"
        v-slot="{ control }"
        label="Your email (optional)"
        :error="errors.reporterEmail"
      >
        <input
          v-bind="control"
          v-model="values.reporterEmail"
          class="form-control"
          name="reporterEmail"
          type="email"
          autocomplete="email"
          inputmode="email"
        />
      </FormField>
      <div class="visually-hidden" aria-hidden="true">
        <label for="correction-website">Website</label>
        <input
          id="correction-website"
          v-model="values.website"
          name="website"
          type="text"
          tabindex="-1"
          autocomplete="off"
        />
      </div>
      <div class="correction-form__actions">
        <AppButton type="submit" :busy="state === 'submitting'">Send correction</AppButton>
      </div>
      <p class="correction-form__status" role="status">{{ statusText }}</p>
      <p class="correction-form__failure" role="alert">{{ failureText }}</p>
    </form>
  </details>
</template>

<style scoped>
.correction-form {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  padding: 0.85rem 1rem;
  margin: 0 0 1.5rem;
}

.correction-form__summary {
  color: var(--color-heading);
  font-weight: 600;
  cursor: pointer;
}

.correction-form__form {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}

.correction-form__status,
.correction-form__failure {
  margin: 0;
}

.correction-form__failure {
  color: var(--color-danger);
}
</style>
