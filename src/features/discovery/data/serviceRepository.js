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

import { projectCatalogueMetadata, projectService } from '../domain/serviceSchema.js'

/**
 * Public catalogue reads (Q1, Q3). One module-level cache for five minutes, shared by the list
 * and the detail page so list -> detail -> Back is one read (spec 6.6). Plain exports, no factory.
 * A successful read is also persisted under CACHE_KEYS.services (the public projection of the
 * published services, spec 11) so the next visit can paint it before the fetch; the composable
 * decides when to show it.
 */

const CACHE_TTL_MS = 5 * 60 * 1000
let catalogueCache = null

export function clearServiceCache() {
  catalogueCache = null
}

/** The persisted copy of the last successful public read, or null (spec 11, cached paint). */
export function readCachedServiceCatalogue() {
  const hit = readCache(CACHE_KEYS.services)
  return hit && Array.isArray(hit.value?.services) ? hit : null
}

const cachedCatalogue = () =>
  catalogueCache && Date.now() - catalogueCache.at < CACHE_TTL_MS ? catalogueCache.value : null

const invalidCatalogue = () =>
  new RepositoryError('invalid-data', 'The service catalogue has an unexpected structure.')

/**
 * @returns {Promise<{ metadata: object, services: object[], skippedCount: number, truncated: boolean }>}
 */
export async function fetchServiceCatalogue({ signal, force = false } = {}) {
  const cached = force ? null : cachedCatalogue()
  if (cached) {
    return cached
  }
  try {
    throwIfAborted(signal)
    const metadataSnapshot = await getDoc(doc(firestoreLite, 'catalogues', 'current'))
    throwIfAborted(signal)
    const metadata = metadataSnapshot.exists()
      ? projectCatalogueMetadata(metadataSnapshot.data())
      : null
    if (metadata === null) {
      throw invalidCatalogue()
    }

    const published = query(
      collection(firestoreLite, 'services'),
      where('status', '==', 'published'),
    )
    const { docs, truncated } = await readAll(published, { signal })
    const services = []
    let skippedCount = 0
    for (const snapshot of docs) {
      const record = projectService(snapshot.id, snapshot.data())
      if (record === null) skippedCount += 1
      else services.push(record)
    }
    // Development only: a skipped document is a seed or schema fault the owner should see; the
    // public copy carries the count without the noise.
    if (import.meta.env.DEV && skippedCount > 0) {
      console.warn(`[turnagain] ${skippedCount} malformed services document(s) skipped`)
    }

    const value = { metadata, services, skippedCount, truncated }
    catalogueCache = { at: Date.now(), value }
    writeCache(CACHE_KEYS.services, value)
    return value
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/** One published service by id: the catalogue cache first, then `getDoc` (Q3). */
export async function fetchService(serviceId, { signal } = {}) {
  if (!isValidId(serviceId)) {
    throw new RepositoryError('not-found')
  }
  const cached = cachedCatalogue()?.services.find((service) => service.id === serviceId)
  if (cached) {
    return cached
  }
  try {
    throwIfAborted(signal)
    const snapshot = await getDoc(doc(firestoreLite, 'services', serviceId))
    throwIfAborted(signal)
    const record = snapshot.exists() ? projectService(snapshot.id, snapshot.data()) : null
    if (record === null || record.status !== 'published') {
      throw new RepositoryError('not-found')
    }
    return record
  } catch (error) {
    throw toRepositoryError(error)
  }
}
