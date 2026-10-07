import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore/lite'

import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import { RepositoryError, toRepositoryError } from '@/shared/data/RepositoryError.js'
import { isValidId, normalizeEmail } from '@/shared/domain/catalogueValidation.js'

import {
  SAVED_SERVICES_LIMIT,
  blankProfile,
  isStoredEmail,
  projectProfile,
} from '../domain/profileSchema.js'

/**
 * users/{uid} on Firestore Lite (spec 9.2, 9.4, 9.6; rules 4.4). Plain async functions; every
 * write runs inside `runTransaction` so `revision` is read and written as `current + 1` in one
 * round trip (the rules refuse anything else, L595) and `updatedAt` is always `serverTimestamp()`.
 * Every error is a RepositoryError; a denied call dispatches `turnagain:permission-denied` with
 * `detail.source = 'users'` so the auth store can tell its own denials from everyone else's (C4.2).
 */

const SOURCE = 'users'

const profileRef = (uid) => doc(firestoreLite, 'users', uid)

const notSignedIn = () => new RepositoryError('permission', 'Sign in to manage your account.')
const missing = () => new RepositoryError('not-found', 'Your account record could not be found.')
const malformed = () =>
  new RepositoryError('invalid-data', 'Your account record is not in the expected shape.', {
    details: { reason: 'stored' },
  })
const invalidService = () =>
  new RepositoryError('invalid-data', 'That service id is not valid.', {
    details: { reason: 'input' },
  })
const invalidEmail = () =>
  new RepositoryError('invalid-data', 'That email address is not valid.', {
    details: { reason: 'input' },
  })
const limitReached = () =>
  new RepositoryError('invalid-data', `You can save up to ${SAVED_SERVICES_LIMIT} services.`, {
    details: { code: 'limit' },
  })

const requireUid = (uid) => {
  if (!isValidId(uid)) {
    throw notSignedIn()
  }
}

// Checked before the transaction, so a bad address is the caller's input error and never reads
// as a malformed stored record once the written document fails its projection.
const requireEmail = (email) => {
  if (!isStoredEmail(normalizeEmail(email))) {
    throw invalidEmail()
  }
}

const requireServiceId = (serviceId) => {
  if (!isValidId(serviceId)) {
    throw invalidService()
  }
}

/**
 * The projection of a stored record, bound to the uid that was asked for: a document at
 * users/{A} whose `uid` field says B is malformed (Astra F4), never an identity to trust, so the
 * role it carries is never returned and the store never writes saved services under the wrong uid.
 */
const project = (data, expectedUid) => {
  const profile = projectProfile(data)
  if (profile === null || profile.uid !== expectedUid) {
    throw malformed()
  }
  return profile
}

// The rules read `resource.data.get('revision', 0)`; a legacy document counts from 0 (R15).
const currentRevision = (data) => (Number.isInteger(data.revision) ? data.revision : 0)

const savedIds = (data) => (Array.isArray(data.savedServiceIds) ? data.savedServiceIds : [])

/**
 * Read-modify-write of one profile. `buildUpdate(data)` returns the changed keys, or null when
 * nothing changes (then no write and no revision bump). The returned profile is the projection of
 * the merged document.
 */
const writeProfile = (uid, buildUpdate) =>
  runTransaction(firestoreLite, async (transaction) => {
    const ref = profileRef(uid)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) {
      throw missing()
    }
    const data = snapshot.data()
    // Bound to the requested uid before anything is built from the record (Astra F4).
    const current = project(data, uid)
    const update = buildUpdate(data)
    if (update === null) {
      return current
    }
    const next = { ...update, revision: currentRevision(data) + 1, updatedAt: serverTimestamp() }
    transaction.update(ref, next)
    return project({ ...data, ...next }, uid)
  })

const guarded = async (run) => {
  try {
    return await run()
  } catch (error) {
    throw toRepositoryError(error, { source: SOURCE })
  }
}

// Every export is `async` so an argument check rejects the promise instead of throwing at the call.

/** The caller's profile, or null when none exists yet. */
export async function fetchProfile(uid) {
  requireUid(uid)
  return guarded(async () => {
    const snapshot = await getDoc(profileRef(uid))
    return snapshot.exists() ? project(snapshot.data(), uid) : null
  })
}

/**
 * First verified sign-in (spec 9.1): role member, status active, revision 1, no saved services,
 * both timestamps `request.time`. Create-if-absent: a profile that already exists (another tab
 * won, or an admin provisioned it) is returned untouched and never replaced.
 */
export async function createProfile({ uid, email, displayName }) {
  requireUid(uid)
  requireEmail(email)
  const blank = blankProfile({ uid, email, displayName })
  return guarded(() =>
    runTransaction(firestoreLite, async (transaction) => {
      const ref = profileRef(uid)
      const current = await transaction.get(ref)
      if (current.exists()) {
        return project(current.data(), uid)
      }
      const timestamp = serverTimestamp()
      transaction.set(ref, { ...blank, createdAt: timestamp, updatedAt: timestamp })
      return project(blank, uid)
    }),
  )
}

/**
 * Legacy migration (L595, R9, R15): one owner write that adds `revision: (existing ?? 0) + 1`,
 * keeps an existing `savedServiceIds` or initialises it to `[]`, and syncs `email` to the token
 * email. `profile.email` is the Auth user's email, not the stored one.
 */
export async function upgradeProfile({ uid, email }) {
  requireUid(uid)
  requireEmail(email)
  return guarded(() =>
    writeProfile(uid, (data) => ({
      savedServiceIds: savedIds(data),
      email: normalizeEmail(email),
    })),
  )
}

/** The email-sync branch (spec 9.4): `email`, `revision`, `updatedAt` and nothing else. */
export async function syncEmail(uid, email) {
  requireUid(uid)
  requireEmail(email)
  return guarded(() => writeProfile(uid, () => ({ email: normalizeEmail(email) })))
}

/** Owner edit under the active-profile branch (spec 9.6); the rules bound the list at 100. */
export async function saveService(uid, serviceId) {
  requireUid(uid)
  requireServiceId(serviceId)
  return guarded(() =>
    writeProfile(uid, (data) => {
      const ids = savedIds(data)
      if (ids.includes(serviceId)) {
        return null
      }
      if (ids.length >= SAVED_SERVICES_LIMIT) {
        throw limitReached()
      }
      return { savedServiceIds: [...ids, serviceId] }
    }),
  )
}

export async function unsaveService(uid, serviceId) {
  requireUid(uid)
  requireServiceId(serviceId)
  return guarded(() =>
    writeProfile(uid, (data) => {
      const ids = savedIds(data)
      return ids.includes(serviceId)
        ? { savedServiceIds: ids.filter((id) => id !== serviceId) }
        : null
    }),
  )
}
