import { collection, doc, getDoc, query, where } from 'firebase/firestore/lite'

import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import { CACHE_KEYS, readCache, writeCache } from '@/shared/data/localCache.js'
import {
  RepositoryError,
  throwIfAborted,
  toRepositoryError,
} from '@/shared/data/RepositoryError.js'
import { readAll } from '@/shared/data/readAll.js'
import { isValidId } from '@/shared/domain/catalogueValidation.js'

import { projectActivity } from '../domain/activitySchema.js'
import { PUBLIC_SESSION_STATUSES, projectSession } from '../domain/sessionSchema.js'

/**
 * Firestore reads for the public activity catalogue. The app uses three exports:
 * fetchPublicActivityCatalogue (published activities and their public-status sessions, read
 * together), readCachedActivityCatalogue (the saved copy) and clearActivityCache. Public reads
 * share a five-minute module cache, and the last successful read is saved under
 * CACHE_KEYS.activities for the next visit's first paint. The readers fetchPublicSessions (all
 * public-status sessions), fetchActivity and fetchSession (by id) have no caller in src/; a
 * booking reads its session through bookingRepository. Staff reads live in staff/data/staffRepository.js and are never cached.
 * Malformed documents are skipped and counted, never fatal.
 */

const CACHE_TTL_MS = 5 * 60 * 1000
let publicCache = null

export function clearActivityCache() {
  publicCache = null
}

/** The persisted copy of the last successful public read, or null (the cached paint). */
export function readCachedActivityCatalogue() {
  const hit = readCache(CACHE_KEYS.activities)
  return hit && Array.isArray(hit.value?.activities) && Array.isArray(hit.value?.sessions)
    ? hit
    : null
}

const cachedPublic = () =>
  publicCache && Date.now() - publicCache.at < CACHE_TTL_MS ? publicCache.value : null

const projectAll = (docs, projector, collectionName) => {
  const records = []
  let skippedCount = 0
  for (const snapshot of docs) {
    const record = projector(snapshot.id, snapshot.data())
    if (record === null) skippedCount += 1
    else records.push(record)
  }
  // Development only: a skipped document is a seed or schema fault the owner should see; the
  // public copy carries the count without the noise.
  if (import.meta.env.DEV && skippedCount > 0) {
    console.warn(`[turnagain] ${skippedCount} malformed ${collectionName} document(s) skipped`)
  }
  return { records, skippedCount }
}

const publishedActivities = () =>
  query(collection(firestoreLite, 'activities'), where('status', '==', 'published'))

const publicSessions = () =>
  query(
    collection(firestoreLite, 'activitySessions'),
    where('status', 'in', [...PUBLIC_SESSION_STATUSES]),
  )

const readCatalogue = async ({ activitiesQuery, sessionsQuery, signal }) => {
  throwIfAborted(signal)
  const [activityRead, sessionRead] = await Promise.all([
    readAll(activitiesQuery, { signal }),
    readAll(sessionsQuery, { signal }),
  ])
  throwIfAborted(signal)
  const activities = projectAll(activityRead.docs, projectActivity, 'activities')
  const sessions = projectAll(sessionRead.docs, projectSession, 'activitySessions')
  return {
    activities: activities.records,
    sessions: sessions.records,
    skippedCount: activities.skippedCount + sessions.skippedCount,
    truncated: activityRead.truncated || sessionRead.truncated,
  }
}

/** Published activities and their public sessions. */
export async function fetchPublicActivityCatalogue({ signal, force = false } = {}) {
  const cached = force ? null : cachedPublic()
  if (cached) {
    return cached
  }
  try {
    const value = await readCatalogue({
      activitiesQuery: publishedActivities(),
      sessionsQuery: publicSessions(),
      signal,
    })
    publicCache = { at: Date.now(), value }
    writeCache(CACHE_KEYS.activities, value)
    return value
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/**
 * Every public-status session. No caller in src/: the Activities calendar is built from
 * fetchPublicActivityCatalogue.
 */
export async function fetchPublicSessions({ signal } = {}) {
  try {
    throwIfAborted(signal)
    const { docs, truncated } = await readAll(publicSessions(), { signal })
    const { records, skippedCount } = projectAll(docs, projectSession, 'activitySessions')
    return { sessions: records, skippedCount, truncated }
  } catch (error) {
    throw toRepositoryError(error)
  }
}

const readOne = async (path, projector, { signal, accept = () => true }) => {
  throwIfAborted(signal)
  const snapshot = await getDoc(path)
  throwIfAborted(signal)
  const record = snapshot.exists() ? projector(snapshot.id, snapshot.data()) : null
  if (record === null || !accept(record)) {
    throw new RepositoryError('not-found')
  }
  return record
}

/** One published activity, from the cache when the catalogue was read recently. */
export async function fetchActivity(activityId, { signal } = {}) {
  if (!isValidId(activityId)) {
    throw new RepositoryError('not-found')
  }
  const cached = cachedPublic()?.activities.find((activity) => activity.id === activityId)
  if (cached) {
    return cached
  }
  try {
    return await readOne(doc(firestoreLite, 'activities', activityId), projectActivity, {
      signal,
      accept: (record) => record.status === 'published',
    })
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/** One session by id in any status the rules allow the caller to read. */
export async function fetchSession(sessionId, { signal } = {}) {
  if (!isValidId(sessionId)) {
    throw new RepositoryError('not-found')
  }
  try {
    return await readOne(doc(firestoreLite, 'activitySessions', sessionId), projectSession, {
      signal,
    })
  } catch (error) {
    throw toRepositoryError(error)
  }
}
