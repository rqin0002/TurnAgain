<script setup>
import { computed } from 'vue'

// Stands in for a callable-backed control when the build was made without Cloud Functions.
// The caller reads `capabilities.functions` from
// @/firebase/firebaseFunctionsClient.js and passes it as `enabled`; the notice is decided from
// that configuration and never inferred from an error.
const props = defineProps({
  enabled: { type: Boolean, required: true },
  feature: {
    type: String,
    required: true,
    validator: (value) =>
      ['booking-email', 'session-email', 'promotion', 'team', 'members'].includes(value),
  },
})

const SENTENCES = Object.freeze({
  'booking-email':
    'Booking emails are sent by a Cloud Function, so the email status and Resend are unavailable in this build.',
  'session-email':
    'Emails to participants are sent by a Cloud Function, so the session email form is unavailable in this build.',
  promotion:
    'Promoting the next waitlisted participant runs as a Cloud Function, so it is unavailable in this build.',
  team: 'Role and status changes run as a Cloud Function, so the Team table is unavailable in this build; an administrator can change roles and status in the Firebase console instead.',
  members:
    'Role and status changes run as a Cloud Function, so the Members table is unavailable in this build; an administrator can change roles and status in the Firebase console instead.',
})

const sentence = computed(() => SENTENCES[props.feature])
</script>

<template>
  <div v-if="!enabled" class="capability-notice" role="status">
    <p class="capability-notice__text">
      <strong>Not enabled in this deployment.</strong> {{ sentence }}
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
