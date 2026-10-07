<script setup>
/**
 * One column's labelled filter for DataTable, shared by the wide filter row (label visually
 * hidden) and the narrow `<details>` (label shown), so both layouts always carry the same control.
 * A text column binds the IME-safe `useSearchDraft` that DataTable owns, so the text being typed
 * survives a switch between layouts; a select column starts with `All` and emits each change.
 */
defineProps({
  column: { type: Object, required: true },
  id: { type: String, required: true },
  value: { type: String, required: true },
  searchDraft: { type: Object, default: null },
  hideLabel: { type: Boolean, default: false },
})
const emit = defineEmits(['change'])
</script>

<template>
  <label :class="{ 'visually-hidden': hideLabel }" :for="id">Filter by {{ column.label }}</label>
  <input
    v-if="column.filter === 'text'"
    :id="id"
    class="form-control"
    type="search"
    autocomplete="off"
    dir="auto"
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
    <option value="">All</option>
    <option v-for="option in column.options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
