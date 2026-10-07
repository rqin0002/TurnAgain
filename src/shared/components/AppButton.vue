<script setup>
// The one button. The look comes from the shared `.button` and `.text-button` rules
// of main.css so existing markup and this component match until every site has migrated.
const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'text'].includes(value),
  },
  type: {
    type: String,
    default: 'button',
    validator: (value) => ['button', 'submit', 'reset'].includes(value),
  },
  disabled: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})

// A busy button keeps focus (a disabled one would drop it) and announces aria-busy; its click is
// swallowed here so a second submit cannot start while the first is in flight.
const guardClick = (event) => {
  if (props.busy) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}
</script>

<template>
  <button
    :type="type"
    :class="variant === 'text' ? 'text-button' : ['button', `button--${variant}`]"
    :disabled="disabled"
    :aria-disabled="busy ? 'true' : undefined"
    :aria-busy="busy ? 'true' : undefined"
    @click="guardClick"
  >
    <span v-if="busy" class="app-button__spinner" aria-hidden="true"></span>
    <slot />
  </button>
</template>

<style scoped>
.app-button__spinner {
  width: 1rem;
  height: 1rem;
  flex: none;
  border: 2px solid color-mix(in srgb, currentcolor 35%, transparent);
  border-top-color: currentcolor;
  border-radius: 50%;
  animation: app-button-spin 0.8s linear infinite;
}

@keyframes app-button-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-button__spinner {
    animation: none;
  }
}
</style>
