import { FieldPath, Timestamp, db } from './lib/admin.js'

import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { requireCaller } from './lib/authorize.js'
import { attachmentMeta, buildBrevoPayload, sendMail, toBrevoAttachment } from './lib/brevo.js'
import {
  aggregateSessionStatus,
  claimSessionOperation,
  derivePartStatus,
  finishSessionPart,
  sessionContentHash,
  toMillis,
} from './lib/emailSends.js'
import { BREVO_API_KEY, MAIL_FROM, isEmailDryRun } from './lib/params.js'
import { isDeliverableAddress, splitDeliverable } from './lib/recipients.js'
import { assertId, assertUuid, invalidArgument, requestData } from './lib/validate.js'
import { escapeHtml } from './shared/bookingEmails.js'
import { toCsv } from './shared/csv.js'
import { validateSessionEmail } from './shared/emailValidation.js'
import { SESSION_ICS_FILE_NAME, buildSessionIcs } from './shared/ics.js'

/**
 * sendSessionEmail (spec 5.2, 5.5; Part 0 section 3.6): a staff member emails the selected
 * participants of one session, with an optional copy to themselves. The client's `operationId`
 * names the `emailSends` record; a repeat of the same operation re-sends only a `failed` sub-send.
 * Participants get one Brevo message-version each, so nobody sees another address.
 */

const STAFF_ROLES = ['staff', 'admin']
const PARTICIPANT_STATUSES = ['confirmed', 'waitlisted']
const PAGE_SIZE = 100

export const PARTICIPANT_COLUMNS = Object.freeze([
  { key: 'contactName', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
  { key: 'reference', label: 'Reference' },
])

const iso = (value) => {
  const ms = toMillis(value)
  return ms === null ? null : new Date(ms).toISOString()
}

/** Every booking of the session, all pages (spec 5.5: "all pages"). */
async function loadSessionBookings(sessionId) {
  const bookings = []
  let cursor = null
  for (;;) {
    let query = db
      .collection('bookings')
      .where('sessionId', '==', sessionId)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE)
    if (cursor) query = query.startAfter(cursor)
    const snapshot = await query.get()
    for (const doc of snapshot.docs) bookings.push({ id: doc.id, ...doc.data() })
    if (snapshot.size < PAGE_SIZE) return bookings
    cursor = snapshot.docs.at(-1)
  }
}

/**
 * Plain text as paragraphs: blank lines split them, single line breaks become <br>. A separator
 * line may hold spaces, which the person cannot see.
 */
