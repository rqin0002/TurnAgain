<script setup>
/**
 * A compact status mark for table cells and cards: the status in words inside a tinted outline.
 * The words carry the meaning and the tone only echoes it (WCAG 1.4.1), so a reader who cannot
 * tell the colours apart reads the same thing. Tones use the theme's tokens, so both themes work.
 */
defineProps({
  tone: {
    type: String,
    default: 'neutral',
    validator: (value) => ['neutral', 'brand', 'success', 'warning', 'danger'].includes(value),
  },
})
</script>

<template>
  <span class="status-tag" :class="`status-tag--${tone}`"><slot /></span>
</template>

<style scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  padding: 0.0625rem 0.5rem;
  background: var(--color-surface-muted);
  color: var(--color-heading);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
}

.status-tag--brand {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}

.status-tag--success {
  border-color: var(--color-success);
  background: var(--color-success-soft);
}

.status-tag--warning {
  border-color: var(--color-warning);
  background: var(--color-warning-soft);
}

.status-tag--danger {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}
</style>
