import { computed, onBeforeUnmount, onMounted, ref, toValue } from 'vue'

import { isBookingEmailEnabled, requestBookingEmail } from '../data/bookingRepository.js'
import {
  BOOKING_MESSAGES,
  EMAIL_REFUSAL_CODES,
  EMAIL_STATUS_COPY,
  describeEmailRefusal,
} from '../domain/bookingMessages.js'

const RESEND_INTERVAL_MS = 60_000
// Mirrors MAX_ATTEMPTS_PER_DAY of functions/lib/emailSends.js: the server enforces it, the
// client only uses it for feedback.
const ATTEMPTS_PER_DAY = 3

/**
 * Asks the sendBookingEmail function about one booking's email and holds what the booking page
 * shows about it. With `requestOnMount` it asks once when the page mounts; `request` and
 * `checkStatus` ask again without forcing a send, and `resend` asks for a new attempt. `status` is
 * 'idle' before any call, 'requesting' while one runs, then the function's answer ('sending',
 * 'accepted', 'failed', 'unknown' or 'dry-run'); 'refused' when the function named a reason
 * (`details.code`: `result` keeps the last answer and `refusal` its sentence), or 'error' for any
 * other failure, which never claims the email failed. The server enforces one resend a minute and
 * three attempts a Melbourne day; the countdown here is feedback only. A build without functions
 * never calls anything (CapabilityNotice explains instead).
 *
 * @param {{ bookingId: import('vue').MaybeRefOrGetter<string>, kind: import('vue').MaybeRefOrGetter<string>, requestOnMount?: boolean }} options
 */
export function useBookingEmail({ bookingId, kind, requestOnMount = false }) {
  const enabled = isBookingEmailEnabled()
  const status = ref('idle')
  const result = ref(null)
  const refusal = ref(null)
  const error = ref(null)
  const secondsLeft = ref(0)
  const exhausted = ref(false)

  let countdownTimer = null
  let exhaustedTimer = null
  let disposed = false

  const message = computed(() => {
    if (status.value === 'requesting') return BOOKING_MESSAGES.emailChecking
    if (refusal.value) return refusal.value.message
    if (error.value) return error.value.message ?? ''
    return EMAIL_STATUS_COPY[status.value] ?? ''
  })
  // Stays true while requesting: `call()` and AppButton's `busy` already refuse a second click,
  // and a natively disabled button would drop the focus it holds.
  const canResend = computed(() => enabled && !exhausted.value && secondsLeft.value === 0)

  const stopCountdown = () => {
    if (countdownTimer !== null) window.clearInterval(countdownTimer)
    countdownTimer = null
  }

  const startCountdown = (untilMs) => {
    stopCountdown()
    const tick = () => {
      secondsLeft.value = Math.max(0, Math.ceil((untilMs - Date.now()) / 1000))
      if (secondsLeft.value === 0) stopCountdown()
    }
    tick()
    if (secondsLeft.value > 0) countdownTimer = window.setInterval(tick, 1000)
  }

  const markExhausted = (retryAfterMs) => {
    exhausted.value = true
    stopCountdown()
    secondsLeft.value = 0
    if (retryAfterMs !== null) {
      if (exhaustedTimer !== null) window.clearTimeout(exhaustedTimer)
      exhaustedTimer = window.setTimeout(() => {
        exhausted.value = false
      }, retryAfterMs)
    }
  }

  const call = async ({ resend }) => {
    if (!enabled || status.value === 'requesting' || (resend && exhausted.value)) return
    status.value = 'requesting'
    try {
      const answer = await requestBookingEmail({
        bookingId: toValue(bookingId),
        kind: toValue(kind),
        resend,
      })
      if (disposed) return
      result.value = answer
      refusal.value = null
      error.value = null
      status.value = answer.status
      if (answer.attemptsToday >= ATTEMPTS_PER_DAY && answer.nextResendAt) {
        // The third resendable attempt of the day: its nextResendAt is the next Melbourne
        // midnight, so it reads as the same cap a refusal names rather than an hours-long countdown.
        const retryAfterMs = Math.max(0, Date.parse(answer.nextResendAt) - Date.now())
        refusal.value = describeEmailRefusal({
          details: { code: 'attempts-exhausted', retryAfterMs },
        })
        markExhausted(retryAfterMs)
      } else if (answer.nextResendAt) {
        startCountdown(Date.parse(answer.nextResendAt))
      } else if (resend) {
        startCountdown(Date.now() + RESEND_INTERVAL_MS)
      }
    } catch (caught) {
      if (disposed) return
      const described = describeEmailRefusal(caught)
      if (EMAIL_REFUSAL_CODES.includes(described.code)) {
        refusal.value = described
        error.value = null
        status.value = 'refused'
        if (described.untilTomorrow) {
          markExhausted(described.retryAfterMs)
        } else if (described.retryAfterMs !== null) {
          startCountdown(Date.now() + described.retryAfterMs)
        }
      } else {
        refusal.value = null
        error.value = caught
        status.value = 'error'
      }
    }
  }

  const request = () => call({ resend: false })
  const resend = () => call({ resend: true })

  onMounted(() => {
    if (requestOnMount && enabled) void request()
  })
  onBeforeUnmount(() => {
    disposed = true
    stopCountdown()
    if (exhaustedTimer !== null) window.clearTimeout(exhaustedTimer)
  })

  return {
    enabled,
    status,
    result,
    refusal,
    error,
    message,
    secondsLeft,
    canResend,
    exhausted,
    request,
    checkStatus: request,
    resend,
  }
}
