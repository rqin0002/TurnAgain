<script setup>
// A pressable filter or option: a real <button> with aria-pressed, so the pressed
// state is announced and the 44 px target is the button itself.
defineProps({
  label: { type: String, required: true },
  pressed: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle'])
</script>

<template>
  <button type="button" class="chip" :aria-pressed="pressed" @click="emit('toggle')">
    {{ label }}
  </button>
</template>

<style scoped>
.chip {
  display: inline-flex;
  min-width: 2.75rem;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface);
  padding: 0.45rem 0.9rem;
  color: var(--color-text);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.2;
  transition:
    background-color var(--duration-fast),
    border-color var(--duration-fast),
    color var(--duration-fast);
}

.chip:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
}

.chip[aria-pressed='true'] {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
}
</style>
