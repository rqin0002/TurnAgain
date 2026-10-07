<script setup>
import { computed, nextTick, ref } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import CapabilityNotice from '@/shared/components/CapabilityNotice.vue'
import FormField from '@/shared/components/FormField.vue'
import { formatDate, formatTime } from '@/shared/domain/formatDate.js'

import {
  EMAIL_LOG_STATUS_LABELS,
  PARTICIPANT_EMAIL_FIELD_MESSAGES,
  offersNewSendFromLog,
  useParticipantEmail,
} from '../composables/useParticipantEmail.js'
import { recipientSummary } from '../domain/participants.js'

/**
 * "Email participants" on the staff session page (spec 8.4, L997): subject and message prefilled,
 * the copy and attachment boxes, the calendar-file note, the recipient summary with every selected
 * name above Send (wherever those people sit in the table, U12), an in-page confirm, the result
 * banner, Retry or Check status and New send by availability, and the previous emails of this
 * session. Without functions in this build the whole form is the capability notice.
 */
const props = defineProps({
  sessionId: { type: String, required: true },
  session: { type: Object, required: true },
  activityTitle: { type: String, required: true },
  selectedBookings: { type: Array, required: true },
  liveCount: { type: Number, required: true },
  emailLogs: { type: Array, required: true },
})
const emit = defineEmits(['participants-changed', 'settled'])

// The banner line takes focus as a send starts (Send now and Retry unmount at once, M6-D22).
const bannerLine = ref(null)
const email = useParticipantEmail({
  sessionId: () => props.sessionId,
  session: () => props.session,
  activityTitle: () => props.activityTitle,
  selectedBookings: () => props.selectedBookings,
  liveCount: () => props.liveCount,
  emailLogs: () => props.emailLogs,
  onParticipantsChanged: (ids) => emit('participants-changed', ids),
  onSettled: () => emit('settled'),
  focusTarget: bannerLine,
})
const {
  enabled,
  state,
  subject,
  body,
  copyToSender,
  attachParticipants,
  errors,
  banner,
  canRetry,
  retryLabel,
  canNewSend,
  confirmText,
  notice,
  previousEmails,
} = email

const summary = computed(() => recipientSummary(props.selectedBookings, props.liveCount))
const locked = computed(() => state.value === 'confirming' || state.value === 'sending')
const composing = computed(() => ['composing', 'no-participants'].includes(state.value))
// The zero-selection rule (L997): with nobody selected, Send needs "Send me a copy". Other
// checks run on Send, so the person sees which field to fix.
const needsRecipient = computed(() => summary.value.count === 0 && !copyToSender.value)
const recipientHint = computed(
  () =>
    errors.value.recipients ||
    (needsRecipient.value ? PARTICIPANT_EMAIL_FIELD_MESSAGES.recipients['empty-without-copy'] : ''),
)
const sendButton = ref(null)
const newSendButton = ref(null)
const confirmBlock = ref(null)
const formElement = ref(null)
// A log row's New send that opened the confirm: Back returns there when Send stays disabled.
let opener = null

const when = (iso) => `${formatDate(iso, { dateStyle: 'medium' })}, ${formatTime(iso)}`

const openConfirm = async (open, from = null) => {
  opener = from
  open()
  await nextTick()
  if (state.value === 'confirming') confirmBlock.value?.focus()
  else formElement.value?.querySelector('[aria-invalid="true"]')?.focus()
}
const back = async () => {
  email.cancelConfirm()
  await nextTick()
  // Back from a confirm opened after a settled send leaves Send disabled, and focusing a disabled
  // button would drop the keyboard to <body> (M6-D22): the control that opened the confirm takes
  // it (the main New send is mounted again), else the banner line.
  const target =
    [sendButton.value?.$el, opener, newSendButton.value?.$el].find(
      (node) => node?.isConnected && !node.disabled,
    ) ?? bannerLine.value
  opener = null
  target?.focus()
}
</script>

