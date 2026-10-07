<script setup>
import { computed } from 'vue'

// Stands in for a callable-backed control when the build was made without Cloud Functions
// (spec 5.9, 8.7). The caller reads `capabilities.functions` from
// @/firebase/firebaseFunctionsClient.js and passes it as `enabled`; the notice is decided from
// that configuration and never inferred from an error.
const props = defineProps({
  enabled: { type: Boolean, required: true },
  feature: {
    type: String,
    required: true,
    validator: (value) => ['booking-email', 'session-email', 'promotion', 'team'].includes(value),
  },
})

const CONSOLE_PROCEDURE_URL =
  'https://github.com/rqin0002/TurnAgain/blob/main/seed/README.md#demo-accounts'

const SENTENCES = Object.freeze({
  'booking-email':
    'Booking emails are sent by a Cloud Function, so the email status and Resend are unavailable in this build.',
  'session-email':
    'Emails to participants are sent by a Cloud Function, so the session email form is unavailable in this build.',
  promotion:
    'Promoting the next waitlisted participant runs as a Cloud Function, so it is unavailable in this build.',
  team: 'Role and status changes run as a Cloud Function, so the Team table is unavailable in this build; use the console procedure instead.',
})

const sentence = computed(() => SENTENCES[props.feature])
</script>

<template>
  <div v-if="!enabled" class="capability-notice" role="status">
    <p class="capability-notice__text">
      <strong>Not enabled in this deployment.</strong> {{ sentence }}
    </p>
    <p v-if="feature === 'team'" class="capability-notice__link">
      <a :href="CONSOLE_PROCEDURE_URL" target="_blank" rel="noopener noreferrer"
        >Console procedure for demo and staff accounts<span class="visually-hidden">
          (opens in a new tab)</span
        ></a
      >
    </p>
  </div>
</template>

<style scoped>
.capability-notice {
  display: grid;
  gap: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 0.85rem 1rem;
  color: var(--color-text);
}

.capability-notice p {
  margin: 0;
}
</style>
