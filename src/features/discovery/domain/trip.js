import { isCoordinate } from './nearbyServices.js'
import { formatDistance } from './resultsCopy.js'

/**
 * Trip maths and links (spec 6.5, D1): a straight-line estimate at fixed speeds for walking,
 * cycling and driving (never for public transport), the Google Maps and PTV links, and the one
 * trip sentence. An `area` record gets none of this (the composable never asks); a route from
 * OSRM renders through `formatTrip({ kind: 'route' })`.
 */

export const TRIP_MODES = Object.freeze(['walking', 'cycling', 'transit', 'driving'])
export const TRIP_SPEEDS_KMH = Object.freeze({ walking: 5, cycling: 15, driving: 30 })
export const STREET_FACTOR = 1.3

const GOOGLE_MODES = Object.freeze({
  walking: 'walking',
  cycling: 'bicycling',
  transit: 'transit',
  driving: 'driving',
})

const point3 = (coordinate) =>
  `${coordinate.latitude.toFixed(3)},${coordinate.longitude.toFixed(3)}`

/**
 * Minutes at the mode's speed over the street-factored distance, at least 1; null minutes for
 * public transport (links only, D1).
 *
 * @returns {{ minutes: number | null, distanceKm: number }}
 */
export function estimateTrip(distanceKm, mode) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError('A finite, non-negative distance is required.')
  }
  if (!TRIP_MODES.includes(mode)) throw new RangeError(`Unknown travel mode: ${String(mode)}`)
  if (mode === 'transit') return { minutes: null, distanceKm }
  const minutes = Math.max(
    1,
    Math.round(((distanceKm * STREET_FACTOR) / TRIP_SPEEDS_KMH[mode]) * 60),
  )
  return { minutes, distanceKm }
}

/** The Google Maps directions link, with the origin at 3 dp when one exists. */
export function buildGoogleMapsUrl({ origin = null, destination, mode }) {
  if (!isCoordinate(destination)) return ''
  const url = new URL('https://www.google.com/maps/dir/')
  const parameters = new URLSearchParams({
    api: '1',
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: GOOGLE_MODES[mode] ?? 'walking',
  })
  if (isCoordinate(origin)) parameters.set('origin', point3(origin))
  url.search = parameters.toString()
  return url.href
}

/**
 * The PTV journey planner. PTV publishes no deep-link parameter, so the destination is accepted
 * for the spec's signature and unused; a non-coordinate yields no link.
 */
export function buildPtvUrl(destination) {
  return isCoordinate(destination) ? 'https://www.ptv.vic.gov.au/journey' : ''
}

const MODE_WORDS = Object.freeze({ walking: 'walking', cycling: 'cycling', driving: 'driving' })

/**
 * "About 24 min, 1.9 km walking. Estimated travel time based on the road network." for a route;
 * "About 30 min, 1.9 km straight line, estimate" for the fallback; nothing for transit or without
 * minutes (the links stand alone). OSRM reports fractional minutes, so the sentence rounds them
 * and never promises less than a minute.
 */
export function formatTrip({ kind, mode, distanceKm, minutes }) {
  if (mode === 'transit' || !Number.isFinite(minutes) || !Number.isFinite(distanceKm)) return ''
  const shown = Math.max(1, Math.round(minutes))
  const distance = formatDistance(distanceKm)
  if (kind === 'route') {
    return `About ${shown} min, ${distance} ${MODE_WORDS[mode] ?? mode}. Estimated travel time based on the road network.`
  }
  return `About ${shown} min, ${distance} straight line, estimate`
}

/**
 * The result card's distance and trip line (spec 6.4, Part 0 C22): the walking estimate, never a
 * route, "1.9 km · About 30 min walking, estimate"; nothing without a finite distance (an `area`
 * card renders `formatAreaLine` instead).
 */
export function formatCardTrip(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return ''
  const { minutes } = estimateTrip(distanceKm, 'walking')
  return `${formatDistance(distanceKm)} · About ${minutes} min walking, estimate`
}
