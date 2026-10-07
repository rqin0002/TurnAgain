import { getDocs, limit, query, startAfter } from 'firebase/firestore/lite'

import { throwIfAborted } from './RepositoryError.js'

/**
 * Reads a collection completely up to a cap. Never changes the caller's ordering:
 * it runs `query(baseQuery, limit(pageSize))` and pages with `startAfter(lastSnapshot)`, which
 * the SDK resolves against the query's own orderBy fields plus the implicit `__name__`. So a
 * where()/`in` query pages on `__name__` with no composite index and a single `orderBy` keeps
 * its automatic single-field index. Stops early on a short page. Reads one document past `max`
 * as the probe, so `truncated` is exact when the collection holds exactly `max` documents.
 *
 * @returns {Promise<{ docs: import('firebase/firestore/lite').QueryDocumentSnapshot[], truncated: boolean }>}
 */
export async function readAll(baseQuery, { pageSize = 100, max = 1000, signal } = {}) {
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isInteger(max) ||
    max < 1 ||
    max > 1000
  ) {
    throw new RangeError('readAll: pageSize must be 1-100 and max 1-1000.')
  }

  const docs = []
  let cursor = null

  while (docs.length <= max) {
    throwIfAborted(signal)
    const size = Math.min(pageSize, max + 1 - docs.length)
    const page =
      cursor === null
        ? query(baseQuery, limit(size))
        : query(baseQuery, startAfter(cursor), limit(size))
    const snapshot = await getDocs(page)
    // A cancellation that lands while the page was in flight must not produce a result the
    // caller could cache.
    throwIfAborted(signal)
    docs.push(...snapshot.docs)
    if (snapshot.docs.length < size) {
      return { docs, truncated: false }
    }
    cursor = snapshot.docs[snapshot.docs.length - 1]
  }

  return { docs: docs.slice(0, max), truncated: true }
}
