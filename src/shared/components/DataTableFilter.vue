<script setup>
import { computed } from 'vue'

import { multiFilterValues } from '../domain/tableQuery.js'

/**
 * One column's labelled filter for DataTable, shared by the wide filter row and the narrow
 * `<details>`, so both layouts always carry the same control with a visible label.
 * - text: binds the IME-safe `useSearchDraft` that DataTable owns, so the text being typed
 *   survives a switch between layouts; the placeholder is the column's, else a generic hint.
 * - select: the first option names the column ("Any status", or the column's `anyLabel`) and
 *   means no filter; each change is emitted as the option value ('' for the first option).
 * - multi: a group of checkboxes under a legend; each change emits the list of checked option
 *   values in option order ([] when none is checked).
 */
const props = defineProps({
  column: { type: Object, required: true },
  id: { type: String, required: true },
  value: { type: String, required: true },
  searchDraft: { type: Object, default: null },
})
const emit = defineEmits(['change'])

const label = computed(() => `Filter by ${props.column.label}`)
const anyLabel = computed(
  () => props.column.anyLabel ?? `Any ${props.column.label.toLocaleLowerCase('en-AU')}`,
)
const chosen = computed(() => multiFilterValues(props.value))
const toggle = (optionValue, checked) => {
  const next = new Set(chosen.value)
  if (checked) next.add(optionValue)
  else next.delete(optionValue)
  emit(
    'change',
    props.column.options.map((option) => option.value).filter((value) => next.has(value)),
  )
}
</script>

<template>
  <fieldset v-if="column.filter === 'multi'" :id="id" class="data-table-filter__group">
    <legend class="data-table-filter__label">{{ label }}</legend>
    <label v-for="option in column.options" :key="option.value" class="data-table-filter__option">
      <input
        type="checkbox"
        :value="option.value"
        :checked="chosen.includes(option.value)"
        @change="toggle(option.value, $event.target.checked)"
      />
      {{ option.label }}
    </label>
  </fieldset>
  <template v-else>
    <label class="data-table-filter__label" :for="id">{{ label }}</label>
    <input
      v-if="column.filter === 'text'"
      :id="id"
      class="form-control"
      type="search"
      autocomplete="off"
      dir="auto"
      :placeholder="column.placeholder ?? 'Type to filter…'"
      :value="searchDraft.draft.value"
      @input="searchDraft.onInput"
      @compositionstart="searchDraft.onCompositionStart"
      @compositionend="searchDraft.onCompositionEnd"
    />
    <select
      v-else
      :id="id"
      class="form-control"
      :value="value"
      @change="emit('change', $event.target.value)"
    >
      <option value="">{{ anyLabel }}</option>
      <option v-for="option in column.options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </template>
</template>

<style scoped>
.data-table-filter__group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}

.data-table-filter__group legend {
  width: 100%;
  padding: 0;
}

.data-table-filter__option {
  display: inline-flex;
  min-height: 2.25rem;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}
</style>
