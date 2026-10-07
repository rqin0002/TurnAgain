import { ref, toValue } from 'vue'

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
 * Promote next and the promoted email (spec 5.6, 8.4, decision M6-D9). `promote` ignores a second
 * press while one is in flight (`state` turns `promoting` before the first await). A success says
 * "Promoted TA-XXXXXX" and asks for "A place is now yours" at once; a refusal says why in words;
 * any other failure keeps the error's own copy. After every outcome `onSettled` runs, so the page
 * reloads the session and its participants: a promotion whose answer was lost shows up as a
 * recently promoted row. An email failure is per row ("Promotion email not sent", Send again) and
 * never touches the promotion. An answer still in flight (`sending`) reads as unknown, and a
 * refusal with a `details.code` the email line knows (daily limit, too soon) keeps its reason.
 *
 * @param {{ sessionId: import('vue').MaybeRefOrGetter<string>, onSettled?: () => unknown }} options
 */
export function usePromotion({ sessionId, onSettled = () => undefined }) {
  const state = ref('idle')
  const message = ref('')
  const lastPromotion = ref(null)
  const emailStates = ref({})

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

  const sendEmail = async (bookingId, { resend = false } = {}) => {
    if (emailStates.value[bookingId]?.status === 'sending') return
    setEmailState(bookingId, {
      status: 'sending',
      message: 'Sending the promotion email',
    })
    try {
      const result = await sendPromotionEmail(bookingId, { resend })
      if (result.status === 'dry-run') {
        setEmailState(bookingId, {
          status: 'test-mode',
          message: EMAIL_STATUS_COPY['dry-run'],
        })
      } else if (result.status === 'accepted') {
        setEmailState(bookingId, {
          status: 'sent',
          message: EMAIL_STATUS_COPY.accepted,
        })
      } else if (result.status === 'unknown' || result.status === 'sending') {
        setEmailState(bookingId, {
          status: 'failed',
          message: EMAIL_STATUS_COPY.unknown,
        })
      } else {
        setEmailState(bookingId, {
          status: 'failed',
          message: PROMOTION_MESSAGES.emailNotSent,
        })
      }
    } catch (caught) {
      const reason =
        typeof caught?.details?.code === 'string' ? describeEmailRefusal(caught).message : ''
      setEmailState(bookingId, {
        status: 'failed',
        message: reason
          ? `${PROMOTION_MESSAGES.emailNotSent}. ${reason}`
          : PROMOTION_MESSAGES.emailNotSent,
      })
    }
  }

  const promote = async () => {
    if (state.value === 'promoting') return
    state.value = 'promoting'
    message.value = ''
    let promoted = null
    try {
      promoted = await promoteNextBooking(toValue(sessionId))
      lastPromotion.value = {
        bookingId: promoted.bookingId,
        reference: promoted.reference,
      }
      state.value = 'promoted'
      message.value = PROMOTION_MESSAGES.promoted(promoted.reference)
    } catch (caught) {
      const code = caught?.details?.code
      if (caught?.code === 'conflict' && REFUSAL_CODES.includes(code)) {
        state.value = 'refused'
        message.value = PROMOTION_MESSAGES[code]
      } else {
        state.value = 'failed'
        message.value = caught?.message ?? ''
      }
    }
    await Promise.all([promoted ? sendEmail(promoted.bookingId) : null, settle()])
  }

  return { state, message, lastPromotion, emailStates, promote, sendEmail }
}
