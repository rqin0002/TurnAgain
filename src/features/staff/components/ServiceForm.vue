<script setup>
import { computed, nextTick, ref } from 'vue'
import { melbourneDayKey } from '@shared/melbourneTime.js'

import { ITEM_CATEGORIES } from '@/features/discovery/domain/itemCategories.js'
import { formatActionType } from '@/features/discovery/domain/servicePresentation.js'
import { SERVICE_ACTIONS } from '@/features/discovery/domain/serviceSchema.js'

import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'

import {
  MAX_ITEM_CATEGORIES,
  SERVICE_ENTRY_LISTS,
  entryListHint,
  recordIdFrom,
} from '../domain/recordDrafts.js'
import { STALE_SOURCE_DAYS, daysSinceChecked, staleSourceLabel } from '../domain/registerColumns.js'

import AccessChecklist from './AccessChecklist.vue'
import EntryListField from './EntryListField.vue'
import NewCategoryPanel from './NewCategoryPanel.vue'
import OpeningHoursEditor from './OpeningHoursEditor.vue'
import ServiceLocationFields from './ServiceLocationFields.vue'

/**
 * The service fields: the view owns the <form>, the summary and the buttons. Every list is
 * entered a row at a time (EntryListField): items accepted, other names and areas served above
 * Item categories; conditions, things not accepted and before-you-go steps after the address.
 * Then Access, a checklist of common facts with notes (AccessChecklist), and Opening hours, a
 * weekly editor with notes (OpeningHoursEditor), whose week becomes the line "Open now" reads.
 * Item categories lists `categories` (the twelve plus those an admin added) and any id the draft
 * holds that the list does not, marked "not in the list" and never dropped; an admin
 * (`canAddCategories`) can create a shared category in place (`createCategory`), which is ticked
 * when the service has room for it.
 * "Mark checked today" sets the Melbourne day of the press; the source badge says, against `now`,
 * how stale it is past 180 days; the address and the map position are one group
 * (ServiceLocationFields), whose position comes from looking the address up, never from typed
 * coordinates. The id appears on a create only and follows the name until the person edits it.
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  isNew: { type: Boolean, default: false },
  now: { type: Date, required: true },
  // `{ id, label }` for every category the page knows; the twelve until the page passes more.
  categories: { type: Array, default: () => ITEM_CATEGORIES },
  categoryStatus: { type: String, default: 'ready' },
  canAddCategories: { type: Boolean, default: false },
  createCategory: { type: Function, default: null },
})
const emit = defineEmits(['update:modelValue'])

const draft = computed(() => props.modelValue)
const update = (changes) => emit('update:modelValue', { ...props.modelValue, ...changes })
const field = (name) => ({
  id: `service-${name}`,
  error: props.errors[name] ?? '',
})
const toggle = (name, value, checked) =>
  update({
    [name]: checked
      ? [...props.modelValue[name], value]
      : props.modelValue[name].filter((entry) => entry !== value),
  })
const setName = (event) => {
  const name = event.target.value
  const followsName =
    props.isNew &&
    (props.modelValue.id === '' || props.modelValue.id === recordIdFrom(props.modelValue.name))
  update(followsName ? { name, id: recordIdFrom(name) } : { name })
}
const staleDays = computed(() => {
  const days = daysSinceChecked(draft.value.sourceCheckedAt, props.now)
  return days !== null && days > STALE_SOURCE_DAYS ? days : null
})
// The page's alert summary, mounted before any message, announces a group's error; the
// group's own line is the description its fieldset points at.
const groupError = (name) => (props.errors[name] ? `service-${name}-error` : undefined)
// The press reads the clock, so a page left open past midnight stamps the day it is pressed.
const markCheckedToday = () => update({ sourceCheckedAt: melbourneDayKey(new Date()) })
const categoryLabel = (label) => `${label[0].toLocaleUpperCase('en-AU')}${label.slice(1)}`
// The lists entered a row at a time: `noun` words the hint ("One item per row: …"), `entryLabel`
// names each row ("Item 2", "Remove item 2"), `countNoun` the count line near the limit; the
// bounds are the validator's.
const entryLists = (lists) =>
  Object.freeze(
    lists.map((list) => ({
      ...list,
      ...SERVICE_ENTRY_LISTS[list.name],
      hint: list.hint ?? entryListHint(list.noun, SERVICE_ENTRY_LISTS[list.name]),
    })),
  )
const UPPER_LISTS = entryLists([
  {
    name: 'acceptedItems',
    legend: 'Items accepted',
    noun: 'item',
    entryLabel: 'Item',
    addLabel: 'Add item',
    countNoun: 'items',
  },
  {
    name: 'aliases',
    legend: 'Other names people use',
    noun: 'name',
    entryLabel: 'Name',
    addLabel: 'Add name',
    countNoun: 'names',
  },
  {
    name: 'searchAreas',
    legend: 'Suburbs and areas served',
    noun: 'suburb or area',
    entryLabel: 'Area',
    addLabel: 'Add area',
    countNoun: 'areas',
  },
])
// The conditions a drop-off must meet and the things the place does not take are two lists, as
// on an activity (accepted and excluded conditions).
const LOWER_LISTS = entryLists([
  {
    name: 'acceptanceConditions',
    legend: 'Conditions',
    hint: `What a drop-off must meet to be accepted. ${entryListHint('condition', SERVICE_ENTRY_LISTS.acceptanceConditions)}`,
    entryLabel: 'Condition',
    addLabel: 'Add condition',
    countNoun: 'conditions',
  },
  {
    name: 'excludedConditions',
    legend: 'Not accepted',
    hint: `Things this place does not take. ${entryListHint('thing', SERVICE_ENTRY_LISTS.excludedConditions)}`,
    entryLabel: 'Thing not accepted',
    addLabel: 'Add a thing not accepted',
    countNoun: 'things not accepted',
  },
  {
    name: 'preparation',
    legend: 'Before you go',
    noun: 'step',
    entryLabel: 'Step',
    addLabel: 'Add step',
    countNoun: 'steps',
  },
])
// One list's EntryListField props: the first row's id is `service-<field>`, so the page can focus
// the field by its id.
const listProps = (list) => ({
  id: `service-${list.name}`,
  legend: list.legend,
  hint: list.hint,
  entries: draft.value[list.name],
  entryLabel: list.entryLabel,
  addLabel: list.addLabel,
  countNoun: list.countNoun,
  maximum: list.maximum,
  entryMaximum: list.entryMaximum,
  error: props.errors[list.name] ?? '',
})

// The categories to tick: the page's list, then any id the draft holds that the list does not
// (kept and shown, so the person can see it and untick it).
const categoryOptions = computed(() => {
  const known = new Set(props.categories.map((category) => category.id))
  const unlisted = draft.value.itemCategories
    .filter((id) => !known.has(id))
    .map((id) => ({ id, label: id, unlisted: true }))
  return [...props.categories, ...unlisted]
})
const optionLabel = (category) =>
  category.unlisted ? `${category.id} (not in the list)` : categoryLabel(category.label)

const categoriesGroup = ref(null)
const addCategoryButton = ref(null)
const addingCategory = ref(false)
const categoryMessage = ref('')
const openCategoryPanel = () => {
  categoryMessage.value = ''
  addingCategory.value = true
}
const closeCategoryPanel = async () => {
  addingCategory.value = false
  await nextTick()
  addCategoryButton.value?.$el?.focus()
}
// After a create (or a name that already exists) the area closes; the category is ticked when the
// service has room for it, the status line says what happened, and the focus goes to the
// category's checkbox, or back to Add new category if the list does not show it yet.
const onCategoryCreated = async ({ outcome, id, label }) => {
  addingCategory.value = false
  const name = categoryLabel(label)
  const ticked = props.modelValue.itemCategories
  if (ticked.includes(id)) {
    categoryMessage.value = `${name} is already a category and is ticked.`
  } else if (ticked.length >= MAX_ITEM_CATEGORIES) {
    const lead =
      outcome === 'created'
        ? `Added ${name}. Other services can use it now.`
        : `${name} is already a category.`
    categoryMessage.value = `${lead} This service already has ${MAX_ITEM_CATEGORIES} categories: untick one, then tick ${name}.`
  } else {
    update({ itemCategories: [...ticked, id] })
    categoryMessage.value =
      outcome === 'created'
        ? `Added ${name} and ticked it. Other services can use it now; this service keeps it when you save.`
        : `${name} is already a category, so it is ticked now.`
  }
  await nextTick()
  const checkbox = categoriesGroup.value?.querySelector(`input[value="${id}"]`)
  ;(checkbox ?? addCategoryButton.value?.$el)?.focus()
}

// The record the form holds: a lookup still running for another record must not land here.
const recordKey = computed(() => (props.isNew ? '' : props.modelValue.id))
</script>

<template>
  <div class="record-form">
    <FormField v-bind="field('name')" label="Name" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="draft.name"
          @input="setName"
        />
      </template>
    </FormField>

    <FormField
      v-if="isNew"
      v-bind="field('id')"
      label="Id"
      hint="Part of the listing's address: letters, digits and hyphens. It cannot change later."
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

    <fieldset class="record-form__group" :aria-describedby="groupError('actionTypes')">
      <legend>Actions</legend>
      <label v-for="action in SERVICE_ACTIONS" :key="action" class="record-form__check">
        <input
          type="checkbox"
          :value="action"
          :checked="draft.actionTypes.includes(action)"
          :aria-invalid="errors.actionTypes ? 'true' : undefined"
          @change="toggle('actionTypes', action, $event.target.checked)"
        />
        {{ formatActionType(action) }}
      </label>
      <p v-if="errors.actionTypes" id="service-actionTypes-error" class="record-form__error">
        {{ errors.actionTypes }}
      </p>
    </fieldset>

    <FormField v-bind="field('summary')" label="Summary" required>
      <template #default="{ control }">
        <textarea
          v-bind="control"
          class="form-control"
          rows="3"
          dir="auto"
          :value="draft.summary"
          @input="update({ summary: $event.target.value })"
        ></textarea>
      </template>
    </FormField>

    <EntryListField
      v-for="list in UPPER_LISTS"
      :key="list.name"
      v-bind="listProps(list)"
      @update:entries="update({ [list.name]: $event })"
    />

    <fieldset
      ref="categoriesGroup"
      class="record-form__group"
      :aria-describedby="groupError('itemCategories')"
    >
      <legend>Item categories</legend>
      <p v-if="categoryStatus === 'error'" class="record-form__note">
        The shared category list could not be loaded, so categories an admin added may be missing;
        the built-in ones are shown.
      </p>
      <div class="record-form__checks">
        <label v-for="category in categoryOptions" :key="category.id" class="record-form__check">
          <input
            type="checkbox"
            :value="category.id"
            :checked="draft.itemCategories.includes(category.id)"
            :aria-invalid="errors.itemCategories ? 'true' : undefined"
            @change="toggle('itemCategories', category.id, $event.target.checked)"
          />
          <span dir="auto">{{ optionLabel(category) }}</span>
        </label>
      </div>
      <NewCategoryPanel
        v-if="canAddCategories && createCategory && addingCategory"
        :create-category="createCategory"
        @created="onCategoryCreated"
        @cancel="closeCategoryPanel"
      />
      <AppButton
        v-else-if="canAddCategories && createCategory"
        ref="addCategoryButton"
        variant="secondary"
        class="record-form__add"
        @click="openCategoryPanel"
      >
        Add new category
      </AppButton>
      <p class="record-form__status" role="status">{{ categoryMessage }}</p>
      <p v-if="errors.itemCategories" id="service-itemCategories-error" class="record-form__error">
        {{ errors.itemCategories }}
      </p>
    </fieldset>

    <ServiceLocationFields
      :model-value="draft.location"
      :errors="errors"
      :service-name="draft.name"
      :record-key="recordKey"
      @update:model-value="update({ location: $event })"
    />

    <EntryListField
      v-for="list in LOWER_LISTS"
      :key="list.name"
      v-bind="listProps(list)"
      @update:entries="update({ [list.name]: $event })"
    />

    <AccessChecklist
      id="service-access"
      :model-value="draft.access"
      :error="errors.access ?? ''"
      @update:model-value="update({ access: $event })"
    />

    <OpeningHoursEditor
      id="service-openingHours"
      :model-value="draft.openingHours"
      :error="errors.openingHours ?? ''"
      :notes-error="errors.openingHoursNotes ?? ''"
      @update:model-value="update({ openingHours: $event })"
    />

    <FormField v-bind="field('cost')" label="Cost" hint="Optional.">
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="draft.cost"
          @input="update({ cost: $event.target.value })"
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

    <fieldset class="record-form__group">
      <legend>Source</legend>
      <FormField v-bind="field('sourceOrganisation')" label="Source organisation" required>
        <template #default="{ control }">
          <input
            v-bind="control"
            class="form-control"
            type="text"
            dir="auto"
            :value="draft.sourceOrganisation"
            @input="update({ sourceOrganisation: $event.target.value })"
          />
        </template>
      </FormField>
      <FormField v-bind="field('sourceUrl')" label="Source link" required>
        <template #default="{ control }">
          <input
            v-bind="control"
            class="form-control"
            type="url"
            :value="draft.sourceUrl"
            @input="update({ sourceUrl: $event.target.value })"
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
      <p v-if="staleDays !== null" class="staff-badge">{{ staleSourceLabel(staleDays) }}</p>
      <AppButton variant="secondary" @click="markCheckedToday"> Mark checked today </AppButton>
    </fieldset>
  </div>
</template>

<style scoped>
.record-form {
  display: grid;
  gap: 1.25rem;
}

.record-form__group {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
}

.record-form__group legend {
  padding: 0 0.25rem;
  color: var(--color-heading);
  font-weight: 600;
}

.record-form__checks {
  display: grid;
  gap: 0.5rem;
}

.record-form__check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.record-form__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
  font-weight: 600;
}

.record-form__note,
.record-form__status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.record-form__add {
  justify-self: start;
}

.staff-badge {
  justify-self: start;
  margin: 0;
  border: 1px solid var(--color-warning);
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  background: var(--color-warning-soft);
  color: var(--color-heading);
  font-size: 0.8125rem;
  font-weight: 600;
}

@media (min-width: 768px) {
  .record-form__checks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
