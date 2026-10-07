<script setup>
import { computed } from 'vue'

import FormField from '@/shared/components/FormField.vue'

import { SESSION_LOCK_MESSAGE, recordIdFrom } from '../domain/recordDrafts.js'

/**
 * The session fields: the activity is chosen on a create and shown read-only from
 * the activity record on an edit; sessions carry venue text only, so there are no map controls.
 * A session with bookings keeps its time, venue and activity: those fields are disabled
 * under the sentence that says why. The counters are shown, never edited. The
 * registration type is fixed once the session exists. The id appears on a create only and
 * follows the activity, date and start time until the person edits it.
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  isNew: { type: Boolean, default: false },
  activities: { type: Array, required: true },
  locked: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const draft = computed(() => props.modelValue)
const field = (name) => ({ id: `session-${name}`, error: props.errors[name] ?? '' })
const suggestedId = (value) =>
  recordIdFrom(`${value.activityId} ${value.date} ${value.startTime.replace(':', '')}`)
const update = (changes) => {
  const next = { ...props.modelValue, ...changes }
  const current = props.modelValue.id
  if (props.isNew && (current === '' || current === suggestedId(props.modelValue))) {
    next.id = suggestedId(next)
  }
  emit('update:modelValue', next)
}
const activityTitle = computed(
  () => props.activities.find((activity) => activity.id === draft.value.activityId)?.title ?? '',
)
const isTurnAgain = computed(() => draft.value.registrationType === 'turnagain')
</script>

<template>
  <div class="record-form">
    <p v-if="locked" class="record-form__lock">{{ SESSION_LOCK_MESSAGE }}</p>

    <FormField v-if="isNew" v-bind="field('activityId')" label="Activity" required>
      <template #default="{ control }">
        <select
          v-bind="control"
          class="form-control"
          :value="draft.activityId"
          :disabled="locked"
          @change="update({ activityId: $event.target.value })"
        >
          <option value="">Choose an activity</option>
          <option v-for="activity in activities" :key="activity.id" :value="activity.id">
            {{ activity.title }}
          </option>
        </select>
      </template>
    </FormField>
    <div v-else class="record-form__readonly">
      <p class="record-form__readonly-label">Activity</p>
      <p dir="auto">{{ activityTitle || 'Activity' }}</p>
    </div>

    <FormField
      v-if="isNew"
      v-bind="field('id')"
      label="Id"
      hint="Part of the session's address: letters, digits and hyphens. It cannot change later."
      required
    >
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          :value="draft.id"
          @input="update({ id: $event.target.value })"
        />
      </template>
    </FormField>

    <FormField v-bind="field('date')" label="Date" hint="Melbourne time." required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="date"
          :value="draft.date"
          :disabled="locked"
          @input="update({ date: $event.target.value })"
        />
      </template>
    </FormField>
    <FormField v-bind="field('startTime')" label="Starts" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="time"
          :value="draft.startTime"
          :disabled="locked"
          @input="update({ startTime: $event.target.value })"
        />
      </template>
    </FormField>
    <FormField v-bind="field('endTime')" label="Ends" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="time"
          :value="draft.endTime"
          :disabled="locked"
          @input="update({ endTime: $event.target.value })"
        />
      </template>
    </FormField>

    <FormField
      v-for="entry in [
        { name: 'venueName', label: 'Venue' },
        { name: 'address', label: 'Street address' },
        { name: 'suburb', label: 'Suburb' },
      ]"
      :key="entry.name"
      v-bind="field(entry.name)"
      :label="entry.label"
      required
    >
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="draft[entry.name]"
          :disabled="locked"
          @input="update({ [entry.name]: $event.target.value })"
        />
      </template>
    </FormField>
    <FormField v-bind="field('postcode')" label="Postcode" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          inputmode="numeric"
          maxlength="4"
          :value="draft.postcode"
          :disabled="locked"
          @input="update({ postcode: $event.target.value })"
        />
      </template>
    </FormField>

    <FormField
      v-bind="field('registrationType')"
      label="Registration"
      :hint="isNew ? '' : 'Fixed once the session exists; create a new session to change it.'"
      required
    >
      <template #default="{ control }">
        <select
          v-bind="control"
          class="form-control"
          :value="draft.registrationType"
          :disabled="!isNew"
          @change="update({ registrationType: $event.target.value })"
        >
          <option value="turnagain">Booked on TurnAgain</option>
          <option value="provider">Booked with the provider</option>
          <option value="drop-in">Drop-in, no booking</option>
        </select>
      </template>
    </FormField>
    <FormField v-if="isTurnAgain" v-bind="field('capacity')" label="Capacity" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="number"
          min="1"
          max="10000"
          step="1"
          :value="draft.capacity"
          @input="update({ capacity: $event.target.value })"
        />
      </template>
    </FormField>
    <FormField
      v-if="draft.registrationType === 'provider'"
      v-bind="field('registrationUrl')"
      label="Booking link"
      required
    >
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="url"
          :value="draft.registrationUrl"
          @input="update({ registrationUrl: $event.target.value })"
        />
      </template>
    </FormField>

    <dl v-if="!isNew && isTurnAgain" class="record-form__counters">
      <div>
        <dt>Booked</dt>
        <dd>{{ draft.bookedCount ?? 0 }}</dd>
      </div>
      <div>
        <dt>Waitlist</dt>
        <dd>{{ draft.waitlistCount ?? 0 }}</dd>
      </div>
    </dl>

    <FormField v-bind="field('sourceCheckedAt')" label="Source checked" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="date"
          :value="draft.sourceCheckedAt"
          @input="update({ sourceCheckedAt: $event.target.value })"
        />
      </template>
    </FormField>
    <FormField
      v-bind="field('participantNotice')"
      label="Notice for participants"
      hint="Optional; shown on the session."
    >
      <template #default="{ control }">
        <textarea
          v-bind="control"
          class="form-control"
          rows="3"
          dir="auto"
          :value="draft.participantNotice"
          @input="update({ participantNotice: $event.target.value })"
        ></textarea>
      </template>
    </FormField>
  </div>
</template>

<style scoped>
.record-form {
  display: grid;
  gap: 1.25rem;
}

.record-form__lock {
  margin: 0;
  border-left: 4px solid var(--color-warning);
  padding: 0.75rem 1rem;
  background: var(--color-warning-soft);
  color: var(--color-heading);
}

.record-form__readonly p {
  margin: 0;
}

.record-form__readonly-label {
  color: var(--color-heading);
  font-weight: 600;
}

.record-form__counters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 2rem;
  margin: 0;
}

.record-form__counters dt {
  color: var(--color-text-muted);
}

.record-form__counters dd {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}
</style>
