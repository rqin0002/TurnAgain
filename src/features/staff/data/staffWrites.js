import {
  Timestamp,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore/lite'

import { validateActivity } from '@/features/activities/domain/activitySchema.js'
import { deriveSessionStatus, validateSession } from '@/features/activities/domain/sessionSchema.js'
import { validateService } from '@/features/discovery/domain/serviceSchema.js'
import { RepositoryError, toRepositoryError } from '@/shared/data/RepositoryError.js'

import { COLLECTION_OF_KIND } from '../domain/staffRecords.js'

/**
 * The staff content writes, built on a Firestore Lite `db`
 * the caller passes, so the app hands in its singleton (staffRepository.js) and tests/api hands in
 * an emulator client signed in as staff, as bookingTransactions.js does. Every update carries
 * the content fields, `revision: loaded + 1` and `updatedAt`, never a counter; a create writes
 * `revision: 1` and both stamps; a new service writes its zero rating summary in the same batch.
 * Nothing is ever deleted. A refused write is classified by re-reading the record:
 * a stored revision that moved is a conflict, an invalid record is invalid-data, anything
 * else stays permission. Writes never take the identity signal: a sent write cannot be
 * recalled, so its result is never discarded.
 */

export const STAFF_CONFLICT_MESSAGE =
  'This record was changed in another window. Reload to see the latest version; your unsaved changes stay in the form.'
export const COUNTERS_MOVED_MESSAGE =
  'Bookings changed since you opened this session. Reload to see the latest counts; your unsaved changes stay in the form.'
export const CORRECTION_NOT_OPEN_MESSAGE =
  'This correction was already handled in another window, so the listing was not saved. Your changes stay in the form.'
export const DUPLICATE_ID_MESSAGE = 'A record with this id already exists.'
const INVALID_FIELDS_MESSAGE = 'Check the highlighted fields.'

export const SERVICE_CONTENT_KEYS = Object.freeze([
  'name',
  'actionTypes',
  'acceptedItems',
  'aliases',
  'summary',
  'address',
  'suburb',
  'postcode',
  'searchAreas',
  'status',
  'source',
  'geo',
  'itemCategories',
  'acceptanceConditions',
  'preparation',
  'access',
  'openingHours',
  'cost',
])
export const ACTIVITY_CONTENT_KEYS = Object.freeze([
  'title',
  'summary',
  'activityType',
  'suitableItems',
  'acceptedConditions',
  'excludedConditions',
  'costLabel',
  'whatToBring',
  'accessibilityLabel',
  'cancellationLabel',
  'providerName',
  'providerUrl',
  'sourceCheckedAt',
  'status',
])
export const SESSION_CONTENT_KEYS = Object.freeze([
  'activityId',
  'startsAt',
  'endsAt',
  'venueName',
  'address',
  'suburb',
  'postcode',
  'capacity',
  'registrationType',
  'registrationUrl',
  'sourceCheckedAt',
  'participantNotice',
])

export const ALLOWED_STATUS_CHANGES = Object.freeze({
  services: Object.freeze({ published: ['archived'], archived: ['published'] }),
  activities: Object.freeze({ published: ['archived'], archived: ['published'] }),
  sessions: Object.freeze({
    scheduled: ['cancelled', 'completed'],
    full: ['cancelled', 'completed'],
  }),
})

const CONTENT_KEYS = Object.freeze({
  services: SERVICE_CONTENT_KEYS,
  activities: ACTIVITY_CONTENT_KEYS,
  sessions: SESSION_CONTENT_KEYS,
})
const VALIDATORS = Object.freeze({
  services: validateService,
  activities: validateActivity,
  sessions: validateSession,
})

const toTimestamp = (iso) => Timestamp.fromDate(new Date(iso))
const isTurnAgain = (session) => session.registrationType === 'turnagain'

/** The kind's content fields of a record, with a session's instants as Lite Timestamps. */
const contentOf = (kind, record) => {
  const content = Object.fromEntries(CONTENT_KEYS[kind].map((key) => [key, record[key]]))
  if (kind === 'sessions') {
    content.startsAt = toTimestamp(record.startsAt)
    content.endsAt = toTimestamp(record.endsAt)
    if (!isTurnAgain(record)) content.capacity = null
  }
  return content
}

/**
 * A session update adds the notice key, as null, when the stored session lacks it. Once the key
 * exists only the email function and "Mark participants notified" set it, so an update never
 * sends it.
 */
const sessionUpdateExtras = (noticeFieldStored) =>
  noticeFieldStored ? {} : { cancellationNoticeAt: null }

const duplicateId = (cause) =>
  new RepositoryError('invalid-data', DUPLICATE_ID_MESSAGE, {
    details: { fields: { id: 'exists' } },
    cause,
  })

/** A session whose bookedCount or waitlistCount moved since the form loaded it. */
const countersMoved = (currentRevision, cause) =>
  new RepositoryError('conflict', COUNTERS_MOVED_MESSAGE, {
    details: { code: 'counters-moved', currentRevision },
    cause,
  })

const sessionCountersMoved = (stored, record) =>
  stored.bookedCount !== record.bookedCount || stored.waitlistCount !== record.waitlistCount

/** The record as the write would store it, for the client validators (Timestamps duck-typed). */
const asStored = (kind, record, { isNew }) => {
  const now = Timestamp.now()
  const stored = {
    id: record.id,
    ...contentOf(kind, record),
    revision: isNew ? 1 : record.revision + 1,
    createdAt: isNew || !record.createdAt ? now : toTimestamp(record.createdAt),
    updatedAt: now,
  }
  if (kind === 'sessions') {
    const counters = isNew
      ? {
          bookedCount: isTurnAgain(record) ? 0 : null,
          waitlistCount: isTurnAgain(record) ? 0 : null,
        }
      : { bookedCount: record.bookedCount, waitlistCount: record.waitlistCount }
    Object.assign(stored, counters, {
      status: isNew ? 'scheduled' : deriveSessionStatus({ ...record, ...counters }),
      cancellationNoticeAt: record.cancellationNoticeAt
        ? toTimestamp(record.cancellationNoticeAt)
        : null,
    })
  }
  return stored
}

/**
 * A refused write (`mapped.code === 'permission'`; toRepositoryError has already fired the
 * permission-denied event, which re-validates the profile) is re-read. A stored revision other
 * than the loaded one is a conflict; so are a session's counters moved by a booking since the load
 * (member writes leave the revision alone, so the status the form derived may be stale); a create
 * whose id now exists is a duplicate; a save bound to a correction (`correctionId`) that is no
 * longer open is `correction-not-open` (once another window has applied or dismissed it,
 * the rules refuse the whole batch); a record the client validators refuse is invalid-data with
 * the field reasons; anything else stays as mapped. A re-read that fails returns `mapped`.
 */
export async function classifyWriteError(
  db,
  kind,
  record,
  mapped,
  { isNew = false, correctionId = null } = {},
) {
  if (mapped?.code !== 'permission') {
    return mapped
  }
  let snapshot
  try {
    snapshot = await getDoc(doc(db, COLLECTION_OF_KIND[kind], record.id))
  } catch {
    return mapped
  }
  if (snapshot.exists()) {
    if (isNew) {
      return duplicateId(mapped)
    }
    const stored = snapshot.data()
    const currentRevision = stored.revision ?? 0
    if (currentRevision !== record.revision) {
      return new RepositoryError('conflict', STAFF_CONFLICT_MESSAGE, {
        details: { code: 'revision-moved', currentRevision },
        cause: mapped,
      })
    }
    if (kind === 'sessions' && sessionCountersMoved(stored, record)) {
      return countersMoved(currentRevision, mapped)
    }
  }
  if (correctionId) {
    let correction
    try {
      correction = await getDoc(doc(db, 'corrections', correctionId))
    } catch {
      return mapped
    }
    if (!correction.exists() || correction.data().status !== 'open') {
      return new RepositoryError('conflict', CORRECTION_NOT_OPEN_MESSAGE, {
        details: { code: 'correction-not-open' },
        cause: mapped,
      })
    }
  }
  const { isValid, errors } = VALIDATORS[kind](asStored(kind, record, { isNew }))
  if (!isValid) {
    return new RepositoryError('invalid-data', INVALID_FIELDS_MESSAGE, {
      details: { fields: errors },
      cause: mapped,
    })
  }
  return mapped
}

/** Commits a batch; every failure becomes a classified RepositoryError. */
const commit = async (db, kind, record, { isNew = false, correctionId = null } = {}, build) => {
  try {
    const batch = writeBatch(db)
    build(batch)
    await batch.commit()
  } catch (error) {
    throw await classifyWriteError(db, kind, record, toRepositoryError(error), {
      isNew,
      correctionId,
    })
  }
}

/**
 * Runs a Lite transaction (`run(transaction)` reads, then writes); a refusal of its commit is
 * classified like a batch's, and a RepositoryError `run` throws (a stale read) is the result as it
 * is, with nothing written.
 */
const transact = async (db, kind, record, { isNew = false } = {}, run) => {
  try {
    await runTransaction(db, run)
  } catch (error) {
    if (error instanceof RepositoryError) throw error
    throw await classifyWriteError(db, kind, record, toRepositoryError(error), { isNew })
  }
}

/** A create checks the id before the batch, so a collision is never "changed elsewhere". */
const assertNewId = async (db, kind, id) => {
  let snapshot
  try {
    snapshot = await getDoc(doc(db, COLLECTION_OF_KIND[kind], id))
  } catch (error) {
    throw toRepositoryError(error)
  }
  if (snapshot.exists()) {
    throw duplicateId()
  }
}

const createFields = () => ({
  revision: 1,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

/**
 * A service create (with the zero summary) or update; with `correctionId`, the same batch marks
 * that correction applied (the caller has checked it is open and about this
 * service). If another window handles the correction first, the rules refuse the whole batch and
 * the refusal reads conflict `correction-not-open`; the caller then saves without it.
 */
export async function writeService(
  db,
  record,
  { isNew = false, correctionId = null, resolvedBy = null } = {},
) {
  if (isNew) await assertNewId(db, 'services', record.id)
  const ref = doc(db, 'services', record.id)
  const revision = isNew ? 1 : record.revision + 1
  await commit(db, 'services', record, { isNew, correctionId }, (batch) => {
    if (isNew) {
      batch.set(ref, { id: record.id, ...contentOf('services', record), ...createFields() })
      batch.set(doc(db, 'services', record.id, 'aggregates', 'rating-summary'), {
        ratingCount: 0,
        ratingSum: 0,
        histogram: [0, 0, 0, 0, 0],
        updatedAt: serverTimestamp(),
      })
    } else {
      batch.update(ref, {
        id: record.id,
        ...contentOf('services', record),
        revision,
        updatedAt: serverTimestamp(),
      })
    }
    if (correctionId) {
      batch.update(doc(db, 'corrections', correctionId), {
        status: 'applied',
        resolutionNote: null,
        resolvedBy,
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
  })
  return { id: record.id, revision }
}

/** An activity create or update: one document (sessions carry no title). */
export async function writeActivity(db, record, { isNew = false } = {}) {
  if (isNew) await assertNewId(db, 'activities', record.id)
  const ref = doc(db, 'activities', record.id)
  const revision = isNew ? 1 : record.revision + 1
  await commit(db, 'activities', record, { isNew }, (batch) => {
    if (isNew) {
      batch.set(ref, { id: record.id, ...contentOf('activities', record), ...createFields() })
    } else {
      batch.update(ref, {
        id: record.id,
        ...contentOf('activities', record),
        revision,
        updatedAt: serverTimestamp(),
      })
    }
  })
  return { id: record.id, revision }
}

/**
 * A session create (scheduled, counters 0/0 or null/null, no notice yet) or content update. The
 * counters are never sent on an update; the status is re-derived from the loaded
 * counters and the new capacity while the session is open, and kept when cancelled or completed.
 * A member's booking moves the counters without the revision, so the
 * rules alone cannot tell that the loaded counters are stale: the update runs in a transaction
 * that reads the stored session first and refuses the edit as `counters-moved` when either
 * counter differs from the loaded one, before anything is written. The same read decides the
 * notice key: the email function stamps it without moving the revision, so the record the form
 * loaded can be out of date about it, and a null sent from that record would erase the notice.
 */
export async function writeSession(db, record, { isNew = false } = {}) {
  if (isNew) await assertNewId(db, 'sessions', record.id)
  const ref = doc(db, 'activitySessions', record.id)
  const revision = isNew ? 1 : record.revision + 1
  if (isNew) {
    await commit(db, 'sessions', record, { isNew }, (batch) => {
      const counter = isTurnAgain(record) ? 0 : null
      batch.set(ref, {
        id: record.id,
        ...contentOf('sessions', record),
        bookedCount: counter,
        waitlistCount: counter,
        status: 'scheduled',
        cancellationNoticeAt: null,
        ...createFields(),
      })
    })
  } else {
    await transact(db, 'sessions', record, { isNew }, async (transaction) => {
      const snapshot = await transaction.get(ref)
      const stored = snapshot.exists() ? snapshot.data() : {}
      if (snapshot.exists() && sessionCountersMoved(stored, record)) {
        throw countersMoved(stored.revision ?? 0)
      }
      transaction.update(ref, {
        id: record.id,
        ...contentOf('sessions', record),
        status: deriveSessionStatus({
          ...record,
          capacity: contentOf('sessions', record).capacity,
        }),
        ...sessionUpdateExtras(Object.hasOwn(stored, 'cancellationNoticeAt')),
        revision,
        updatedAt: serverTimestamp(),
      })
    })
  }
  return { id: record.id, revision }
}

const invalidTransition = () =>
  new RepositoryError('invalid-data', 'This change is not possible for this record.', {
    details: { code: 'invalid-transition' },
  })

/** "Mark participants notified": a cancelled session whose notice is unset. */
export async function writeParticipantsNotified(db, session) {
  if (session.status !== 'cancelled' || session.cancellationNoticeAt !== null) {
    throw invalidTransition()
  }
  const revision = session.revision + 1
  await commit(db, 'sessions', session, {}, (batch) => {
    batch.update(doc(db, 'activitySessions', session.id), {
      cancellationNoticeAt: serverTimestamp(),
      revision,
      updatedAt: serverTimestamp(),
    })
  })
  return { id: session.id, revision }
}

/**
 * Archive or restore a service or activity, cancel or complete a session. The
 * whole content goes with the status, so a legacy document that lacks optional keys meets the
 * rules' exact key list on its first status change. The loaded record's notice flag is safe here:
 * only an open session changes status, and the email function stamps the notice of a cancelled one.
 */
export async function writeRecordStatus(db, kind, record, status) {
  if (!(ALLOWED_STATUS_CHANGES[kind]?.[record.status] ?? []).includes(status)) {
    throw invalidTransition()
  }
  const revision = record.revision + 1
  await commit(db, kind, record, {}, (batch) => {
    batch.update(doc(db, COLLECTION_OF_KIND[kind], record.id), {
      id: record.id,
      ...contentOf(kind, record),
      status,
      ...(kind === 'sessions' ? sessionUpdateExtras(record.noticeFieldStored) : {}),
      revision,
      updatedAt: serverTimestamp(),
    })
  })
  return { id: record.id, revision }
}

/** The refusal copy of a triage that came too late. */
export const CORRECTION_HANDLED_MESSAGE = 'This correction was already handled.'

const CORRECTION_OUTCOMES = Object.freeze(['applied', 'dismissed'])

/**
 * Staff triage of one open correction (the rules accept an open correction only):
 * `status` applied or dismissed, an optional note, `resolvedBy` the signed-in uid and both
 * instants from the server, written as a one-update batch like every other staff write. The rules
 * refuse a correction that is no longer open; that refusal is re-read so it reads as "already
 * handled" (`conflict` `not-open`) rather than as lost access. The re-read runs after
 * `toRepositoryError`, which has already raised the permission-denied event, so a real downgrade
 * still re-validates the profile.
 *
 * @returns {Promise<{ id: string, status: 'applied' | 'dismissed' }>}
 */
export async function writeCorrectionResolution(
  db,
  correction,
  { status, resolutionNote = null, resolvedBy },
) {
  if (!CORRECTION_OUTCOMES.includes(status)) {
    throw new RepositoryError('invalid-data', undefined, {
      details: { code: 'invalid-transition' },
    })
  }
  const reference = doc(db, 'corrections', correction.id)
  const batch = writeBatch(db)
  batch.update(reference, {
    status,
    resolutionNote,
    resolvedBy,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  try {
    await batch.commit()
    return { id: correction.id, status }
  } catch (error) {
    const mapped = toRepositoryError(error)
    if (mapped.code !== 'permission') throw mapped
    let stored
    try {
      const snapshot = await getDoc(reference)
      stored = snapshot.exists() ? snapshot.data() : null
    } catch {
      throw mapped
    }
    if (stored !== null && stored.status !== 'open') {
      throw new RepositoryError('conflict', CORRECTION_HANDLED_MESSAGE, {
        details: { code: 'not-open' },
        cause: error,
      })
    }
    throw mapped
  }
}
