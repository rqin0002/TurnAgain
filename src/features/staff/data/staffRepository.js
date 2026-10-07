import { collection, doc, getCount, getDoc, orderBy, query, where } from 'firebase/firestore/lite'

import { projectBooking } from '@/features/bookings/domain/bookingValidation.js'
import { projectCorrection } from '@/features/discovery/domain/correctionValidation.js'
import { firebaseAuth } from '@/firebase/firebaseAuthClient.js'
import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import {
  RepositoryError,
  throwIfAborted,
  toRepositoryError,
} from '@/shared/data/RepositoryError.js'
import { callFunction } from '@/shared/data/callFunction.js'
import { readAll } from '@/shared/data/readAll.js'
import { ROLES, isValidId } from '@/shared/domain/catalogueValidation.js'

import {
  COLLECTION_OF_KIND,
  projectEmailLog,
  toStaffActivity,
  toStaffRecord,
  toStaffService,
  toStaffSession,
} from '../domain/staffRecords.js'

import {
  writeActivity,
  writeCorrectionResolution,
  writeParticipantsNotified,
  writeRecordStatus,
  writeService,
  writeSession,
} from './staffWrites.js'

/**
 * The staff side's Firestore access. Reads take the
 * caller's signal (the auth store's identitySignal) and never cache or persist anything
 * (staff data is memory-only per identity). Whole collections are read through `readAll`
 * (pages of 100 up to 1,000, `truncated` exact); a malformed document is skipped and counted,
 * never fatal. The staff read of a session's bookings lives here, so nothing
 * outside bookings/ imports bookings/data/. Every failure is a RepositoryError.
 */

const readProjected = async (baseQuery, projector, signal) => {
  try {
    throwIfAborted(signal)
    const { docs, truncated } = await readAll(baseQuery, { signal })
    const records = []
    let skippedCount = 0
    for (const snapshot of docs) {
      const record = projector(snapshot.id, snapshot.data())
      if (record === null) skippedCount += 1
      else records.push(record)
    }
    return { records, skippedCount, truncated }
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/** Every service in any status. */
export async function fetchStaffServices({ signal } = {}) {
  const { records, skippedCount, truncated } = await readProjected(
    query(collection(firestoreLite, 'services')),
    toStaffService,
    signal,
  )
  return { services: records, skippedCount, truncated }
}

/** Every activity in any status. */
export async function fetchStaffActivities({ signal } = {}) {
  const { records, skippedCount, truncated } = await readProjected(
    query(collection(firestoreLite, 'activities')),
    toStaffActivity,
    signal,
  )
  return { activities: records, skippedCount, truncated }
}

/** Every session in any status; the caller joins the activity title. */
export async function fetchStaffSessions({ signal } = {}) {
  const { records, skippedCount, truncated } = await readProjected(
    query(collection(firestoreLite, 'activitySessions')),
    toStaffSession,
    signal,
  )
  return { sessions: records, skippedCount, truncated }
}

/** The corrections queue, newest first. */
export async function listCorrections({ signal } = {}) {
  const { records, skippedCount, truncated } = await readProjected(
    query(collection(firestoreLite, 'corrections'), orderBy('createdAt', 'desc')),
    projectCorrection,
    signal,
  )
  return { corrections: records, skippedCount, truncated }
}

/** The participant email history, newest first (the session page filters by session). */
export async function listEmailLogs({ signal } = {}) {
  const { records, skippedCount, truncated } = await readProjected(
    query(collection(firestoreLite, 'emailLogs'), orderBy('sentAt', 'desc')),
    projectEmailLog,
    signal,
  )
  return { emailLogs: records, skippedCount, truncated }
}

/** Every booking of one session, all pages (participants, the CSV and the email). */
export async function listSessionBookings(sessionId, { signal } = {}) {
  if (!isValidId(sessionId)) {
    throw new RepositoryError('not-found')
  }
  const { records, skippedCount, truncated } = await readProjected(
    query(collection(firestoreLite, 'bookings'), where('sessionId', '==', sessionId)),
    projectBooking,
    signal,
  )
  return { bookings: records, skippedCount, truncated }
}

/** One staff record by kind and id (the form's Reload); not-found when absent or malformed. */
export async function fetchStaffRecord(kind, id, { signal } = {}) {
  if (!Object.hasOwn(COLLECTION_OF_KIND, kind) || !isValidId(id)) {
    throw new RepositoryError('not-found')
  }
  let record
  try {
    throwIfAborted(signal)
    const snapshot = await getDoc(doc(firestoreLite, COLLECTION_OF_KIND[kind], id))
    throwIfAborted(signal)
    record = snapshot.exists() ? toStaffRecord(kind, snapshot.id, snapshot.data()) : null
  } catch (error) {
    throw toRepositoryError(error)
  }
  if (record === null) {
    throw new RepositoryError('not-found')
  }
  return record
}

/**
 * Three Lite `getCount` queries, one per role; admin only under the rules
 * (`allow list: if isAdmin()`, no limit because a count query carries none).
 */
export async function countUsersByRole({ signal } = {}) {
  try {
    throwIfAborted(signal)
    const snapshots = await Promise.all(
      ROLES.map((role) =>
        getCount(query(collection(firestoreLite, 'users'), where('role', '==', role))),
      ),
    )
    throwIfAborted(signal)
    const [member, staff, admin] = snapshots.map((snapshot) => snapshot.data().count)
    return { member, staff, admin, total: member + staff + admin }
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/**
 * Staff content writes. The writers live in staffWrites.js on an injected
 * `db`; these wire the app's Lite client. A write never takes the identity signal. There is
 * no deleteRecord and no deleteCorrection.
 */
export function saveService(record, { isNew = false, correctionId = null } = {}) {
  return writeService(firestoreLite, record, {
    isNew,
    correctionId,
    resolvedBy: firebaseAuth.currentUser?.uid ?? null,
  })
}

export function saveActivity(record, { isNew = false } = {}) {
  return writeActivity(firestoreLite, record, { isNew })
}

export function saveSession(record, { isNew = false } = {}) {
  return writeSession(firestoreLite, record, { isNew })
}

export function markParticipantsNotified(session) {
  return writeParticipantsNotified(firestoreLite, session)
}

/** The loaded record, not its id: the write needs its revision. */
export function setRecordStatus(kind, record, status) {
  return writeRecordStatus(firestoreLite, kind, record, status)
}

/**
 * Mark applied or Dismiss on the corrections queue; `resolvedBy` is the signed-in uid,
 * which the rules compare with `request.auth.uid`. A write: never takes the identity signal.
 */
export async function resolveCorrection(correction, { status, resolutionNote = null }) {
  return writeCorrectionResolution(firestoreLite, correction, {
    status,
    resolutionNote,
    resolvedBy: firebaseAuth.currentUser?.uid ?? null,
  })
}

/**
 * Promote next: the staff callable that moves the earliest waitlisted booking of a
 * session into a free place. Refusals arrive as `conflict` with `details.code` (`session-not-open`,
 * `no-free-place`, `no-waitlist`, `counter-mismatch`, `live-admin-disabled`); a build without
 * functions is `unavailable` `functions-off`. A write: never takes the identity signal.
 *
 * @returns {Promise<{ bookingId: string, reference: string, bookedCount: number, waitlistCount: number }>}
 */
export async function promoteNextBooking(sessionId) {
  return callFunction('promoteNextBooking', { sessionId })
}
