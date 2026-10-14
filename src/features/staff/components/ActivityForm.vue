<script setup>
import { computed } from 'vue'

import { formatActivityType } from '@/features/activities/domain/activityCatalogue.js'
import { ACTIVITY_TYPES } from '@/features/activities/domain/activitySchema.js'
import FormField from '@/shared/components/FormField.vue'

import { ACTIVITY_ENTRY_LISTS, entryListHint, recordIdFrom } from '../domain/recordDrafts.js'

import EntryListField from './EntryListField.vue'

/**
 * The activity fields: the view owns the <form>, the summary and the buttons.
 * Every list is entered a row at a time (EntryListField); the summary, cost, accessibility and
 * cancellation stay paragraphs. The id appears on a create only and follows the title until the
 * person edits it.
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  isNew: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

// The lists entered a row at a time: `noun` words the hint ("One item per row: …"), `entryLabel`
// names each row ("Accepted condition 2", "Remove accepted condition 2"), so the two condition
// lists never share a name; `countNoun` words the count line near the limit. The bounds are the
// validator's.
const LISTS = Object.freeze(
  [
    {
      name: 'suitableItems',
      legend: 'Suitable items',
      noun: 'item',
      entryLabel: 'Item',
      addLabel: 'Add item',
      countNoun: 'items',
    },
    {
      name: 'acceptedConditions',
      legend: 'Accepted conditions',
      noun: 'condition',
      entryLabel: 'Accepted condition',
      addLabel: 'Add accepted condition',
      countNoun: 'accepted conditions',
    },
    {
      name: 'excludedConditions',
      legend: 'Excluded conditions',
      noun: 'condition',
      entryLabel: 'Excluded condition',
      addLabel: 'Add excluded condition',
      countNoun: 'excluded conditions',
    },
    {
      name: 'whatToBring',
      legend: 'What to bring',
      noun: 'thing to bring',
      entryLabel: 'Thing to bring',
      addLabel: 'Add a thing to bring',
      countNoun: 'things to bring',
    },
  ].map((list) => ({
    ...list,
    ...ACTIVITY_ENTRY_LISTS[list.name],
    hint: entryListHint(list.noun, ACTIVITY_ENTRY_LISTS[list.name]),
  })),
)
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
          <option v-for="type in ACTIVITY_TYPES" :key="type" :value="type">
            {{ formatActivityType(type) }}
          </option>
        </select>
      </template>
    </FormField>

    <EntryListField
      v-for="list in LISTS"
      :id="`activity-${list.name}`"
      :key="list.name"
      :legend="list.legend"
      :hint="list.hint"
      :entries="draft[list.name]"
      :entry-label="list.entryLabel"
      :add-label="list.addLabel"
      :count-noun="list.countNoun"
      :maximum="list.maximum"
      :entry-maximum="list.entryMaximum"
      :error="errors[list.name] ?? ''"
      @update:entries="update({ [list.name]: $event })"
    />

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
