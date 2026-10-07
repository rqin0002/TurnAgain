import { validateSessionEmail } from '@shared/emailValidation.js'
import { formatSessionWhen } from '@shared/melbourneTime.js'
import { computed, nextTick, ref, shallowRef, toValue, watch } from 'vue'

import { EMAIL_STATUS_COPY } from '@/features/bookings/domain/bookingMessages.js'
import { formatDate } from '@/shared/domain/formatDate.js'

import { sendSessionEmail } from '../data/emailRepository.js'
import { isStaffFunctionsEnabled } from '../data/staffCapabilities.js'
import { recipientSummary } from '../domain/participants.js'

/** The form's states; the page's `loading` is the participants' load. */
export const EMAIL_FORM_STATES = Object.freeze([
  'composing',
  'no-participants',
  'confirming',
  'sending',
  'sent',
  'partial',
  'unknown',
  'failed',
])

/** The status label of a "Previous emails for this session" row. */
export const EMAIL_LOG_STATUS_LABELS = Object.freeze({
  sending: 'Sending',
  accepted: EMAIL_STATUS_COPY.accepted,
  partial: 'Partly sent',
  failed: EMAIL_STATUS_COPY.failed,
  unknown: EMAIL_STATUS_COPY.unknown,
  'dry-run': EMAIL_STATUS_COPY['dry-run'],
})

/** A log row that may have reached people offers New send only. */
export const offersNewSendFromLog = (log) => ['unknown', 'partial', 'sending'].includes(log?.status)

export const PARTICIPANT_EMAIL_MESSAGES = Object.freeze({
  unknown:
    "We can't tell whether this was sent; Check status or Send again (participants may receive it twice)",
  failed: "Couldn't send; Retry sends the same message again",
  retryRefused: 'This retry no longer matches the earlier send, so nothing was sent. Use New send.',
  notParticipants: (count) =>
    `${count} selected people are no longer on this session and were not emailed. The participant list has been reloaded.`,
  fromLog: (log) =>
    `An earlier send to ${log.recipientCount} participants may have reached them; they may receive this one too.`,
})

/** The form's field copy. */
export const PARTICIPANT_EMAIL_FIELD_MESSAGES = Object.freeze({
  subject: Object.freeze({
    required: 'Enter a subject.',
    'too-short': 'Use at least 3 characters.',
    'too-long': 'Use 120 characters or fewer.',
    'control-characters': 'Remove control characters.',
  }),
  body: Object.freeze({
    required: 'Enter a message.',
    'too-short': 'Use at least 10 characters.',
    'too-long': 'Use 2,000 characters or fewer.',
    'control-characters': 'Remove control characters.',
  }),
  recipients: Object.freeze({
    'empty-without-copy': 'Select at least one participant, or tick "Send me a copy".',
    'too-many': 'Select 99 participants or fewer.',
  }),
})
const NO_ERRORS = Object.freeze({ subject: '', body: '', recipients: '' })

/** One form message per field from the codes of `validateSessionEmail` (or the function's `fields`). */
function toFieldErrors(codes = {}) {
  const recipientCode = codes.recipientBookingIds
  return {
    subject: codes.subject
      ? (PARTICIPANT_EMAIL_FIELD_MESSAGES.subject[codes.subject] ?? 'Check the subject.')
      : '',
    body: codes.body
      ? (PARTICIPANT_EMAIL_FIELD_MESSAGES.body[codes.body] ?? 'Check the message.')
      : '',
    recipients: recipientCode
      ? (PARTICIPANT_EMAIL_FIELD_MESSAGES.recipients[recipientCode] ??
        'Select the participants again.')
      : '',
  }
}

const STATE_OF_STATUS = Object.freeze({
  accepted: 'sent',
  'dry-run': 'sent',
  partial: 'partial',
  failed: 'failed',
  unknown: 'unknown',
  sending: 'unknown',
})

/**
 * The result banner.
 *
 * @param {{ status: string, results: { participants: object, copy: object | null } } | null} response
 */
