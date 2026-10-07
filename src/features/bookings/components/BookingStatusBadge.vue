<script setup>
import { computed } from 'vue'

import { BOOKING_MESSAGES } from '../domain/bookingMessages.js'

// A booking's status, and its session's when that matters (spec 7.7 L956), as words.
const props = defineProps({
  status: {
    type: String,
    required: true,
    validator: (value) => ['confirmed', 'waitlisted', 'cancelled'].includes(value),
  },
  sessionState: {
    type: String,
    default: 'current',
    validator: (value) => ['current', 'unconfirmed', 'cancelled'].includes(value),
  },
})

const LABELS = Object.freeze({
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
})
const SESSION_LABELS = Object.freeze({
  cancelled: BOOKING_MESSAGES.sessionCancelledByTurnAgain,
  unconfirmed: BOOKING_MESSAGES.sessionUnconfirmed,
})

const sessionLabel = computed(() => SESSION_LABELS[props.sessionState] ?? '')
</script>

<template>
  <span class="booking-status-badges">
    <span class="booking-status" :class="`booking-status--${status}`">{{ LABELS[status] }}</span>
    <span
      v-if="sessionLabel"
      class="booking-status"
      :class="`booking-status--session-${sessionState}`"
    >
      {{ sessionLabel }}
    </span>
  </span>
</template>

<style scoped>
.booking-status-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.booking-status {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  padding: 0.15rem 0.65rem;
  color: var(--color-heading);
  font-size: 0.875rem;
  font-weight: 600;
}

.booking-status--confirmed {
  border-color: var(--color-success);
  background: var(--color-success-soft);
}

.booking-status--waitlisted,
.booking-status--session-unconfirmed {
  border-color: var(--color-warning);
  background: var(--color-warning-soft);
}

.booking-status--cancelled,
.booking-status--session-cancelled {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}
</style>
