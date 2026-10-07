import { documentId, getDocs, limit, query, where } from 'firebase/firestore/lite'

import { isValidId } from '@/shared/domain/catalogueValidation.js'

import { isAbortError, throwIfAborted } from './RepositoryError.js'

/**
 * Reads documents by id in `documentId() in` chunks with per-chunk tolerance:
 * a chunk whose read fails puts its ids in `failedIds` and the loop goes on, so one failed chunk
 * never hides the sessions the others returned. Ids are deduplicated and invalid ones dropped;
 * a document the projector refuses is skipped and counted; an id that is in neither `records`
 * nor `failedIds` does not exist or is not readable. An AbortError (or a signal aborted between
 * chunks) propagates, and so does an error without a string `code`: a programming fault (a
 * TypeError from building the query) must never hide as failed ids. Every chunk query carries
 * `limit(chunk.length)`, which the rules' bounded-list check needs.
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
