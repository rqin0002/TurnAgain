import { RepositoryError, isAbortError, throwIfAborted } from '@/shared/data/RepositoryError.js'
import { requestSignal } from '@/shared/data/requestSignal.js'

import { VICTORIA } from '../domain/serviceLocation.js'

/**
 * Street-address search for the staff service form, from the OpenStreetMap Foundation's public
 * Nominatim server (no key, no account; called from the browser, which sends the site's origin as
 * the referer). Its usage policy allows at most one request a second for the whole application,
 * forbids search-as-you-type and asks for attribution and cached answers, so the form asks only
 * when typing pauses or a place field is left, a module-level gate refuses a second request inside
 * a second (`details.code: 'too-soon'` with `retryAfterMs`), a module-level memo (memory only,
 * never storage) answers a repeated query without a request, and every fetch has an 8 s timeout.
 * Only the query text the caller builds (street address, suburb, postcode) is sent.
 * Failures become `RepositoryError`: `invalid-data` for an empty query; `offline` only when the
 * fetch rejected while `navigator.onLine` was false; `unavailable` for a refusal (a 429 carries
 * `details.code: 'rate-limited'`), a failed fetch, a timeout or an answer that is not a list. The
 * caller's own abort is rethrown unchanged. The answer is the server's list as it came: the domain
 * (`toCandidates`) decides what counts as a match.
 */

export const ADDRESS_LOOKUP_HOST = 'https://nominatim.openstreetmap.org'
export const ADDRESS_LOOKUP_RATE_LIMIT_MS = 1000
export const ADDRESS_LOOKUP_TIMEOUT_MS = 8000

// Victoria's box as Nominatim's viewbox (west, north, east, south): it ranks places inside it
// first without excluding the rest, and the domain keeps only Victorian matches.
const VIEWBOX = `${VICTORIA.west},${VICTORIA.north},${VICTORIA.east},${VICTORIA.south}`
const NOT_A_LIST = 'The address lookup answered with something that is not a list of places.'

const memo = new Map()
let lastRequestAt = null

/** The search URL: five Australian places with their address parts, ranked towards Victoria. */
export function addressSearchUrl(query) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    countrycodes: 'au',
    addressdetails: '1',
    limit: '5',
    viewbox: VIEWBOX,
    q: query,
  })
  return `${ADDRESS_LOOKUP_HOST}/search?${params}`
}

const unavailable = (message, options = {}) => new RepositoryError('unavailable', message, options)

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * @param {string} query the street address, suburb, state and postcode as one line
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch, now?: () => number }} [options]
 * @returns {Promise<object[]>} the server's result list (empty when nothing matched)
 */
export async function searchAddress(query, { signal, fetchImpl = fetch, now = Date.now } = {}) {
  throwIfAborted(signal)
  const text = String(query ?? '').trim()
  if (text === '') {
    throw new RepositoryError('invalid-data', 'An address lookup needs an address.')
  }
  if (memo.has(text)) return memo.get(text)

  const at = now()
  if (lastRequestAt !== null && at - lastRequestAt < ADDRESS_LOOKUP_RATE_LIMIT_MS) {
    throw unavailable('Wait a second before looking up another address.', {
      details: {
        code: 'too-soon',
        retryAfterMs: ADDRESS_LOOKUP_RATE_LIMIT_MS - (at - lastRequestAt),
      },
    })
  }
  lastRequestAt = at

  const fetchSignal = requestSignal(signal, ADDRESS_LOOKUP_TIMEOUT_MS)
  let body
  try {
    let response
    try {
      response = await fetchImpl(addressSearchUrl(text), { signal: fetchSignal.signal })
    } catch (error) {
      if (isAbortError(error) && signal?.aborted) throw error
      if (error?.name === 'TimeoutError') {
        throw unavailable('The address lookup took too long to answer.', { cause: error })
      }
      throw isOffline()
        ? new RepositoryError('offline', undefined, { cause: error })
        : unavailable(undefined, { cause: error })
    }
    if (response.status === 429) {
      throw unavailable('The address lookup is busy.', { details: { code: 'rate-limited' } })
    }
    if (response.status !== 200) {
      throw unavailable(`The address lookup answered ${response.status}.`)
    }
    try {
      body = await response.json()
    } catch (error) {
      throw unavailable(NOT_A_LIST, { cause: error })
    }
  } finally {
    fetchSignal.dispose()
  }
  if (!Array.isArray(body)) throw unavailable(NOT_A_LIST)
  const results = Object.freeze(body)
  memo.set(text, results)
  return results
}

/** Empties the memo and the rate gate (tests). */
export function clearAddressLookupCache() {
  memo.clear()
  lastRequestAt = null
}
