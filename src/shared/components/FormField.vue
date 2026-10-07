<script setup>
import { computed } from 'vue'

// Label, hint and error around one control. The control itself is the default slot
// so any input, select or textarea fits; it binds the slot's `control` object (id, required,
// aria-invalid, aria-describedby) and aria-describedby names only the hint and error that are
// rendered with text, never an empty element.
const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
})

const hintId = computed(() => `${props.id}-hint`)
const errorId = computed(() => `${props.id}-error`)

const describedBy = computed(() => {
  const ids = []
  if (props.hint) ids.push(hintId.value)
  if (props.error) ids.push(errorId.value)
  return ids.length > 0 ? ids.join(' ') : undefined
})

const control = computed(() => ({
  id: props.id,
  required: props.required,
  'aria-required': props.required ? 'true' : undefined,
  'aria-invalid': props.error ? 'true' : undefined,
  'aria-describedby': describedBy.value,
}))
</script>

<template>
  <div class="form-field">
    <label class="form-field__label" :for="id">{{ label }}</label>
    <p v-if="hint" :id="hintId" class="form-field__hint">{{ hint }}</p>
    <slot :control="control" />
    <p v-if="error" :id="errorId" class="form-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.form-field {
  display: grid;
  gap: 0.35rem;
}

.form-field__label {
  color: var(--color-heading);
  font-weight: 600;
}

.form-field__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.form-field__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
  font-weight: 600;
}
</style>
