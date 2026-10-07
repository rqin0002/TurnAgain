import { callFunction } from '@/shared/data/callFunction.js'

/**
 * The staff side's two email callables, so nothing outside bookings/
 * imports bookings/data/. Both go through `callFunction`, which refuses with `unavailable`
 * `functions-off` when this build has no functions; the pages decide from
 * `isStaffFunctionsEnabled()` (staffCapabilities.js), never from that error.
 */

/**
 * "A place is now yours" for a promoted booking: the `sendBookingEmail` callable with
 * `kind: 'promoted'`. Without `resend` the call returns the latest attempt (or makes the first);
 * `resend: true` is Send again.
 *
 * @returns {Promise<{ status: string, attempt: number, sentAt: string | null, providerMessageId?: string, nextResendAt?: string, attemptsToday: number }>}
 */
export async function sendPromotionEmail(bookingId, { resend = false } = {}) {
  return callFunction('sendBookingEmail', {
    bookingId,
    kind: 'promoted',
    ...(resend ? { resend: true } : {}),
  })
}

/**
 * The participant email (`sendSessionEmail`): one operation per `operationId`;
 * a repeat with the same id and content re-sends only a `failed` sub-send, the same id with other
 * content is `conflict` `operation-mismatch`, and a selected booking that is no longer a
 * participant is `invalid-data` with `details.ids`.
 *
 * @param {{ operationId: string, sessionId: string, recipientBookingIds: string[], subject: string, body: string, copyToSender: boolean, attachParticipants: boolean }} input
 * @returns {Promise<{ operationId: string, status: string, recipientCount: number, results: { participants: object, copy: object | null } }>}
 */
export async function sendSessionEmail({
  operationId,
  sessionId,
  recipientBookingIds,
  subject,
  body,
  copyToSender,
  attachParticipants,
}) {
  return callFunction('sendSessionEmail', {
    operationId,
    sessionId,
    recipientBookingIds,
    subject,
    body,
    copyToSender,
    attachParticipants,
  })
}