export function sessionSendBanner(response) {
  if (!response) return ''
  if (response.status === 'dry-run') return EMAIL_STATUS_COPY['dry-run']
  const { participants, copy } = response.results
  const count = participants.recipientCount
  const pending = [participants.status, copy?.status].some(
    (status) => status === 'unknown' || status === 'sending',
  )
  let text
  if (response.status === 'accepted') {
    if (participants.status === 'skipped') text = 'Copy sent to you'
    else if (copy) text = `Sent to the email provider for ${count} participants; copy sent to you`
    else text = `Sent to the email provider for ${count} participants`
  } else if (response.status === 'partial' && !pending) {
    if (participants.status === 'accepted') {
      text = "Participants: sent; your copy: couldn't send, Retry copy"
    } else if (copy?.status === 'accepted') {
      text = "Participants: couldn't send; your copy: sent, Retry participants"
    } else {
      text = PARTICIPANT_EMAIL_MESSAGES.failed
    }
  } else if (response.status === 'failed') {
    text = PARTICIPANT_EMAIL_MESSAGES.failed
  } else {
    text = PARTICIPANT_EMAIL_MESSAGES.unknown
  }
  const skipped = participants.skippedCount ?? 0
  return skipped > 0
    ? `${text}. ${skipped} participants have addresses that can't receive mail and were skipped.`
    : text
}

const fingerprint = (values) =>
  JSON.stringify({
    ...values,
    recipientBookingIds: [...values.recipientBookingIds].sort(),
  })

/**
 * The participant email form. The operation lives
 * in memory only: `operationId` is made when the form starts and kept until a send whose every
 * requested part is accepted or dry-run. Retry repeats the last operation exactly (its id and
 * content) and is withdrawn as soon as the subject, the message, the selection or a box changes;
 * New send takes a fresh id on confirm and says who may already have the earlier message. A Retry
 * the function refuses (`operation-mismatch`) is reported and leaves New send, never turning into
 * a new operation by itself. "Previous emails" rows that may have reached people (`unknown`,
 * `partial`, `sending`) offer New send with a warning built from the row. With nobody selected,
 * Send is possible only with "Send me a copy" (the zero-participant demonstration), and
 * unticking it clears "Attach participant list" (the list rides on the copy only). New send after
 * a thrown send, or with the participants' part unsettled, warns that the earlier send may have
 * reached them. The subject and message are prefilled from the session, and prefilled again while
 * the form is untouched and unsent (a session cancelled meanwhile gains "Cancelled: "), never over
 * what the person typed. With `focusTarget` (a ref to the mounted banner line, tabindex="-1"),
 * focus moves there as a send starts, because Send now and Retry unmount at once and would leave
 * focus on <body>. A confirm is a snapshot: Send now and New send send the validated
 * content, the selection and the session the confirm text described, even when the participants'
 * checkboxes above the form (which stay usable) or the session moved meanwhile.
 *
 * @param {{ sessionId: import('vue').MaybeRefOrGetter<string>, session: import('vue').MaybeRefOrGetter<object | null>, activityTitle: import('vue').MaybeRefOrGetter<string>, selectedBookings: import('vue').MaybeRefOrGetter<object[]>, liveCount: import('vue').MaybeRefOrGetter<number>, emailLogs: import('vue').MaybeRefOrGetter<object[]>, onParticipantsChanged?: (ids: string[]) => unknown, onSettled?: () => unknown, focusTarget?: import('vue').Ref<HTMLElement | null> | null }} options
 */
