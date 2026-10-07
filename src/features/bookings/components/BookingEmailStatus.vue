<script setup>
import { computed, nextTick, ref, watch } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import CapabilityNotice from '@/shared/components/CapabilityNotice.vue'

import { useBookingEmail } from '../composables/useBookingEmail.js'
import { EMAIL_ACTIONS } from '../domain/bookingMessages.js'

// The email line of a booking (spec 7.7 L954). One status region, mounted empty before any call,
// holds the sentence only; the buttons sit beside it and carry the countdown as their hint. A
// button keeps focus while its own request runs (busy, never natively disabled); when the answer
// removes or disables it, focus moves to the status sentence instead of falling to <body>.
const props = defineProps({
  bookingId: { type: String, required: true },
  kind: {
    type: String,
    required: true,
    validator: (value) => ['confirmed', 'waitlisted', 'cancelled'].includes(value),
  },
  requestOnMount: { type: Boolean, default: false },
})

const emit = defineEmits(['first-status'])

const email = useBookingEmail({
  bookingId: () => props.bookingId,
  kind: () => props.kind,
  requestOnMount: props.requestOnMount,
})
const { enabled, status, result, refusal, message, secondsLeft, canResend, exhausted } = email

// The buttons follow the last status the server reported; a refusal or an error keeps it.
const shown = computed(() =>
  ['requesting', 'refused', 'error'].includes(status.value)
    ? (result.value?.status ?? 'idle')
    : status.value,
)
const busy = computed(() => status.value === 'requesting')
const hintId = computed(() => `booking-email-hint-${props.bookingId}`)
const describedBy = computed(() => (secondsLeft.value > 0 ? hintId.value : undefined))

const statusLine = ref(null)
const actions = ref(null)

const keepFocus = (run) => async () => {
  const hadFocus = actions.value?.contains(document.activeElement) ?? false
  await run()
  await nextTick()
  if (!hadFocus) return
  const focused = document.activeElement
  if (!actions.value?.contains(focused) || focused.disabled) statusLine.value?.focus()
}
const onResend = keepFocus(email.resend)
const onCheck = keepFocus(email.checkStatus)

let announced = false
watch(
  [result, refusal],
  ([answer, refused]) => {
    if (!announced && (answer || refused)) {
      announced = true
      emit('first-status')
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <CapabilityNotice v-if="!enabled" :enabled="false" feature="booking-email" />
  <div v-else class="booking-email">
    <p ref="statusLine" class="booking-email__status" role="status" tabindex="-1">
      {{ message }}
    </p>
    <div ref="actions" class="booking-email__actions">
      <AppButton
        v-if="shown === 'failed'"
        variant="secondary"
        :busy="busy"
        :disabled="!canResend"
        :aria-describedby="describedBy"
        @click="onResend"
      >
        {{ EMAIL_ACTIONS.resend }}
      </AppButton>
      <template v-else-if="shown === 'unknown'">
        <AppButton variant="secondary" :busy="busy" :disabled="exhausted" @click="onCheck">
          {{ EMAIL_ACTIONS.checkStatus }}
        </AppButton>
        <AppButton
          variant="secondary"
          :busy="busy"
          :disabled="!canResend"
          :aria-describedby="describedBy"
          @click="onResend"
        >
          {{ EMAIL_ACTIONS.sendAgain }}
        </AppButton>
      </template>
      <AppButton v-else-if="shown === 'idle'" variant="secondary" :busy="busy" @click="onCheck">
        {{ EMAIL_ACTIONS.checkEmailStatus }}
      </AppButton>
    </div>
    <p v-if="secondsLeft > 0" :id="hintId" class="booking-email__hint">
      Available in {{ secondsLeft }} s
    </p>
  </div>
</template>

<style scoped>
.booking-email {
  display: grid;
  gap: 0.75rem;
}

.booking-email p {
  margin: 0;
}

.booking-email__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.booking-email__hint {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
