<script setup>
import { computed } from 'vue'
import { melbourneDayKey } from '@shared/melbourneTime.js'

import { ITEM_CATEGORIES } from '@/features/discovery/domain/itemCategories.js'
import { formatActionType } from '@/features/discovery/domain/servicePresentation.js'

import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'

import { GEO_PRECISION_HELP, recordIdFrom } from '../domain/recordDrafts.js'
import { STALE_SOURCE_DAYS, daysSinceChecked, staleSourceLabel } from '../domain/registerColumns.js'

/**
 * The service fields (spec 8.2 L985): the view owns the <form>, the summary and the buttons. One
 * entry per line in every list; "Mark checked today" sets the Melbourne day of the press; the
 * source badge says, against `now`, how stale it is past 180 days; "Show on map" reveals the
 * coordinates and their provenance with the precision help text. The id appears on a create only
 * and follows the name until the person edits it.
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  isNew: { type: Boolean, default: false },
  now: { type: Date, required: true },
})
const emit = defineEmits(['update:modelValue'])

const ACTIONS = ['repair', 'reuse', 'recycle']
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
// The page's alert summary, mounted before any message, announces a group's error (M6-D22); the
// group's own line is the description its fieldset points at.
const groupError = (name) => (props.errors[name] ? `service-${name}-error` : undefined)
// CP-R5: the press reads the clock, so a page left open past midnight stamps the day it is pressed.
const markCheckedToday = () => update({ sourceCheckedAt: melbourneDayKey(new Date()) })
const categoryLabel = (label) => `${label[0].toLocaleUpperCase('en-AU')}${label.slice(1)}`
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
      <label v-for="action in ACTIONS" :key="action" class="record-form__check">
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

    <FormField
      v-for="list in [
        { name: 'acceptedItems', label: 'Items accepted', required: true },
        { name: 'aliases', label: 'Other names people use', required: true },
        { name: 'searchAreas', label: 'Suburbs and areas served', required: true },
      ]"
      :key="list.name"
      v-bind="field(list.name)"
      :label="list.label"
      hint="One per line."
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

    <fieldset class="record-form__group" :aria-describedby="groupError('itemCategories')">
      <legend>Item categories</legend>
      <div class="record-form__checks">
        <label v-for="category in ITEM_CATEGORIES" :key="category.id" class="record-form__check">
          <input
            type="checkbox"
            :value="category.id"
            :checked="draft.itemCategories.includes(category.id)"
            :aria-invalid="errors.itemCategories ? 'true' : undefined"
            @change="toggle('itemCategories', category.id, $event.target.checked)"
          />
          {{ categoryLabel(category.label) }}
        </label>
      </div>
      <p v-if="errors.itemCategories" id="service-itemCategories-error" class="record-form__error">
        {{ errors.itemCategories }}
      </p>
    </fieldset>

    <FormField v-bind="field('address')" label="Street address" hint="Leave empty when unknown.">
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="draft.address"
          @input="update({ address: $event.target.value })"
        />
      </template>
    </FormField>
    <FormField v-bind="field('suburb')" label="Suburb" required>
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="draft.suburb"
          @input="update({ suburb: $event.target.value })"
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
          @input="update({ postcode: $event.target.value })"
        />
      </template>
    </FormField>

    <FormField
      v-for="list in [
        { name: 'acceptanceConditions', label: 'Acceptance conditions' },
        { name: 'preparation', label: 'Before you go' },
        { name: 'access', label: 'Access' },
        { name: 'openingHours', label: 'Opening hours' },
      ]"
      :key="list.name"
      v-bind="field(list.name)"
      :label="list.label"
      hint="One per line; optional."
    >
      <template #default="{ control }">
        <textarea
          v-bind="control"
          class="form-control"
          rows="3"
          dir="auto"
          :value="draft[list.name]"
          @input="update({ [list.name]: $event.target.value })"
        ></textarea>
      </template>
    </FormField>

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

    <fieldset class="record-form__group">
      <legend>Map</legend>
      <label class="record-form__check">
        <input
          id="service-showOnMap"
          type="checkbox"
          :checked="draft.showOnMap"
          @change="update({ showOnMap: $event.target.checked })"
        />
        Show on map
      </label>
      <template v-if="draft.showOnMap">
        <FormField v-bind="field('latitude')" label="Latitude" required>
          <template #default="{ control }">
            <input
              v-bind="control"
              class="form-control"
              type="text"
              inputmode="decimal"
              :value="draft.latitude"
              @input="update({ latitude: $event.target.value })"
            />
          </template>
        </FormField>
        <FormField v-bind="field('longitude')" label="Longitude" required>
          <template #default="{ control }">
            <input
              v-bind="control"
              class="form-control"
              type="text"
              inputmode="decimal"
              :value="draft.longitude"
              @input="update({ longitude: $event.target.value })"
            />
          </template>
        </FormField>
        <FormField
          v-bind="field('precision')"
          label="Precision"
          :hint="GEO_PRECISION_HELP"
          required
        >
          <template #default="{ control }">
            <select
              v-bind="control"
              class="form-control"
              :value="draft.precision"
              @change="update({ precision: $event.target.value })"
            >
              <option value="venue">Venue</option>
              <option value="area">Area</option>
            </select>
          </template>
        </FormField>
        <FormField v-bind="field('geoSourceUrl')" label="Location source link" required>
          <template #default="{ control }">
            <input
              v-bind="control"
              class="form-control"
              type="url"
              :value="draft.geoSourceUrl"
              @input="update({ geoSourceUrl: $event.target.value })"
            />
          </template>
        </FormField>
        <FormField v-bind="field('geoCheckedAt')" label="Location checked" required>
          <template #default="{ control }">
            <input
              v-bind="control"
              class="form-control"
              type="date"
              :value="draft.geoCheckedAt"
              @input="update({ geoCheckedAt: $event.target.value })"
            />
          </template>
        </FormField>
      </template>
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
