<script setup>
import { formatSessionWhen } from '@shared/melbourneTime.js'
import { nextTick, reactive, ref } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'

import { BOOKING_MESSAGES } from '../domain/bookingMessages.js'
import { BOOKING_LIMITS, validateBookingInput } from '../domain/bookingValidation.js'

// The review form. It validates, then emits the cleaned values; the
// view owns the transaction. `submitting` comes back from the view, and AppButton swallows a
// click while it is busy, so a double click submits once. The page's retry submits the current
// values through the exposed `submit()`.
const props = defineProps({
  session: { type: Object, required: true },
  activity: { type: Object, required: true },
  email: { type: String, required: true },
  initialName: { type: String, default: '' },
  intent: {
    type: String,
    default: 'book',
    validator: (value) => ['book', 'waitlist'].includes(value),
  },
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits(['submit'])

const form = ref(null)
const values = reactive({
  contactName: props.initialName,
  itemDescription: '',
  acknowledged: false,
})
const errors = reactive({ contactName: '', itemDescription: '', acknowledged: '' })

const FIELD_SELECTORS = Object.freeze({
  contactName: '#booking-contact-name',
  itemDescription: '#booking-item',
  acknowledged: '#booking-acknowledged',
})

const onSubmit = async () => {
  if (props.submitting) return
  const result = validateBookingInput(values)
  Object.assign(errors, result.errors)
  if (!result.isValid) {
    await nextTick()
    const first = Object.keys(FIELD_SELECTORS).find((field) => result.errors[field] !== '')
    form.value?.querySelector(FIELD_SELECTORS[first])?.focus()
    return
  }
  emit('submit', result.values)
}

defineExpose({ submit: onSubmit })
</script>

<template>
  <form ref="form" class="booking-form" novalidate @submit.prevent="onSubmit">
    <section class="booking-form__summary" aria-labelledby="booking-summary-heading">
      <h2 id="booking-summary-heading">{{ activity.title }}</h2>
      <p>{{ formatSessionWhen(session.startsAt, session.endsAt) }}</p>
      <p>
        {{ session.venueName }} · {{ session.address }}, {{ session.suburb }} {{ session.postcode }}
      </p>
      <p>{{ activity.costLabel }}</p>
    </section>

    <FormField
      id="booking-contact-name"
      label="Name for the register"
      :error="errors.contactName"
      required
    >
      <template #default="{ control }">
        <input
          v-bind="control"
          v-model="values.contactName"
          class="form-control"
          name="contactName"
          type="text"
          autocomplete="name"
          dir="auto"
        />
      </template>
    </FormField>

    <FormField id="booking-email" label="Email" hint="We'll send your confirmation here">
      <template #default="{ control }">
        <input v-bind="control" class="form-control" type="email" :value="email" readonly />
      </template>
    </FormField>

    <FormField
      id="booking-item"
      label="What are you bringing?"
      hint="Optional. Up to 200 characters."
      :error="errors.itemDescription"
    >
      <template #default="{ control }">
        <textarea
          v-bind="control"
          v-model="values.itemDescription"
          class="form-control"
          name="itemDescription"
          rows="3"
          dir="auto"
        ></textarea>
      </template>
    </FormField>
    <p class="booking-form__counter">
      {{ values.itemDescription.length }}/{{ BOOKING_LIMITS.itemDescriptionMax }}
    </p>

    <section class="booking-form__terms" aria-labelledby="booking-terms-heading">
      <h2 id="booking-terms-heading">Cancellation</h2>
      <p>{{ activity.cancellationLabel }}</p>
      <p>{{ BOOKING_MESSAGES.cancelUntilStart }}</p>
    </section>

    <!-- FormField stacks its label above the control; a checkbox reads control first, so this one
    is built by hand with the same wiring (label for, aria-invalid, aria-describedby). The
    alert is mounted empty and only its text changes. -->
    <div class="booking-form__acknowledge">
      <div class="booking-form__check">
        <input
          id="booking-acknowledged"
          v-model="values.acknowledged"
          type="checkbox"
          name="acknowledged"
          required
          aria-required="true"
          :aria-invalid="errors.acknowledged ? 'true' : undefined"
          :aria-describedby="errors.acknowledged ? 'booking-acknowledged-error' : undefined"
        />
        <label for="booking-acknowledged">
          I have read the suitability, cost and cancellation information
        </label>
      </div>
      <p id="booking-acknowledged-error" class="booking-form__error" role="alert">
        {{ errors.acknowledged }}
      </p>
    </div>

    <AppButton type="submit" variant="primary" :busy="submitting">
      {{ intent === 'waitlist' ? 'Join waitlist' : 'Confirm booking' }}
    </AppButton>
  </form>
</template>

<style scoped>
.booking-form {
  display: grid;
  gap: 1.25rem;
}

.booking-form h2 {
  margin: 0 0 0.5rem;
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 600;
}

.booking-form p {
  margin: 0.25rem 0 0;
}

.booking-form__summary,
.booking-form__terms {
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: 1.25rem;
}

.booking-form__counter {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  text-align: end;
}

.booking-form__acknowledge {
  display: grid;
  gap: 0.25rem;
}

.booking-form__check {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.booking-form__check input {
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.15rem;
}

.booking-form .booking-form__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
  font-weight: 600;
}
</style>
