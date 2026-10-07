<script setup>
// A session's availability as words: the tone only styles it, the label carries it.
defineProps({
  tone: {
    type: String,
    required: true,
    validator: (value) =>
      ['open', 'limited', 'waitlist', 'booked', 'closed', 'cancelled', 'external'].includes(value),
  },
  label: { type: String, required: true },
})
</script>

<template>
  <span class="availability-badge" :class="`availability-badge--${tone}`">{{ label }}</span>
</template>

<style scoped>
.availability-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  padding: 0.2rem 0.7rem;
  color: var(--color-heading);
  font-size: 0.875rem;
  font-weight: 600;
}

.availability-badge--limited,
.availability-badge--waitlist {
  border-color: var(--color-warning);
  background: var(--color-warning-soft);
}

.availability-badge--booked {
  border-color: var(--color-success);
  background: var(--color-success-soft);
}

.availability-badge--cancelled {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}
</style>