const toHtml = (body) =>
  body
    .split(/\n\s*\n/u)
    .map((paragraph) => `<p>${paragraph.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('\n')

const byStatusThenName = (a, b) =>
  PARTICIPANT_STATUSES.indexOf(a.status) - PARTICIPANT_STATUSES.indexOf(b.status) ||
  a.contactName.localeCompare(b.contactName, 'en-AU')

/** The response shape of one sub-send (no `startedAt`; ISO `finishedAt`). */
function toPartResult(part, now, { withCounts }) {
  return {
    status: derivePartStatus(part, now),
    ...(withCounts ? { recipientCount: part.recipientCount, skippedCount: part.skippedCount } : {}),
    providerMessageId: part.providerMessageId ?? null,
    error: part.error ?? null,
    finishedAt: iso(part.finishedAt),
  }
}

export async function handleSendSessionEmail(request) {
  const now = new Date()
  const caller = await requireCaller(request, { roles: STAFF_ROLES })
  const data = requestData(request)
  const operationId = assertUuid(data.operationId, 'operationId')
  const sessionId = assertId(data.sessionId, 'sessionId')
  const validation = validateSessionEmail(data)
  if (!validation.isValid) throw invalidArgument(validation.errors)
  const input = validation.values

  const sessionSnapshot = await db.collection('activitySessions').doc(sessionId).get()
  if (!sessionSnapshot.exists) throw new HttpsError('not-found', 'Session not found.')
  const session = sessionSnapshot.data()
  const activitySnapshot = await db.collection('activities').doc(session.activityId).get()
  if (!activitySnapshot.exists) throw new HttpsError('not-found', 'Activity not found.')
  const activityTitle = activitySnapshot.get('title')

  const participants = (await loadSessionBookings(sessionId)).filter((booking) =>
    PARTICIPANT_STATUSES.includes(booking.status),
  )
  const byId = new Map(participants.map((booking) => [booking.id, booking]))
  // The claim refuses strangers only when it would send to the participants: a repeat whose
  // participants part is settled is answered from its record (a booking may be cancelled since).
  const strangers = input.recipientBookingIds.filter((id) => !byId.has(id))
  const selected = input.recipientBookingIds.filter((id) => byId.has(id)).map((id) => byId.get(id))

  const dryRun = isEmailDryRun()
  const { deliverable, skipped } = dryRun
    ? { deliverable: selected, skipped: [] }
    : splitDeliverable(selected, (booking) => booking.email)
  const ics = {
    name: SESSION_ICS_FILE_NAME,
    text: buildSessionIcs({
      sessionId,
      session: {
        status: session.status,
        venueName: session.venueName,
        address: session.address,
        suburb: session.suburb,
        postcode: session.postcode,
        startsAt: iso(session.startsAt),
        endsAt: iso(session.endsAt),
      },
      activityTitle,
      organizer: MAIL_FROM.value(),
      stamp: now,
    }),
  }
  const csv = input.attachParticipants
    ? {
        name: `participants-${sessionId}.csv`,
        text: toCsv([...participants].sort(byStatusThenName), PARTICIPANT_COLUMNS),
      }
    : null
  const message = {
    from: MAIL_FROM.value(),
    subject: input.subject,
    textContent: input.body,
    htmlContent: toHtml(input.body),
    tags: ['session'],
  }

  const claim = await claimSessionOperation(db, {
    operationId,
    sessionId,
    callerUid: caller.uid,
    contentHash: sessionContentHash({ sessionId, ...input }),
    recipientCount: selected.length,
    copyRequested: input.copyToSender,
    dryRun,
    attachments: [ics, ...(csv ? [csv] : [])].map(attachmentMeta),
    strangers,
    now,
  })

  const send = async (payload) => {
    if (dryRun) {
      buildBrevoPayload(payload)
      return { status: 'dry-run', providerMessageId: null, error: null }
    }
    const sent = await sendMail({ apiKey: BREVO_API_KEY.value(), ...payload })
    return { status: sent.outcome, providerMessageId: sent.providerMessageId, error: sent.error }
  }

  let record = claim.record
  for (const part of claim.parts) {
    let result
    if (part === 'participants') {
      const counts = { recipientCount: deliverable.length, skippedCount: skipped.length }
      result =
        deliverable.length === 0
          ? { status: 'skipped', providerMessageId: null, error: null, ...counts }
          : {
              ...(await send({
                ...message,
                messageVersions: deliverable.map((booking) => ({
                  to: [{ email: booking.email, name: booking.contactName }],
                })),
                attachment: [toBrevoAttachment(ics)],
              })),
              ...counts,
            }
    } else if (!dryRun && !isDeliverableAddress(caller.email)) {
      result = {
        status: 'skipped',
        providerMessageId: null,
        error: {
          code: 'undeliverable-address',
          message: "Your account's email address can't receive mail.",
        },
      }
    } else {
      const name = typeof caller.displayName === 'string' && caller.displayName !== ''
      result = await send({
        ...message,
        to: [{ email: caller.email, ...(name ? { name: caller.displayName } : {}) }],
        attachment: [ics, ...(csv ? [csv] : [])].map(toBrevoAttachment),
      })
    }
    if (result.status === 'failed' || result.status === 'unknown') {
      logger.warn('sendSessionEmail: provider outcome', {
        part,
        outcome: result.status,
        code: result.error?.code,
        cause: result.error?.cause,
      })
    }
    record = await finishSessionPart(db, operationId, part, result)
  }
  if (dryRun && claim.parts.length > 0) {
    logger.info('sendSessionEmail: dry run', {
      recipientCount: deliverable.length,
      copy: input.copyToSender,
      subject: input.subject,
    })
  }

  const results = record.results
  const status = aggregateSessionStatus({
    participants: { status: derivePartStatus(results.participants, now) },
    copy: results.copy ? { status: derivePartStatus(results.copy, now) } : null,
    dryRun: record.status === 'dry-run',
  })

  // The history row is written on every call that has a settled record, so a repeat whose first
  // call died before this write heals it; a repeat while the first call is still in flight leaves
  // the row to that call. `sentAt` is the operation's first send, never a retry's time.
  if (claim.parts.length > 0 || status !== 'sending') {
    await db.doc(`emailLogs/${operationId}`).set({
      sessionId,
      subject: input.subject,
      sentBy: caller.uid,
      recipientCount: record.recipientCount,
      copyToSender: input.copyToSender,
      attachParticipants: input.attachParticipants,
      operationId,
      status,
      sentAt: claim.record.createdAt,
    })
  }

  // The Overview item clears itself only when every participant was reached (spec 5.5, R11, R17).
  const selectedIds = new Set(input.recipientBookingIds)
  const everyoneSelected = participants.every((booking) => selectedIds.has(booking.id))
  if (
    session.status === 'cancelled' &&
    session.cancellationNoticeAt == null &&
    derivePartStatus(results.participants, now) === 'accepted' &&
    everyoneSelected &&
    results.participants.skippedCount === 0 &&
    results.participants.recipientCount === participants.length
  ) {
    await db
      .doc(`activitySessions/${sessionId}`)
      .update({ cancellationNoticeAt: Timestamp.fromDate(now) })
  }

  return {
    operationId,
    status,
    recipientCount: record.recipientCount,
    results: {
      participants: toPartResult(results.participants, now, { withCounts: true }),
      copy: results.copy ? toPartResult(results.copy, now, { withCounts: false }) : null,
    },
  }
}

export const sendSessionEmail = onCall({ secrets: [BREVO_API_KEY] }, handleSendSessionEmail)
