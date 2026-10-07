import { isCalendarDate, isHttpsUrl } from '@/shared/domain/catalogueValidation.js'

/**
 * Geo maths for the results pipeline: coordinate checks, the haversine distance, the
 * radius filter and the viewport filter. A `venue` geo is a published address; an `area` geo is
 * a postcode centroid, measured and plotted at that point but never routed to. A service
 * with `geo: null` is the only one counted as missing a map position.
 */

export const isCoordinate = (point) =>
  Boolean(
    point &&
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180,
  )

const hasGeoShape = (geo, precisions) =>
  isCoordinate(geo) &&
  Object.keys(geo).length === 5 &&
  precisions.includes(geo.precision) &&
  isHttpsUrl(geo.sourceUrl) &&
  isCalendarDate(geo.checkedAt)

/** Exactly the five geo keys with `precision: 'venue'`: a published address, routable. */
export function isVenueGeo(geo) {
  return hasGeoShape(geo, ['venue'])
}

/** The five geo keys with `precision` venue or area: measurable and plottable. */
export function isMappableGeo(geo) {
  return hasGeoShape(geo, ['venue', 'area'])
}

export function distanceKm(origin, point) {
  if (!isCoordinate(origin) || !isCoordinate(point)) return null
  const radians = (degrees) => (degrees * Math.PI) / 180
  const deltaLat = radians(point.latitude - origin.latitude)
  const deltaLng = radians(point.longitude - origin.longitude)
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(point.latitude)) *
      Math.sin(deltaLng / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, value))))
}

/**
 * The services within `radiusKm` of the origin, measured at the venue or the area centroid.
 * The pipeline never calls this with radius 0 ("Any distance" skips the filter).
 *
 * @returns {{ items: Array<{ service: object, distanceKm: number }>, missingLocationCount: number }}
 */
export function selectNearby(services, { origin, radiusKm = 10 }) {
  if (!isCoordinate(origin) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
    throw new RangeError('A valid origin and positive radius are required.')
  }
  let missingLocationCount = 0
  const items = []
  for (const service of services) {
    if (!isMappableGeo(service.geo)) {
      missingLocationCount += 1
      continue
    }
    const distance = distanceKm(origin, service.geo)
    if (distance <= radiusKm + 1e-9) items.push({ service, distanceKm: distance })
  }
  return { items, missingLocationCount }
}

const isBounds = (bounds) =>
  Boolean(bounds) &&
  ['south', 'west', 'north', 'east'].every((key) => Number.isFinite(bounds[key])) &&
  bounds.south <= bounds.north

/**
 * The services whose venue or area centroid lies inside plain `{ south, west, north, east }`
 * bounds (no antimeridian handling: Victoria), with the distance from the origin when one is
 * given.
 *
 * @returns {{ items: Array<{ service: object, distanceKm: number | null }>, missingLocationCount: number }}
 */
export function selectInBounds(services, { bounds, origin = null }) {
  if (!isBounds(bounds)) throw new RangeError('Finite bounds with south <= north are required.')
  let missingLocationCount = 0
  const items = []
  for (const service of services) {
    const geo = service.geo
    if (!isMappableGeo(geo)) {
      missingLocationCount += 1
      continue
    }
    const inside =
      geo.latitude >= bounds.south &&
      geo.latitude <= bounds.north &&
      geo.longitude >= bounds.west &&
      geo.longitude <= bounds.east
    if (inside) items.push({ service, distanceKm: origin ? distanceKm(origin, geo) : null })
  }
  return { items, missingLocationCount }
}