<template>
  <section id="session-email" class="session-email" aria-labelledby="session-email-heading">
    <h3 id="session-email-heading">Email participants</h3>
    <CapabilityNotice :enabled="enabled" feature="session-email" />
    <template v-if="enabled">
      <form
        ref="formElement"
        class="session-email__form"
        novalidate
        :aria-busy="state === 'sending' ? 'true' : undefined"
        @submit.prevent="openConfirm(email.requestSend)"
      >
        <fieldset class="session-email__fieldset" :disabled="locked">
          <legend class="visually-hidden">Message</legend>
          <FormField
            id="session-email-subject"
            v-slot="{ control }"
            label="Subject"
            :error="errors.subject"
            required
          >
            <input v-bind="control" v-model="subject" class="form-control" type="text" dir="auto" />
          </FormField>
          <FormField
            id="session-email-body"
            v-slot="{ control }"
            label="Message"
            :error="errors.body"
            required
          >
            <textarea
              v-bind="control"
              v-model="body"
              class="form-control"
              rows="8"
              dir="auto"
            ></textarea>
          </FormField>
          <div class="session-email__box">
            <input id="session-email-copy" v-model="copyToSender" type="checkbox" />
            <label for="session-email-copy">Send me a copy</label>
          </div>
          <div class="session-email__box">
            <input
              id="session-email-attach"
              v-model="attachParticipants"
              type="checkbox"
              :disabled="!copyToSender"
            />
            <label for="session-email-attach">Attach participant list to my copy</label>
          </div>
          <p class="session-email__note">A calendar file for this session is attached</p>
        </fieldset>
        <div class="session-email__summary">
          <p class="session-email__sentence">{{ summary.sentence }}</p>
          <ul v-if="summary.names.length > 0" class="session-email__names">
            <li v-for="(name, index) in summary.names" :key="index" dir="auto">
              {{ name }}
            </li>
          </ul>
          <p v-if="recipientHint" class="session-email__error">
            {{ recipientHint }}
          </p>
        </div>
        <AppButton ref="sendButton" type="submit" :disabled="!composing || needsRecipient"
          >Send</AppButton
        >
      </form>

      <div
        v-if="state === 'confirming'"
        ref="confirmBlock"
        class="session-email__confirm"
        tabindex="-1"
        role="group"
        aria-labelledby="session-email-confirm-text"
      >
        <p id="session-email-confirm-text">{{ confirmText }}</p>
        <div class="session-email__buttons">
          <AppButton @click="email.confirm()">Send now</AppButton>
          <AppButton variant="secondary" @click="back">Back</AppButton>
        </div>
      </div>

      <p ref="bannerLine" class="session-email__banner" role="status" tabindex="-1">{{ banner }}</p>
      <p class="session-email__notice" role="status">{{ notice }}</p>

      <div v-if="canRetry || canNewSend" class="session-email__buttons">
        <AppButton v-if="canRetry" @click="email.retry()">{{ retryLabel }}</AppButton>
        <AppButton
          v-if="canNewSend"
          ref="newSendButton"
          variant="secondary"
          @click="openConfirm(() => email.requestNewSend())"
          >New send</AppButton
        >
      </div>

      <section class="session-email__history" aria-labelledby="session-email-history-heading">
        <h4 id="session-email-history-heading">Previous emails for this session</h4>
        <p v-if="previousEmails.length === 0">No emails have been sent for this session yet.</p>
        <ul v-else class="session-email__log">
          <li v-for="log in previousEmails" :key="log.id" class="session-email__log-row">
            <p class="session-email__log-subject" dir="auto">
              {{ log.subject }}
            </p>
            <p class="session-email__log-meta">
              {{ when(log.sentAt) }} · {{ log.recipientCount }} participants ·
              {{ EMAIL_LOG_STATUS_LABELS[log.status] }}
            </p>
            <AppButton
              v-if="offersNewSendFromLog(log)"
              variant="secondary"
              :disabled="locked"
              @click="openConfirm(() => email.requestNewSend(log), $event.currentTarget)"
              >New send<span class="visually-hidden"> after "{{ log.subject }}"</span></AppButton
            >
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.session-email,
.session-email__form,
.session-email__fieldset,
.session-email__summary,
.session-email__history {
  display: grid;
  gap: 0.75rem;
}

.session-email__fieldset {
  margin: 0;
  border: 0;
  padding: 0;
}

.session-email__box {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.session-email p,
.session-email__names {
  margin: 0;
}

.session-email__error {
  color: var(--color-danger);
}

.session-email__confirm {
  display: grid;
  gap: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  padding: 0.85rem 1rem;
}

.session-email__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.session-email__log {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.session-email__log-meta {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
