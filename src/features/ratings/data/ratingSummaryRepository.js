import { doc, getDoc } from 'firebase/firestore/lite'

import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import { CACHE_KEYS, readCache, writeCache } from '@/shared/data/localCache.js'
import { throwIfAborted } from '@/shared/data/RepositoryError.js'

import { projectRatingSummary } from '../domain/rankServices.js'

/**
 * Reads the public rating summary of each service (services/{id}/aggregates/rating-summary) for
 * the pages that rank or chart services, and keeps two copies: five minutes in memory, and the
 * last known summaries in localStorage, which a page paints first while it reads again. A
 * summary that is missing or fails projectRatingSummary is a failure with a reason, never a zero.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CONCURRENT_READS = 4

/** id -> { at, summary }; public data, so a plain module cache is enough. */
const cache = new Map()
/** id -> number of local writes; a read that started before a write must not overwrite it. */
const writeVersions = new Map()

const writeVersion = (serviceId) => writeVersions.get(serviceId) ?? 0

const isPlainRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The persisted summaries by service id (`turnagain:v1:ratingSummaries`), or null.
 * A restored entry is a saved copy, not a fresh read: the composable shows it as
 * `freshness: 'cached'` with the stored `savedAt`, and it never enters the five-minute memory
 * cache above, so the next read for that id still goes to Firestore.
 */
export function readCachedRatingSummaries() {
  const hit = readCache(CACHE_KEYS.ratingSummaries)
  return hit && isPlainRecord(hit.value) ? hit : null
}

/**
 * Merges one round into the persisted copy: the ids read or saved in this round overlay the
 * stored map, the ids the server confirmed missing or invalid leave it, and every other stored
 * entry stays as it was. A round with nothing to add or remove (every read failed in transport,
 * or every id came from memory) leaves the stored value and its `savedAt` untouched, so a reload
 * followed by an offline round never shrinks the copy a later visit paints from.
 */
const persist = ({ updated = [], removed = [] }) => {
  if (updated.length === 0 && removed.length === 0) return
  const merged = { ...readCachedRatingSummaries()?.value }
  for (const serviceId of removed) delete merged[serviceId]
  for (const serviceId of updated) {
    const entry = cache.get(serviceId)
    if (entry) merged[serviceId] = entry.summary
  }
  writeCache(CACHE_KEYS.ratingSummaries, merged)
}

/** Clears one service's cached summary, or all of them (memory only; the persisted copy stays). */
export function clearRatingSummaryCache(serviceId) {
  if (serviceId === undefined) {
    cache.clear()
    writeVersions.clear()
  } else {
    cache.delete(serviceId)
  }
}

/**
 * Stores the summary a rating transaction just returned, so a list read straight after shows it
 * and the persisted copy is never older than memory. Both this and `fetchRatingSummaries`
 * default to `Date.now`; tests inject the same clock into both.
 */
export function storeRatingSummary(serviceId, summary, { now = Date.now } = {}) {
  writeVersions.set(serviceId, writeVersion(serviceId) + 1)
  cache.set(serviceId, { at: now(), summary })
  persist({ updated: [serviceId] })
}

// Firestore Lite cannot cancel a read once it is sent, so the cap of four reads in flight is
// shared by every fetchRatingSummaries call, including calls a newer one has superseded; a read
// still waiting in the queue is dropped when its signal aborts.
let activeReads = 0
const queue = []

const acquire = (signal) =>
  new Promise((resolve, reject) => {
    const abort = () => {
      const index = queue.indexOf(ticket)
      if (index !== -1) queue.splice(index, 1)
      reject(new DOMException('The request was aborted.', 'AbortError'))
    }
    const ticket = () => {
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) {
        abort()
        return
      }
      activeReads += 1
      resolve()
    }
    if (signal?.aborted) {
      abort()
      return
    }
    if (activeReads < MAX_CONCURRENT_READS) ticket()
    else {
      queue.push(ticket)
      signal?.addEventListener('abort', abort, { once: true })
    }
  })

const release = () => {
  activeReads -= 1
  while (activeReads < MAX_CONCURRENT_READS && queue.length) queue.shift()()
}

const readSummary = async (serviceId) => {
  const snapshot = await getDoc(
    doc(firestoreLite, 'services', serviceId, 'aggregates', 'rating-summary'),
  )
  return snapshot.exists() ? snapshot.data() : null
}

const CONFIRMED_GONE = new Set(['missing', 'invalid'])

/**
 * Public rating summaries for a list of services, individually read, at most four in flight,
 * cached for five minutes. A missing or malformed summary is a failure, never a zero, and
 * every failure says why: `missing` (the server answered that no summary exists), `invalid` (a
 * summary that does not project) or `transport` (the read itself failed: offline, unreachable,
 * unavailable). Only a transport failure leaves the persisted copy of that id alone; the other
 * two are the server's word and remove it from memory and from storage.
 *
 * @returns {Promise<{
 *   summariesById: Record<string, object>,
 *   failures: Array<{ id: string, reason: 'transport' | 'missing' | 'invalid' }>
 * }>}
 */
export async function fetchRatingSummaries(
  serviceIds,
  { signal, concurrency = MAX_CONCURRENT_READS, now = Date.now } = {},
) {
  const ids = [...new Set(serviceIds)].slice(0, 1000)
  const summariesById = {}
  /** id -> reason */
  const failures = new Map()
  const pending = []
  const updated = []
  for (const id of ids) {
    const hit = cache.get(id)
    if (hit && now() - hit.at < CACHE_TTL_MS) summariesById[id] = hit.summary
    else pending.push(id)
  }

  let cursor = 0
  const worker = async () => {
    while (cursor < pending.length) {
      throwIfAborted(signal)
      const id = pending[cursor++]
      try {
        const versionAtStart = writeVersion(id)
        await acquire(signal)
        let raw
        try {
          throwIfAborted(signal)
          raw = await readSummary(id)
        } finally {
          release()
        }
        throwIfAborted(signal)
        if (writeVersion(id) !== versionAtStart) {
          // A rating saved while this read was in flight is newer than the response: serve and
          // keep the stored summary, never the stale read. The read was superseded, not refused,
          // so the rare case with nothing stored reads as a transport failure.
          const stored = cache.get(id)
          if (stored) summariesById[id] = stored.summary
          else failures.set(id, 'transport')
          continue
        }
        const summary = raw === null ? null : projectRatingSummary(raw)
        if (summary === null) {
          // The server answered and there is no usable summary: forget any copy of it.
          cache.delete(id)
          failures.set(id, raw === null ? 'missing' : 'invalid')
        } else {
          summariesById[id] = summary
          cache.set(id, { at: now(), summary })
          updated.push(id)
        }
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        failures.set(id, 'transport')
      }
    }
  }

  throwIfAborted(signal)
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_READS, Math.max(1, concurrency), pending.length) },
      worker,
    ),
  )
  throwIfAborted(signal)
  persist({ updated, removed: ids.filter((id) => CONFIRMED_GONE.has(failures.get(id))) })
  return {
    summariesById,
    failures: ids.filter((id) => failures.has(id)).map((id) => ({ id, reason: failures.get(id) })),
  }
}
