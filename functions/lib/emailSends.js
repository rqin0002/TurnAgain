import { createHash } from 'node:crypto'

import { Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

import { melbourneDayKey, nextMelbourneMidnight } from '../shared/melbourneTime.js'

/**
 * The send records behind the two email functions, in the emailSends collection. The email
 * provider (Brevo) has no idempotency of its own, so a create-only document is the lock that
 * stops one email going out twice. Two kinds of record:
 * - a booking email attempt, id `<bookingId>:<kind>:<updatedAtMs>:<attempt>`; the attempts of one
 *   booking version and kind form a series (sendBookingEmail);
 * - a session broadcast, id = the client's operationId, with two sub-sends, `participants` and
 *   `copy` (sendSessionEmail).
 * Statuses: 'sending' (in flight; read as 'unknown' after 120 s), 'accepted' (the provider took
 * it), 'failed', 'unknown', 'dry-run' (nothing was sent), 'skipped' (a sub-send with no
 * deliverable address) and, for a broadcast whose sub-sends differ, 'partial'.
 * The pure helpers come first and are unit-tested; the four transaction helpers take the Admin
 * `db` as their first argument and are exercised against the emulator by tests/api.
 */

export const SENDING_STALE_MS = 120_000
export const RESEND_INTERVAL_MS = 60_000
export const MAX_ATTEMPTS_PER_DAY = 3

/** The two sub-sends of a session broadcast, in the order they are sent. */
export const SESSION_PARTS = Object.freeze(['participants', 'copy'])

const SENDS = 'emailSends'
const BOOKINGS = 'bookings'

/** The statuses after which a resend may create the next attempt (Resend is offered for these). */
const RESENDABLE = Object.freeze(['failed', 'unknown'])

export const bookingSeriesKey = ({ bookingId, kind, updatedAtMs }) =>
  `${bookingId}:${kind}:${updatedAtMs}`

export const bookingSendKey = ({ bookingId, kind, updatedAtMs, attempt }) =>
  `${bookingSeriesKey({ bookingId, kind, updatedAtMs })}:${attempt}`

/** Milliseconds for an Admin Timestamp, a Date, a finite number or an ISO string; else null. */
export function toMillis(value) {
  if (value === null || value === undefined) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

const isoOf = (value) => {
  const ms = toMillis(value)
  return ms === null ? null : new Date(ms).toISOString()
}

/**
 * The status a record reports at `now`: a `sending` record older than 120 seconds is `unknown`
 * (the provider may or may not have accepted it). Read-time only; nothing is written back.
 */
export function deriveStatus(record, now) {
  if (record.status !== 'sending') return record.status
  const createdAt = toMillis(record.createdAt)
  return createdAt === null || toMillis(now) - createdAt > SENDING_STALE_MS ? 'unknown' : 'sending'
}

/** The same rule for one sub-send of a broadcast, timed from that sub-send's `startedAt`. */
export function derivePartStatus(part, now) {
  if (part.status !== 'sending') return part.status
  const startedAt = toMillis(part.startedAt)
  return startedAt === null || toMillis(now) - startedAt > SENDING_STALE_MS ? 'unknown' : 'sending'
}

/** The attempt with the highest number, or null for an empty series. */
export function latestAttempt(attempts) {
  return attempts.reduce(
    (latest, record) => (latest === null || record.attempt > latest.attempt ? record : latest),
    null,
  )
}

/** Attempts created on the Melbourne calendar day of `now`. */
export function countAttemptsToday(attempts, now) {
  const today = melbourneDayKey(new Date(toMillis(now)))
  return attempts.filter((record) => {
    const createdAt = toMillis(record.createdAt)
    return createdAt !== null && melbourneDayKey(new Date(createdAt)) === today
  }).length
}

/**
 * Whether `resend: true` may create the next attempt. The daily cap is checked
 * first, so a person who has used three attempts today is told so at once rather than after a
 * further 60-second wait.
 */
export function decideResend({ attempts, now }) {
  const latest = latestAttempt(attempts)
  if (latest === null) return { ok: true, attempt: 1 }
  const nowMs = toMillis(now)
  if (countAttemptsToday(attempts, nowMs) >= MAX_ATTEMPTS_PER_DAY) {
    const midnight = nextMelbourneMidnight(new Date(nowMs)).getTime()
    return { ok: false, code: 'attempts-exhausted', retryAfterMs: midnight - nowMs }
  }
  const waitMs = toMillis(latest.createdAt) + RESEND_INTERVAL_MS - nowMs
  if (waitMs > 0) return { ok: false, code: 'resend-too-soon', retryAfterMs: waitMs }
  return { ok: true, attempt: latest.attempt + 1 }
}

/**
 * Whether a resend may follow `record` at `now`: only a `failed` or `unknown` attempt (a
 * `sending` attempt older than 120 s reads `unknown`). An `accepted` or `dry-run` attempt, or
 * one still in flight, has nothing to resend.
 */
export function isResendable(record, now) {
  return RESENDABLE.includes(deriveStatus(record, now))
}

/**
 * When a resend of `record` will next be accepted, by the same rule the claim enforces: after the
 * daily cap that is the next Melbourne midnight, so the client never counts down to a refusal;
 * otherwise 60 seconds after the series' latest attempt, which may be newer than `record`.
 */
function nextResendMillis(record, attempts, now) {
  const decision = decideResend({ attempts, now })
  if (!decision.ok) return toMillis(now) + decision.retryAfterMs
  return toMillis((latestAttempt(attempts) ?? record).createdAt) + RESEND_INTERVAL_MS
}

/** The callable's response: every key present, null where nothing applies. */
export function toBookingSendResult(record, attempts, now) {
  const status = deriveStatus(record, now)
  const createdAt = toMillis(record.createdAt)
  const retryable = isResendable(record, now)
  return {
    status,
    attempt: record.attempt,
    sentAt: isoOf(createdAt),
    providerMessageId: record.providerMessageId ?? null,
    nextResendAt: retryable ? isoOf(nextResendMillis(record, attempts, now)) : null,
    attemptsToday: countAttemptsToday(attempts, now),
  }
}

const isAlreadyExists = (error) =>
  error?.code === 6 ||
  error?.code === 'already-exists' ||
  /ALREADY_EXISTS/u.test(String(error?.message ?? ''))

const bookingChanged = () =>
  new HttpsError('failed-precondition', 'This booking has changed since this page loaded.', {
    code: 'kind-mismatch',
  })

function resendRefusal({ code, retryAfterMs }) {
  if (code === 'attempts-exhausted') {
    return new HttpsError(
      'resource-exhausted',
      'This email has been sent three times today; try again tomorrow.',
      { code, retryAfterMs },
    )
  }
  return new HttpsError('failed-precondition', 'Wait a minute before sending again.', {
    code,
    retryAfterMs,
  })
}

/**
 * Claims the next attempt of a booking email series in one Admin transaction (in order:
 * the send key, then the create-only record). The transaction re-reads the booking first: one
 * whose updatedAt moved since the caller's read (a cancel that committed in between) is refused
 * kind-mismatch, and a vanished one not-found. That covers changes up to the claim only; a
 * booking that changes after it, while the provider request is in flight, still gets this email.
 * A non-empty series is answered with its latest attempt and nothing is created when
 * `resend` is false, and also when the latest attempt is not `failed` or `unknown` (an accepted,
 * dry-run or in-flight email is never sent again). A racing first call whose create fails with
 * ALREADY_EXISTS is answered the same way (`claimed: false`), so two tabs never send twice.
 */
export async function claimBookingAttempt(
  db,
  { bookingId, kind, updatedAtMs, resend, callerUid, to, dryRun, attachments, now },
) {
  const nowMs = toMillis(now)
  const seriesKey = bookingSeriesKey({ bookingId, kind, updatedAtMs })
  const series = db.collection(SENDS).where('seriesKey', '==', seriesKey)
  const answerWithLatest = (attempts) => {
    const record = latestAttempt(attempts)
    const sendKey = bookingSendKey({ bookingId, kind, updatedAtMs, attempt: record.attempt })
    return { claimed: false, record, sendKey, attempts }
  }
  try {
    return await db.runTransaction(async (tx) => {
      const current = await tx.get(db.collection(BOOKINGS).doc(bookingId))
      if (!current.exists) throw new HttpsError('not-found', 'Booking not found.')
      if (toMillis(current.data().updatedAt) !== updatedAtMs) throw bookingChanged()
      const attempts = (await tx.get(series)).docs.map((doc) => doc.data())
      const latest = latestAttempt(attempts)
      if (latest !== null && (!resend || !isResendable(latest, nowMs))) {
        return answerWithLatest(attempts)
      }
      const decision = decideResend({ attempts, now: nowMs })
      if (!decision.ok) throw resendRefusal(decision)
      const sendKey = bookingSendKey({ bookingId, kind, updatedAtMs, attempt: decision.attempt })
      const createdAt = Timestamp.fromMillis(nowMs)
      const record = {
        type: 'booking',
        seriesKey,
        attempt: decision.attempt,
        callerUid,
        to,
        status: dryRun ? 'dry-run' : 'sending',
        providerMessageId: null,
        error: null,
        attachments,
        createdAt,
        finishedAt: dryRun ? createdAt : null,
      }
      tx.create(db.collection(SENDS).doc(sendKey), record)
      return { claimed: true, record, sendKey, attempts: [...attempts, record] }
    })
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
    const attempts = (await series.get()).docs.map((doc) => doc.data())
    // A create can only collide with a stored attempt, so an empty series means the error was
    // something else.
    if (attempts.length === 0) throw error
    return answerWithLatest(attempts)
  }
}

/** Writes the provider's answer onto a claimed attempt. */
export async function finishBookingAttempt(
  db,
  sendKey,
  { status, providerMessageId = null, error = null },
) {
  await db
    .collection(SENDS)
    .doc(sendKey)
    .update({ status, providerMessageId, error, finishedAt: Timestamp.now() })
}

/** SHA-256 hex of the broadcast content with the ids sorted, so a retry can prove it is the same send. */
export function sessionContentHash({
  sessionId,
  recipientBookingIds,
  subject,
  body,
  copyToSender,
  attachParticipants,
}) {
  const content = JSON.stringify({
    sessionId,
    recipientBookingIds: [...recipientBookingIds].sort(),
    subject,
    body,
    copyToSender,
    attachParticipants,
  })
  return createHash('sha256').update(content).digest('hex')
}

/**
 * The broadcast's one status: `dry-run` on a dry run; while a sub-send is in flight,
 * `sending`; the copy's status when the participants were skipped; the participants' status when
 * no copy was requested; the common status when both agree; `partial` when they differ. When
 * nobody could be sent anything (participants skipped and no copy, or both skipped) it is `failed`.
 */
export function aggregateSessionStatus({ participants, copy, dryRun }) {
  if (dryRun) return 'dry-run'
  const sent = participants.status
  if (copy === null) return sent === 'skipped' ? 'failed' : sent
  const copied = copy.status
  if (sent === 'sending' || copied === 'sending') return 'sending'
  if (sent === 'skipped') return copied === 'skipped' ? 'failed' : copied
  return sent === copied ? sent : 'partial'
}

const pendingPart = (startedAt) => ({
  status: 'sending',
  providerMessageId: null,
  error: null,
  startedAt,
  finishedAt: null,
})

const operationMismatch = () =>
  new HttpsError(
    'failed-precondition',
    'This email was already sent with different content or by someone else.',
    { code: 'operation-mismatch' },
  )

const notParticipants = (ids) =>
  new HttpsError('invalid-argument', 'Some selected people are not on this session.', {
    fields: { recipientBookingIds: 'not-participants' },
    ids,
  })

/**
 * Creates the broadcast record for a new `operationId`, or re-opens the `failed` sub-sends of an
 * existing one (only those are retried; `accepted`, `unknown`, `dry-run`, `skipped` and an
 * in-flight `sending` are left alone). `parts` lists the sub-sends this call now owns. The same id
 * with another caller or other content is `failed-precondition` `operation-mismatch`.
 * `strangers` are the selected booking ids that are no longer participants of the session. They
 * refuse (`invalid-argument` `not-participants`) only a claim that would send the participants
 * part, judged inside the transaction: a booking cancelled after the first call must not strand a
 * failed copy, nor turn a settled repeat into a refusal.
 */
export async function claimSessionOperation(
  db,
  {
    operationId,
    sessionId,
    callerUid,
    contentHash,
    recipientCount,
    copyRequested,
    dryRun,
    attachments,
    strangers = [],
    now,
  },
) {
  const ref = db.collection(SENDS).doc(operationId)
  const startedAt = Timestamp.fromMillis(toMillis(now))
  const claim = () =>
    db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref)
      if (!snapshot.exists) {
        if (strangers.length > 0) throw notParticipants(strangers)
        const record = {
          type: 'session',
          sessionId,
          callerUid,
          contentHash,
          status: dryRun ? 'dry-run' : 'sending',
          recipientCount,
          results: {
            participants: { ...pendingPart(startedAt), recipientCount: 0, skippedCount: 0 },
            copy: copyRequested ? pendingPart(startedAt) : null,
          },
          attachments,
          createdAt: startedAt,
          finishedAt: null,
        }
        tx.create(ref, record)
        return {
          created: true,
          record,
          parts: SESSION_PARTS.filter((part) => record.results[part]),
        }
      }
      const record = snapshot.data()
      if (
        record.type !== 'session' ||
        record.callerUid !== callerUid ||
        record.contentHash !== contentHash
      ) {
        throw operationMismatch()
      }
      const parts = SESSION_PARTS.filter((part) => record.results[part]?.status === 'failed')
      if (parts.includes('participants') && strangers.length > 0) throw notParticipants(strangers)
      if (parts.length === 0) return { created: false, record, parts }
      const results = { ...record.results }
      for (const part of parts) {
        results[part] = { ...results[part], ...pendingPart(startedAt) }
      }
      const status = aggregateSessionStatus({
        participants: results.participants,
        copy: results.copy,
        dryRun: record.status === 'dry-run',
      })
      tx.update(ref, { results, status, finishedAt: null })
      return { created: false, record: { ...record, results, status, finishedAt: null }, parts }
    })
  try {
    return await claim()
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
    return claim()
  }
}

/** Writes one sub-send's outcome and the recomputed aggregate; returns the updated record. */
export async function finishSessionPart(db, operationId, part, result) {
  const ref = db.collection(SENDS).doc(operationId)
  return db.runTransaction(async (tx) => {
    const record = (await tx.get(ref)).data()
    const finishedAt = Timestamp.now()
    const results = {
      ...record.results,
      [part]: { ...record.results[part], ...result, finishedAt },
    }
    const status = aggregateSessionStatus({
      participants: results.participants,
      copy: results.copy,
      dryRun: record.status === 'dry-run',
    })
    const done = SESSION_PARTS.every((name) => results[name]?.status !== 'sending')
    const update = { results, status, finishedAt: done ? finishedAt : null }
    tx.update(ref, update)
    return { ...record, ...update }
  })
}
