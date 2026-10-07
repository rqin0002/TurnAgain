import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'

import { db } from './lib/admin.js'
import {
  isServiceId,
  pageServices,
  parseApiQuery,
  selectServices,
  toPublicService,
} from './lib/publicService.js'

/**
 * The public REST API: GET /services and GET /services/:id, published documents only,
 * public fields only. The SPA never calls it; it exists for other people's programs.
 */

const MEMO_TTL_MS = 5 * 60 * 1000
const READ_CAP = 1000
const READ_BATCH_SIZE = 100

/** One entry per instance: { at, promise }. The promise is shared by concurrent requests. */
let memo = null

export function clearApiCache() {
  memo = null
}

async function readPublishedServices() {
  const records = []
  let cursor = null
  while (records.length < READ_CAP) {
    let query = db
      .collection('services')
      .where('status', '==', 'published')
      .limit(Math.min(READ_BATCH_SIZE, READ_CAP - records.length))
    if (cursor) query = query.startAfter(cursor)
    const snapshot = await query.get()
    for (const doc of snapshot.docs) records.push(toPublicService(doc.id, doc.data()))
    if (snapshot.size < READ_BATCH_SIZE) break
    cursor = snapshot.docs[snapshot.docs.length - 1]
  }
  return records
}

/**
 * Only called when the list read hit READ_CAP. Below the cap the list holds every published
 * service, so a miss there is a 404 without spending a read; at the cap a published service past
 * it can only be found by id. The 404 is for malformed, missing or unpublished ids only.
 */
async function readPublishedService(id) {
  const snapshot = await db.collection('services').doc(id).get()
  if (!snapshot.exists || snapshot.get('status') !== 'published') return null
  return toPublicService(snapshot.id, snapshot.data())
}

/** Cached for five minutes per instance; a failed read is forgotten so the next request retries. */
function publishedServices() {
  const now = Date.now()
  if (memo && now - memo.at < MEMO_TTL_MS) return memo.promise
  const entry = { at: now, promise: null }
  entry.promise = readPublishedServices().catch((error) => {
    if (memo === entry) memo = null
    throw error
  })
  memo = entry
  return entry.promise
}

const send = (response, status, body, { cacheable = false } = {}) => {
  response.set('Cache-Control', cacheable ? 'public, max-age=300' : 'no-store')
  response.set('X-Content-Type-Options', 'nosniff')
  response.status(status).json(body)
}

const notFound = (response) => send(response, 404, { error: { code: 'not-found' } })

/** The handler, exported for the emulator tests; `api` below is what deploys. */
export async function handleApi(request, response) {
  if (request.method !== 'GET') {
    return send(response, 405, { error: { code: 'method-not-allowed' } })
  }

  const segments = request.path.split('/').filter(Boolean)
  if (segments[0] !== 'services' || segments.length > 2) {
    return notFound(response)
  }

  try {
    if (segments.length === 2) {
      const id = segments[1]
      if (!isServiceId(id)) return notFound(response)
      const records = await publishedServices()
      const record =
        records.find((entry) => entry.id === id) ??
        (records.length >= READ_CAP ? await readPublishedService(id) : null)
      return record
        ? send(response, 200, { data: record }, { cacheable: true })
        : notFound(response)
    }

    const parsed = parseApiQuery(request.query ?? {})
    if (!parsed.ok) {
      return send(response, 400, { error: { code: 'invalid-query', fields: parsed.fields } })
    }
    const selected = selectServices(await publishedServices(), parsed.value)
    return send(response, 200, pageServices(selected, parsed.value), { cacheable: true })
  } catch (error) {
    logger.error('api: request failed', error, { path: request.path, code: error?.code })
    return send(response, 500, { error: { code: 'internal' } })
  }
}

export const api = onRequest({ cors: true }, handleApi)
