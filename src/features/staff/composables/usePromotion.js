import { ref, toValue, watch } from 'vue'

import {
  EMAIL_STATUS_COPY,
  describeEmailRefusal,
} from '@/features/bookings/domain/bookingMessages.js'

import { sendPromotionEmail } from '../data/emailRepository.js'
import { promoteNextBooking } from '../data/staffRepository.js'
import { PROMOTION_MESSAGES } from '../domain/participants.js'

const REFUSAL_CODES = Object.freeze([
  'no-free-place',
  'no-waitlist',
  'session-not-open',
  'counter-mismatch',
  'live-admin-disabled',
])

/**
 * Promote next and the promoted email. `promote` ignores a second
 * press while one is in flight (`state` turns `promoting` before the first await). A success says
 * "Promoted TA-XXXXXX" and asks for "A place is now yours" at once; a refusal says why in words;
 * any other failure keeps the error's own copy. After every outcome `onSettled` runs, so the page
 * reloads the session and its participants: a promotion whose answer was lost shows up as a
 * recently promoted row. An email failure is per row ("Promotion email not sent", Send again) and
 * never touches the promotion. An answer still in flight (`sending`) reads as unknown, and a
 * refusal with a `details.code` the email line knows (daily limit, too soon) keeps its reason.
 *
 * The state belongs to one session: a change of `sessionId` clears it, and an answer that arrives
 * after that change still completes its work (the promoted email is asked for, `onSettled` runs) but
 * writes nothing for the session now shown. `promote` and `sendEmail` resolve to whether their
 * outcome was shown, so the page moves focus only for an outcome it displays.
 *
 * @param {{ sessionId: import('vue').MaybeRefOrGetter<string>, onSettled?: () => unknown }} options
 */
export function usePromotion({ sessionId, onSettled = () => undefined }) {
  const state = ref('idle')
  const message = ref('')
  const lastPromotion = ref(null)
  const emailStates = ref({})

  // Counts session changes; an action remembers the count it started under and writes its outcome
  // only while the count is unchanged.
  let generation = 0
  watch(
    () => toValue(sessionId),
    () => {
      generation += 1
      state.value = 'idle'
      message.value = ''
      lastPromotion.value = null
      emailStates.value = {}
    },
  )

  const setEmailState = (bookingId, next) => {
    emailStates.value = { ...emailStates.value, [bookingId]: next }
  }

  const settle = async () => {
    try {
      await onSettled()
    } catch {
      // The page reports its own reload failure.
    }
  }

  const requestEmail = async (bookingId, resend, run) => {
    const show = (next) => {
      if (run === generation) setEmailState(bookingId, next)
    }
    show({ status: 'sending', message: 'Sending the promotion email' })
    try {
      const result = await sendPromotionEmail(bookingId, { resend })
      if (result.status === 'dry-run') {
        show({ status: 'test-mode', message: EMAIL_STATUS_COPY['dry-run'] })
      } else if (result.status === 'accepted') {
        show({ status: 'sent', message: EMAIL_STATUS_COPY.accepted })
      } else if (result.status === 'unknown' || result.status === 'sending') {
        show({ status: 'failed', message: EMAIL_STATUS_COPY.unknown })
      } else {
        show({ status: 'failed', message: PROMOTION_MESSAGES.emailNotSent })
      }
    } catch (caught) {
      const reason =
        typeof caught?.details?.code === 'string' ? describeEmailRefusal(caught).message : ''
      show({
        status: 'failed',
        message: reason
          ? `${PROMOTION_MESSAGES.emailNotSent}. ${reason}`
          : PROMOTION_MESSAGES.emailNotSent,
      })
    }
    return run === generation
  }

  const sendEmail = async (bookingId, { resend = false } = {}) => {
    if (emailStates.value[bookingId]?.status === 'sending') return false
    return requestEmail(bookingId, resend, generation)
  }

  const promote = async () => {
    if (state.value === 'promoting') return false
    const run = generation
    state.value = 'promoting'
    message.value = ''
    let promoted = null
    let outcome
    try {
      promoted = await promoteNextBooking(toValue(sessionId))
      outcome = { state: 'promoted', message: PROMOTION_MESSAGES.promoted(promoted.reference) }
    } catch (caught) {
      const code = caught?.details?.code
      outcome =
        caught?.code === 'conflict' && REFUSAL_CODES.includes(code)
          ? { state: 'refused', message: PROMOTION_MESSAGES[code] }
          : { state: 'failed', message: caught?.message ?? '' }
    }
    if (run === generation) {
      if (promoted) {
        lastPromotion.value = { bookingId: promoted.bookingId, reference: promoted.reference }
      }
      state.value = outcome.state
      message.value = outcome.message
    }
    await Promise.all([promoted ? requestEmail(promoted.bookingId, false, run) : null, settle()])
    return run === generation
  }

  return { state, message, lastPromotion, emailStates, promote, sendEmail }
}
