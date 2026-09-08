<script setup>
const props = defineProps({
  counts: {
    type: Object,
    required: true,
  },
  selectedActions: {
    type: Array,
    required: true,
  },
  idPrefix: {
    type: String,
    default: 'filter',
  },
})

const emit = defineEmits({
  'update:selectedActions': (value) => Array.isArray(value),
})

const actions = [
  { value: 'repair', label: 'Repair' },
  { value: 'reuse', label: 'Reuse or donate' },
  { value: 'recycle', label: 'Recycle' },
]

const updateAction = (action, checked) => {
  const next = checked
    ? [...new Set([...props.selectedActions, action])]
    : props.selectedActions.filter((value) => value !== action)

  emit('update:selectedActions', next)
}
</script>

<template>
  <fieldset class="filter-panel" data-testid="filter-panel">
    <legend>Action type</legend>
    <label v-for="action in actions" :key="action.value" class="filter-option">
      <input
        :id="`${idPrefix}-${action.value}`"
        type="checkbox"
        :value="action.value"
        :checked="selectedActions.includes(action.value)"
        @change="updateAction(action.value, $event.target.checked)"
      />
      <span>{{ action.label }} ({{ counts[action.value] ?? 0 }})</span>
    </label>

    <button
      v-if="selectedActions.length"
      class="text-button"
      type="button"
      @click="$emit('update:selectedActions', [])"
    >
      Clear filters
    </button>
  </fieldset>
</template>

<style scoped>
.filter-panel {
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}

legend {
  color: var(--color-heading);
  font-size: 1rem;
  font-weight: 750;
}

.filter-option {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.65rem;
  color: var(--color-text);
  cursor: pointer;
}

.filter-option input {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--color-brand);
}

.text-button {
  margin-top: 0.6rem;
}
</style>
