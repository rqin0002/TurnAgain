import { getDocs, limit, query, startAfter } from 'firebase/firestore/lite'

import { throwIfAborted } from './RepositoryError.js'

/**
 * Reads the documents matched by `baseQuery` page by page and returns at most `max` of them,
 * in the query's own order: each page is `startAfter(previous page's last document)`, which
 * keeps the caller's orderBy (plus the implicit `__name__` tiebreak) instead of imposing one.
 * One document beyond `max` is requested only to learn whether more exist, so `truncated` is
 * true exactly when the query matches more than `max` documents. A caller that shows the result
 * must say it is incomplete when `truncated` is true.
 * If `signal` aborts before or after any page, it throws an AbortError instead of returning.
 * Throws RangeError unless 1 <= pageSize <= 100 and 1 <= max <= 1000.
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
