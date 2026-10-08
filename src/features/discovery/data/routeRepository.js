import { RepositoryError, isAbortError, throwIfAborted } from '@/shared/data/RepositoryError.js'

import { isCoordinate } from '../domain/nearbyServices.js'

/**
 * Walking, cycling and driving routes for the trip panel of Service Detail, from the public OSRM
 * servers FOSSGIS runs at routing.openstreetmap.de (no key; called from the browser). Their usage
 * policy asks for at most one request a second and attribution, so a module-level gate refuses a
 * second request inside a second, a module-level memo (memory only, never storage) answers a
 * repeat without a request, and every fetch has an 8 s timeout.
 * Failures become `RepositoryError`: `invalid-data` for an unknown mode or a missing point,
 * `unavailable` for a refusal, a failed fetch, a timeout or an unreadable answer, and `offline`
 * only when the fetch rejected while `navigator.onLine` was false. The caller's own abort is
 * rethrown unchanged.
 */

export const ROUTE_HOST = 'https://routing.openstreetmap.de'
export const ROUTE_PROFILES = Object.freeze({ walking: 'foot', cycling: 'bike', driving: 'car' })
export const ROUTE_RATE_LIMIT_MS = 1000
export const ROUTE_TIMEOUT_MS = 8000

const memo = new Map()
let lastRequestAt = null

// One remembered route per travel mode, start point (rounded to 3 dp, as sent to the router) and
// destination coordinates, so a venue that moves gets a fresh route.
const memoKey = ({ origin, destination, mode }) =>
  `${mode}|${origin.latitude.toFixed(3)}|${origin.longitude.toFixed(3)}|${destination.latitude}|${destination.longitude}`

/**
 * The FOSSGIS request URL. The travel mode is chosen by the server name (routed-foot,
 * routed-bike, routed-car); `/route/v1/driving/` is the fixed OSRM path all three expect, whatever
 * the mode. Points are `longitude,latitude`; the origin is rounded to 3 dp before it leaves the
 * browser.
 */
export function routeUrl({ origin, destination, mode }) {
  const profile = ROUTE_PROFILES[mode]
  const from = `${origin.longitude.toFixed(3)},${origin.latitude.toFixed(3)}`
  const to = `${destination.longitude},${destination.latitude}`
  return `${ROUTE_HOST}/routed-${profile}/route/v1/driving/${from};${to}?overview=full&geometries=geojson`
}

const unavailable = (message, cause) =>
  new RepositoryError('unavailable', message, cause === undefined ? {} : { cause })

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

const isDistance = (value) => Number.isFinite(value) && value >= 0
/** A GeoJSON position, [longitude, latitude], inside the coordinate ranges. */
const isPosition = (position) =>
  Array.isArray(position) &&
  position.length >= 2 &&
  isCoordinate({ latitude: position[1], longitude: position[0] })
/** An Ok route the page can draw and describe: real distance and time, a line of 2+ points. */
const isUsableRoute = (route) =>
  isDistance(route.distance) &&
  isDistance(route.duration) &&
  route.geometry.coordinates.length >= 2 &&
  route.geometry.coordinates.every(isPosition)

/**
 * The fetch signal: the caller's abort plus the 8 s timeout, and a `dispose` for the fallback's
 * timer. Engines with `AbortSignal.any` and `AbortSignal.timeout` (Chrome 116, Firefox 124,
 * Safari 17.4) combine the two; older ones get one controller that a timer aborts with a
 * `TimeoutError` and the caller's signal forwards to, so the failure mapping is the same.
 */
function requestSignal(signal) {
  if (typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function') {
    const timeout = AbortSignal.timeout(ROUTE_TIMEOUT_MS)
    return { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, dispose: () => {} }
  }
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    ROUTE_TIMEOUT_MS,
  )
  const forward = () => controller.abort(signal.reason)
  signal?.addEventListener('abort', forward, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    },
  }
}

/**
 * @param {{ origin: { latitude: number, longitude: number }, destination: { latitude: number, longitude: number }, mode: 'walking' | 'cycling' | 'driving', serviceId?: string }} request
 *   `serviceId` is accepted and ignored: the route depends on the coordinates only.
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch, now?: () => number }} [options]
 * @returns {Promise<{ mode: string, distanceKm: number, durationMinutes: number, geometry: Array<[number, number]>, provider: 'fossgis' }>}
 */
export async function getRoute(
  { origin, destination, mode },
  { signal, fetchImpl = fetch, now = Date.now } = {},
) {
  throwIfAborted(signal)
  if (!ROUTE_PROFILES[mode]) {
    throw new RepositoryError('invalid-data', 'Routes exist for walking, cycling and driving only.')
  }
  if (!isCoordinate(origin) || !isCoordinate(destination)) {
    throw new RepositoryError('invalid-data', 'A route needs a start point and a venue.')
  }
  const key = memoKey({ origin, destination, mode })
  if (memo.has(key)) return memo.get(key)

  const at = now()
  if (lastRequestAt !== null && at - lastRequestAt < ROUTE_RATE_LIMIT_MS) {
    throw new RepositoryError('unavailable', 'Wait a second before requesting directions again.', {
      details: { code: 'rate-limited', retryAfterMs: ROUTE_RATE_LIMIT_MS - (at - lastRequestAt) },
    })
  }
  lastRequestAt = at

  const fetchSignal = requestSignal(signal)
  let body
  try {
    let response
    try {
      response = await fetchImpl(routeUrl({ origin, destination, mode }), {
        signal: fetchSignal.signal,
      })
    } catch (error) {
      if (isAbortError(error) && signal?.aborted) throw error
      if (error?.name === 'TimeoutError') {
        throw unavailable('The routing service took too long to answer.', error)
      }
      throw isOffline()
        ? new RepositoryError('offline', undefined, { cause: error })
        : unavailable(undefined, error)
    }
    if (response.status !== 200) {
      throw unavailable(`The routing service answered ${response.status}.`)
    }
    try {
      body = await response.json()
    } catch (error) {
      throw unavailable('The routing service answered with something that is not a route.', error)
    }
  } finally {
    fetchSignal.dispose()
  }
  const route = body?.routes?.[0]
  if (body?.code !== 'Ok' || !route || !Array.isArray(route.geometry?.coordinates)) {
    throw unavailable(`The routing service found no route (${body?.code ?? 'no code'}).`)
  }
  // Checked before anything is remembered, so a malformed answer falls back to the estimate and
  // the next request asks again.
  if (!isUsableRoute(route)) {
    throw unavailable('The routing service answered with something that is not a route.')
  }
  const result = Object.freeze({
    mode,
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    // GeoJSON is [lon, lat]; the polyline wants [lat, lng], swapped once here.
    geometry: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
    provider: 'fossgis',
  })
  memo.set(key, result)
  return result
}

/** Empties the memo and the rate gate (tests). */
export function clearRouteCache() {
  memo.clear()
  lastRequestAt = null
}
