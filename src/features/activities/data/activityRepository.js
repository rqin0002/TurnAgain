import { collection, query, where } from 'firebase/firestore/lite'

import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import { CACHE_KEYS, readCache, writeCache } from '@/shared/data/localCache.js'
import { throwIfAborted, toRepositoryError } from '@/shared/data/RepositoryError.js'
import { readAll } from '@/shared/data/readAll.js'

import { projectActivity } from '../domain/activitySchema.js'
import { PUBLIC_SESSION_STATUSES, projectSession } from '../domain/sessionSchema.js'

/**
 * Firestore reads for the public activity catalogue: fetchPublicActivityCatalogue (published
 * activities and their public-status sessions, read together), readCachedActivityCatalogue (the
 * saved copy) and clearActivityCache. Public reads share a five-minute module cache, and the last
 * successful read is saved under CACHE_KEYS.activities for the next visit's first paint. A
 * booking reads its session through bookingRepository; staff reads live in
 * staff/data/staffRepository.js and are never cached.
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
