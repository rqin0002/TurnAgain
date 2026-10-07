import { db } from './lib/admin.js'

import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { requireCaller } from './lib/authorize.js'
import { attachmentMeta, buildBrevoPayload, sendMail, toBrevoAttachment } from './lib/brevo.js'
import {
  claimBookingAttempt,
  finishBookingAttempt,
  toBookingSendResult,
  toMillis,
} from './lib/emailSends.js'
import { BREVO_API_KEY, MAIL_FROM, isEmailDryRun } from './lib/params.js'
import { isDeliverableAddress } from './lib/recipients.js'
import { assertBoolean, assertEnum, assertId, requestData } from './lib/validate.js'
import {
  BOOKING_EMAIL_KINDS,
  bookingEmailHasIcs,
  buildBookingEmail,
} from './shared/bookingEmails.js'
import { bookingIcsFileName, buildBookingIcs } from './shared/ics.js'

/**
 * sendBookingEmail (spec 5.2, 5.5; decision M5-D6). Order: authenticate (spec 5.3) -> validate ->
 * read the booking and check the kind -> decide the dry run -> unless dry run, refuse an
 * undeliverable address with no record -> claim the attempt (create-only record; the claim's
 * transaction refuses a booking whose updatedAt moved since the read, and creates a resend only
 * after a failed or unknown attempt) -> unless dry run or already claimed, call Brevo and write the
 * result -> answer with the latest attempt.
 */

const CALLER_ROLES = ['member', 'staff', 'admin']
const STAFF_ROLES = ['staff', 'admin']

const iso = (value) => new Date(toMillis(value)).toISOString()

/** The stored booking as the pure builders take it: ISO instants, no itemDescription. */
const toEmailBooking = (id, stored) => ({
  id,
  reference: stored.reference,
  contactName: stored.contactName,
  activityTitle: stored.activityTitle,
  venueName: stored.venueName,
  address: stored.address,
  suburb: stored.suburb,
  postcode: stored.postcode,
  startsAt: iso(stored.startsAt),
  endsAt: iso(stored.endsAt),
})

const notYours = () =>
  new HttpsError('permission-denied', 'You do not have access to this booking.')

const notFound = () => new HttpsError('not-found', 'Booking not found.')

const precondition = (code, message) => new HttpsError('failed-precondition', message, { code })

/** Spec 5.5 "Authorisation of the kind", plus the promoted-booking refusal of M5-D6. */
function checkKind(kind, booking, caller) {
  if (kind === 'promoted') {
    if (!STAFF_ROLES.includes(caller.role)) throw notYours()
    if (booking.status !== 'confirmed' || booking.promotedAt == null) {
      throw precondition('kind-mismatch', 'This booking has not been promoted from the waitlist.')
    }
    return
  }
  // Ownership is the stored uid: a booking whose id only starts with the caller's uid (uids and
  // session ids may hold '_') answers exactly as an absent one.
  if (booking.uid !== caller.uid) throw notFound()
  if (booking.status !== kind) {
    throw precondition('kind-mismatch', 'This booking has changed since this page loaded.')
  }
  if (kind === 'confirmed' && booking.promotedAt != null) {
    throw precondition('promoted', 'Staff sent the email for this place when it was offered.')
  }
}

export async function handleSendBookingEmail(request) {
  const now = new Date()
  const caller = await requireCaller(request, { roles: CALLER_ROLES })
  const data = requestData(request)
  const bookingId = assertId(data.bookingId, 'bookingId')
  const kind = assertEnum(data.kind, BOOKING_EMAIL_KINDS, 'kind')
  const resend = assertBoolean(data.resend, 'resend', { optional: true })

  // A member asking promoted, or an owner kind for an id outside the caller's prefix, is refused
  // before the read, the same answer whether or not that booking exists; past the read, a stored
  // booking is the caller's only when its uid is (checkKind), and any other answers not-found like
  // an absent one, so no answer says whether someone else's booking exists.
  if (kind === 'promoted' && !STAFF_ROLES.includes(caller.role)) throw notYours()
  if (kind !== 'promoted' && !bookingId.startsWith(`${caller.uid}_`)) throw notYours()
  const snapshot = await db.collection('bookings').doc(bookingId).get()
  if (!snapshot.exists) throw notFound()
  const stored = snapshot.data()
  checkKind(kind, stored, caller)

  const dryRun = isEmailDryRun()
  if (!dryRun && !isDeliverableAddress(stored.email)) {
    throw precondition('undeliverable-address', "This account's email address can't receive mail.")
  }

  const booking = toEmailBooking(bookingId, stored)
  const email = buildBookingEmail({ kind, booking, activityTitle: stored.activityTitle })
  const files = bookingEmailHasIcs(kind)
    ? [
        {
          name: bookingIcsFileName(stored.reference),
          text: buildBookingIcs(booking, { stamp: now }),
        },
      ]
    : []
  const message = {
    from: MAIL_FROM.value(),
    to: [{ email: stored.email, name: stored.contactName }],
    subject: email.subject,
    textContent: email.text,
    htmlContent: email.html,
    attachment: files.map(toBrevoAttachment),
    tags: ['booking', kind],
  }
  // The dry run builds the same request body as a real send and stops before fetch (facts F2.6).
  buildBrevoPayload(message)

  const claim = await claimBookingAttempt(db, {
    bookingId,
    kind,
    updatedAtMs: toMillis(stored.updatedAt),
    resend,
    callerUid: caller.uid,
    to: stored.email,
    dryRun,
    attachments: files.map(attachmentMeta),
    now,
  })
  if (!claim.claimed) return toBookingSendResult(claim.record, claim.attempts, now)
  if (dryRun) {
    logger.info('sendBookingEmail: dry run', { kind, recipientCount: 1, subject: email.subject })
    return toBookingSendResult(claim.record, claim.attempts, now)
  }

  const sent = await sendMail({ apiKey: BREVO_API_KEY.value(), ...message })
  const result = {
    status: sent.outcome,
    providerMessageId: sent.providerMessageId,
    error: sent.error,
  }
  await finishBookingAttempt(db, claim.sendKey, result)
  if (sent.outcome !== 'accepted') {
    logger.warn('sendBookingEmail: provider outcome', {
      kind,
      attempt: claim.record.attempt,
      outcome: sent.outcome,
      code: sent.error?.code,
      cause: sent.error?.cause,
    })
  }
  const record = { ...claim.record, ...result }
  const attempts = claim.attempts.map((entry) =>
    entry.attempt === record.attempt ? record : entry,
  )
  return toBookingSendResult(record, attempts, now)
}

export const sendBookingEmail = onCall({ secrets: [BREVO_API_KEY] }, handleSendBookingEmail)
