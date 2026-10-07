<script setup>
import { computed } from 'vue'

import { formatActivityType } from '@/features/activities/domain/activityCatalogue.js'
import FormField from '@/shared/components/FormField.vue'

import { recordIdFrom } from '../domain/recordDrafts.js'

/**
 * The activity fields: the view owns the <form>, the summary and the buttons.
 * Lists take one entry per line. The id appears on a create only and follows the title until the
 * person edits it.
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  isNew: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const TYPES = ['repair', 'reuse', 'workshop']
const LISTS = [
  { name: 'suitableItems', label: 'Suitable items', required: true },
  { name: 'acceptedConditions', label: 'Accepted conditions', required: true },
  { name: 'excludedConditions', label: 'Excluded conditions', required: false },
  { name: 'whatToBring', label: 'What to bring', required: true },
]
const LONG_TEXTS = [
  { name: 'costLabel', label: 'Cost' },
  { name: 'accessibilityLabel', label: 'Accessibility' },
  { name: 'cancellationLabel', label: 'Cancellation' },
]
const draft = computed(() => props.modelValue)
const update = (changes) => emit('update:modelValue', { ...props.modelValue, ...changes })
const field = (name) => ({ id: `activity-${name}`, error: props.errors[name] ?? '' })
const setTitle = (event) => {
  const title = event.target.value
  const followsTitle =
    props.isNew &&
    (props.modelValue.id === '' || props.modelValue.id === recordIdFrom(props.modelValue.title))
  update(followsTitle ? { title, id: recordIdFrom(title) } : { title })
}
</script>

<template>
  <div class="record-form">
    <FormField v-bind="field('title')" label="Title" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="draft.title"
          @input="setTitle"
        />
      </template>
    </FormField>

    <FormField
      v-if="isNew"
      v-bind="field('id')"
      label="Id"
      hint="Part of the activity's address: letters, digits and hyphens. It cannot change later."
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

    <FormField v-bind="field('summary')" label="Summary" required>
      <template #default="{ control }">
        <textarea
          v-bind="control"
          class="form-control"
          rows="4"
          dir="auto"
          :value="draft.summary"
          @input="update({ summary: $event.target.value })"
        ></textarea>
      </template>
    </FormField>

    <FormField v-bind="field('activityType')" label="Type" required>
      <template #default="{ control }">
        <select
          v-bind="control"
          class="form-control"
          :value="draft.activityType"
          @change="update({ activityType: $event.target.value })"
        >
          <option v-for="type in TYPES" :key="type" :value="type">
            {{ formatActivityType(type) }}
          </option>
        </select>
      </template>
    </FormField>

    <FormField
      v-for="list in LISTS"
      :key="list.name"
      v-bind="field(list.name)"
      :label="list.label"
      :hint="list.required ? 'One per line.' : 'One per line; optional.'"
      :required="list.required"
    >
      <template #default="{ control }">
        <textarea
          v-bind="control"
          class="form-control"
          rows="4"
          dir="auto"
          :value="draft[list.name]"
          @input="update({ [list.name]: $event.target.value })"
        ></textarea>
      </template>
    </FormField>

    <FormField
      v-for="entry in LONG_TEXTS"
      :key="entry.name"
      v-bind="field(entry.name)"
      :label="entry.label"
      required
    >
      <template #default="{ control }">
        <textarea
          v-bind="control"
          class="form-control"
          rows="2"
          dir="auto"
          :value="draft[entry.name]"
          @input="update({ [entry.name]: $event.target.value })"
        ></textarea>
      </template>
    </FormField>

    <FormField v-bind="field('providerName')" label="Provider" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="draft.providerName"
          @input="update({ providerName: $event.target.value })"
        />
      </template>
    </FormField>
    <FormField v-bind="field('providerUrl')" label="Provider link" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="url"
          :value="draft.providerUrl"
          @input="update({ providerUrl: $event.target.value })"
        />
      </template>
    </FormField>
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
    <FormField v-bind="field('status')" label="Status" required>
      <template #default="{ control }">
        <select
          v-bind="control"
          class="form-control"
          :value="draft.status"
          @change="update({ status: $event.target.value })"
        >
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </template>
    </FormField>
  </div>
</template>

<style scoped>
.record-form {
  display: grid;
  gap: 1.25rem;
}
</style>
