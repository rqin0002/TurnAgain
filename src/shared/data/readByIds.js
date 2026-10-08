import { documentId, getDocs, limit, query, where } from 'firebase/firestore/lite'

import { isValidId } from '@/shared/domain/catalogueValidation.js'

import { isAbortError, throwIfAborted } from './RepositoryError.js'

/**
 * Reads the documents whose ids are listed, in `documentId() in` queries of up to `chunkSize`
 * ids (30 by default and at most), and returns what it could read. Ids are deduplicated and
 * invalid ones dropped first. Each document goes through `project`: a record lands in `records`,
 * a refused one (null) only adds 1 to `skippedCount`. A chunk whose read fails puts its ids in
 * `failedIds` and the loop goes on, so one failed chunk never hides what the others returned.
 * An id found in neither list was missing, unreadable, or refused by `project` (counted, not
 * named). An AbortError (or a signal aborted between chunks) propagates, and so does an error
 * without a string `code` or one thrown by `project`: a programming fault must never hide as
 * failed ids. Every chunk query carries `limit(chunk.length)`, which the rules' bounded-list
 * check needs.
 *
 * @param {import('firebase/firestore/lite').CollectionReference} collectionReference
 * @param {unknown} ids
 * @param {{ project?: (id: string, data: object) => object | null, chunkSize?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ records: object[], skippedCount: number, failedIds: string[] }>}
 */
export async function readByIds(
  collectionReference,
  ids,
  { project = (id, data) => ({ id, ...data }), chunkSize = 30, signal } = {},
) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 30) {
    throw new RangeError('readByIds: chunkSize must be 1-30.')
  }
  const unique = [...new Set(Array.isArray(ids) ? ids : [])].filter(isValidId)
  const records = []
  const failedIds = []
  let skippedCount = 0

  for (let index = 0; index < unique.length; index += chunkSize) {
    throwIfAborted(signal)
    const chunk = unique.slice(index, index + chunkSize)
    let snapshot
    try {
      snapshot = await getDocs(
        query(collectionReference, where(documentId(), 'in', chunk), limit(chunk.length)),
      )
    } catch (error) {
      // A failed read is tolerated, not a fault in this code: an error without a Firestore code
      // is a programming error and propagates.
      if (isAbortError(error) || typeof error?.code !== 'string') {
        throw error
      }
      failedIds.push(...chunk)
      continue
    }
    throwIfAborted(signal)
    for (const document of snapshot.docs) {
      const record = project(document.id, document.data())
      if (record === null) {
        skippedCount += 1
      } else {
        records.push(record)
      }
    }
  }

  throwIfAborted(signal)
  return { records, skippedCount, failedIds }
}
