<script setup>
defineProps({
  autocomplete: {
    type: String,
    required: true,
  },
  disabled: Boolean,
  error: {
    type: String,
    default: '',
  },
  id: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  modelValue: {
    type: String,
    default: '',
  },
  name: {
    type: String,
    required: true,
  },
  required: Boolean,
  spellcheck: {
    type: Boolean,
    default: true,
  },
  type: {
    type: String,
    default: 'text',
  },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div class="auth-field">
    <label class="auth-field__label" :for="id">{{ label }}</label>
    <input
      :id="id"
      class="form-control"
      :name="name"
      :type="type"
      :autocomplete="autocomplete"
      :required="required"
      :spellcheck="spellcheck"
      :disabled="disabled"
      :value="modelValue"
      :aria-invalid="Boolean(error)"
      :aria-describedby="`${id}-error`"
      @input="emit('update:modelValue', $event.target.value)"
    />
    <p :id="`${id}-error`" class="auth-field__error" aria-live="polite">{{ error }}</p>
  </div>
</template>