export function useParticipantEmail({
  sessionId,
  session,
  activityTitle,
  selectedBookings,
  liveCount,
  emailLogs,
  onParticipantsChanged = () => undefined,
  onSettled = () => undefined,
  focusTarget = null,
}) {
  const enabled = isStaffFunctionsEnabled()
  const subject = ref('')
  const body = ref('')
  const copyToSender = ref(true)
  const attachParticipants = ref(false)
  const errors = ref({ ...NO_ERRORS })
  const operationId = ref(crypto.randomUUID())
  const result = shallowRef(null)
  const state = ref(toValue(liveCount) === 0 ? 'no-participants' : 'composing')
  const confirmText = ref('')
  const notice = ref('')
  // The last operation sent from this form: its id, its session and the validated content (Retry
  // repeats all three).
  const lastSend = shallowRef(null)
  const retryRefused = ref(false)
  let pending = null
  // The text the form last prefilled; null until the session is known.
  let lastPrefill = null

  const prefill = (current) => {
    if (!current || lastSend.value !== null) return
    const untouched =
      lastPrefill === null ||
      (subject.value === lastPrefill.subject && body.value === lastPrefill.body)
    if (!untouched) return
    const title = toValue(activityTitle)
    const cancelled = current.status === 'cancelled'
    const day = formatDate(current.startsAt, { dateStyle: 'medium' })
    lastPrefill = {
      subject: `${cancelled ? 'Cancelled: ' : ''}Your ${title} session on ${day}`,
      body:
        `This message is about your ${title} session on ` +
        `${formatSessionWhen(current.startsAt, current.endsAt)} at ${current.venueName}, ${current.suburb}.` +
        (cancelled ? '\n\nThis session is cancelled.' : ''),
    }
    subject.value = lastPrefill.subject
    body.value = lastPrefill.body
  }
  watch(
    () => [toValue(session), toValue(activityTitle)],
    ([current]) => prefill(current),
    { immediate: true },
  )
  watch(copyToSender, (copy) => {
    if (!copy) attachParticipants.value = false
  })

  watch(
    () => toValue(liveCount),
    (count) => {
      if (state.value === 'composing' || state.value === 'no-participants') {
        state.value = count === 0 ? 'no-participants' : 'composing'
      }
    },
  )

  const selected = computed(() => toValue(selectedBookings))
  const validation = computed(() =>
    validateSessionEmail({
      recipientBookingIds: selected.value.map((booking) => booking.id),
      subject: subject.value,
      body: body.value,
      copyToSender: copyToSender.value,
      attachParticipants: attachParticipants.value,
    }),
  )
  const edited = computed(
    () =>
      lastSend.value !== null &&
      fingerprint(validation.value.values) !== fingerprint(lastSend.value.values),
  )
  const composing = computed(() => ['composing', 'no-participants'].includes(state.value))
  const settledWithDoubt = computed(() => ['failed', 'partial', 'unknown'].includes(state.value))
  const canSend = computed(() => composing.value && validation.value.isValid)
  const canRetry = computed(
    () => settledWithDoubt.value && lastSend.value !== null && !edited.value && !retryRefused.value,
  )
  const retryLabel = computed(() => (state.value === 'unknown' ? 'Check status' : 'Retry'))
  const canNewSend = computed(
    () => settledWithDoubt.value || (state.value === 'sent' && edited.value),
  )
  const testMode = computed(() => result.value?.status === 'dry-run')
  const banner = computed(() => {
    if (state.value === 'sending' || state.value === 'confirming') return ''
    if (state.value === 'failed' && result.value === null) return PARTICIPANT_EMAIL_MESSAGES.failed
    return sessionSendBanner(result.value)
  })
  const previousEmails = computed(() =>
    (toValue(emailLogs) ?? []).filter((log) => log.sessionId === toValue(sessionId)),
  )

  const settle = async () => {
    try {
      await onSettled()
    } catch {
      // The page reports its own reload failure.
    }
  }

  const checkContent = () => {
    errors.value = toFieldErrors(validation.value.errors)
    return validation.value.isValid
  }

  const requestSend = () => {
    if (!composing.value || !checkContent()) return
    const { count, total } = recipientSummary(selected.value, toValue(liveCount))
    const copy = copyToSender.value ? ' and a copy to you' : ''
    confirmText.value = `Send "${validation.value.values.subject}" to ${count} of ${total} participants${copy}?`
    pending = {
      action: 'send',
      returnTo: state.value,
      sessionId: toValue(sessionId),
      values: validation.value.values,
    }
    notice.value = ''
    state.value = 'confirming'
  }

  const requestNewSend = (fromLog) => {
    if (state.value === 'confirming' || state.value === 'sending') return
    if (fromLog ? !offersNewSendFromLog(fromLog) : !canNewSend.value) return
    if (!checkContent()) return
    if (fromLog) {
      confirmText.value = PARTICIPANT_EMAIL_MESSAGES.fromLog(fromLog)
    } else {
      const participants = result.value?.results?.participants
      if (!participants || ['unknown', 'sending'].includes(participants.status)) {
        // A thrown send or an unsettled part may have reached people: never "0 ... received".
        confirmText.value = PARTICIPANT_EMAIL_MESSAGES.fromLog({
          recipientCount:
            participants?.recipientCount ?? lastSend.value.values.recipientBookingIds.length,
        })
      } else {
        // Of the current selection, the people the earlier send reached (never its count alone).
        const earlier = new Set(lastSend.value.values.recipientBookingIds)
        const reached =
          participants.status === 'accepted'
            ? selected.value.filter((booking) => earlier.has(booking.id)).length
            : 0
        confirmText.value = `${reached} of ${selected.value.length} selected participants already received the earlier message and may receive this one too`
      }
    }
    pending = {
      action: 'new',
      returnTo: state.value,
      sessionId: toValue(sessionId),
      values: validation.value.values,
    }
    state.value = 'confirming'
  }

  const cancelConfirm = () => {
    if (state.value !== 'confirming' || pending === null) return
    state.value = pending.returnTo
    pending = null
  }

  const run = async ({ id, sessionId: target, values, returnTo }) => {
    state.value = 'sending'
    notice.value = ''
    // Send now and Retry unmount as the send starts: keep the keyboard on the line that will
    // report the result.
    await nextTick()
    focusTarget?.value?.focus()
    try {
      const response = await sendSessionEmail({ operationId: id, sessionId: target, ...values })
      result.value = response
      lastSend.value = { operationId: id, sessionId: target, values }
      state.value = STATE_OF_STATUS[response.status] ?? 'unknown'
      if (state.value === 'sent') operationId.value = crypto.randomUUID()
    } catch (caught) {
      const details = caught?.details ?? {}
      if (caught?.code === 'conflict' && details.code === 'operation-mismatch') {
        retryRefused.value = true
        notice.value = PARTICIPANT_EMAIL_MESSAGES.retryRefused
        state.value = returnTo
      } else if (
        caught?.code === 'invalid-data' &&
        details.fields?.recipientBookingIds === 'not-participants'
      ) {
        const ids = Array.isArray(details.ids) ? details.ids : []
        notice.value = PARTICIPANT_EMAIL_MESSAGES.notParticipants(ids.length)
        state.value = lastSend.value === null ? 'composing' : returnTo
        await onParticipantsChanged(ids)
      } else if (caught?.code === 'invalid-data' && details.fields) {
        errors.value = toFieldErrors(details.fields)
        state.value = lastSend.value === null ? 'composing' : returnTo
      } else {
        // The request may have reached the function: repeating this operation is safe (a settled
        // operation is answered from its record, only failed sub-sends are sent again).
        lastSend.value = { operationId: id, sessionId: target, values }
        result.value = null
        notice.value = caught?.message ?? ''
        state.value = 'failed'
      }
      if (state.value === 'composing' && toValue(liveCount) === 0) state.value = 'no-participants'
    }
    await settle()
  }

  const confirm = async () => {
    if (state.value !== 'confirming' || pending === null) return
    // The snapshot taken with the confirm text goes, never the selection of this moment.
    const { action, returnTo, sessionId: target, values } = pending
    pending = null
    if (action === 'new') {
      operationId.value = crypto.randomUUID()
      retryRefused.value = false
    }
    await run({ id: operationId.value, sessionId: target, values, returnTo })
  }

  const retry = async () => {
    if (!canRetry.value) return
    const { operationId: id, sessionId: target, values } = lastSend.value
    await run({ id, sessionId: target, values, returnTo: state.value })
  }

  return {
    enabled,
    state,
    subject,
    body,
    copyToSender,
    attachParticipants,
    errors,
    operationId,
    result,
    banner,
    testMode,
    edited,
    canSend,
    canRetry,
    retryLabel,
    canNewSend,
    confirmText,
    notice,
    previousEmails,
    requestSend,
    requestNewSend,
    confirm,
    cancelConfirm,
    retry,
  }
}
