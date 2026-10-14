import { PLACES_SOURCE_URL } from '@/features/discovery/domain/postcodeCentroids.js'
import { isServiceGeo } from '@/features/discovery/domain/serviceSchema.js'
import { POSTCODE_PATTERN } from '@/shared/domain/catalogueValidation.js'
import { formatCalendarDate } from '@/shared/domain/formatDate.js'

/**
 * A service's address and map position as one value of the staff form, and the rules that turn an
 * address lookup into a stored position. The draft's `location` is
 * `{ address, suburb, postcode, showOnMap, geo, matchedFor }`: `geo` is the stored five-key
 * position (or null) and `matchedFor` the `locationKey` of the address it was found for, so a
 * position counts only while the address still reads the same, and a new address is never saved
 * with an old position. A position is `venue` only for a house-number or named-venue match inside
 * Victoria and in the typed postcode, with its OpenStreetMap object page as the source; anything
 * less is the `area` point of the typed suburb and postcode from the bundled Vicmap table, the
 * same rule the seed uses. Pure: the lookup itself is `useAddressLookup`.
 */

// Victoria's bounding box: a pin outside it is a typing or lookup error.
export const VICTORIA = Object.freeze({ south: -39.2, north: -33.9, west: 140.9, east: 150.0 })

export const isInsideVictoria = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= VICTORIA.south &&
  latitude <= VICTORIA.north &&
  longitude >= VICTORIA.west &&
  longitude <= VICTORIA.east

export const LOCATION_HELP =
  'The map position comes from looking up this address. The pin marks the exact place only when the lookup matches the house number or a named venue; otherwise it marks the centre of the postcode area. No position is ever typed in or made up.'
export const ADDRESS_LOOKUP_NOTICE =
  "To find the map position, the street address, suburb and postcode (and nothing else from this form) are sent to OpenStreetMap's Nominatim service."
export const ADDRESS_LOOKUP_ATTRIBUTION = 'Address lookup: OpenStreetMap contributors (Nominatim)'

const NOT_READY =
  'The map position is not ready for this address. Wait for the lookup, choose a place, or untick Show on map to save without one.'
const INCOMPLETE =
  'The map position is incomplete. Change the address so it is looked up again, or untick Show on map.'
const OUTSIDE_VICTORIA =
  'The map position is outside Victoria. Check the address, or untick Show on map.'
const UNTICK = 'or untick Show on map to save without a map position.'
const FAILURES = Object.freeze({
  offline: `You are offline, so the address cannot be looked up. Try again when you are connected, ${UNTICK}`,
  busy: `The address lookup is busy. Wait a moment and try again, ${UNTICK}`,
  unavailable: `The address lookup did not answer. Try again, ${UNTICK}`,
})

// Nominatim's rank 30 is one building or point: a house number or a named venue. Streets rank
// 26-27, suburbs and postcodes lower, and none of them is ever a venue.
const VENUE_RANK = 30
const OSM_TYPES = Object.freeze(['node', 'way', 'relation'])
const LOCALITY_KEYS = Object.freeze([
  'suburb',
  'town',
  'village',
  'hamlet',
  'city_district',
  'city',
])

const text = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')

/** "12 main street|clayton|3168": the address as words, so case and spacing never move a position. */
export const locationKey = ({ address, suburb, postcode }) =>
  [address, suburb, postcode].map((part) => text(part).toLocaleLowerCase('en-AU')).join('|')

/** A lookup needs a suburb and a four-digit postcode; the street address is optional. */
export const isLookupReady = (location) =>
  text(location.suburb) !== '' && POSTCODE_PATTERN.test(text(location.postcode))

/** True while the draft holds a position found for the address exactly as it now reads. */
export const isPositionCurrent = (location) =>
  Boolean(location.geo) && location.matchedFor === locationKey(location)

/**
 * The text sent to the lookup: the street address, suburb, state and postcode, nothing else from
 * the form. Empty without a street address, in which case nothing is sent.
 */
export function lookupQuery(location) {
  const address = text(location.address)
  if (address === '') return ''
  return `${address}, ${text(location.suburb)} VIC ${text(location.postcode)}`
}

/** A stored position copied with its five keys in one fixed order (drafts are compared as JSON). */
export const copyGeo = (geo) => ({
  latitude: geo.latitude,
  longitude: geo.longitude,
  precision: geo.precision,
  sourceUrl: geo.sourceUrl,
  checkedAt: geo.checkedAt,
})

/** "Clayton Library, 12 Main Street, Clayton 3168": the venue's name when it has one, then the street and the place. */
function candidateLabel(result) {
  const address = result.address ?? {}
  const street = [address.house_number, address.road].map(text).filter(Boolean).join(' ')
  const locality = LOCALITY_KEYS.map((key) => text(address[key])).find(Boolean) ?? ''
  const name = text(result.name)
  const venue = name !== '' && name !== street && name !== text(address.road) ? name : ''
  const place = [locality, text(address.postcode)].filter(Boolean).join(' ')
  return [venue, street, place].filter(Boolean).join(', ')
}

/**
 * The venue-level places of a Nominatim jsonv2 answer: rank 30 with a house number or a name,
 * inside Victoria, in the typed postcode, with an OpenStreetMap object to cite. One entry per
 * label (the server can return an address node and its building). Anything else, malformed input
 * included, is left out; an empty list means "no exact place".
 *
 * @returns {Array<{ id: string, label: string, latitude: number, longitude: number, sourceUrl: string }>}
 */
export function toCandidates(results, postcode) {
  if (!Array.isArray(results)) return []
  const wanted = text(postcode)
  const labels = new Set()
  const candidates = []
  for (const result of results) {
    const address = result?.address ?? {}
    const latitude = Number(result?.lat)
    const longitude = Number(result?.lon)
    const osmId = Number(result?.osm_id)
    const isVenue =
      Number(result?.place_rank) >= VENUE_RANK &&
      (text(address.house_number) !== '' || text(result?.name) !== '')
    if (
      !isVenue ||
      text(address.postcode) !== wanted ||
      !isInsideVictoria(latitude, longitude) ||
      !OSM_TYPES.includes(result.osm_type) ||
      !Number.isSafeInteger(osmId) ||
      osmId <= 0
    ) {
      continue
    }
    const label = candidateLabel(result)
    if (labels.has(label)) continue
    labels.add(label)
    candidates.push(
      Object.freeze({
        id: `${result.osm_type}/${osmId}`,
        label,
        latitude,
        longitude,
        sourceUrl: `https://www.openstreetmap.org/${result.osm_type}/${osmId}`,
      }),
    )
  }
  return candidates
}

/** A chosen place as a stored venue position, dated `day` (the Melbourne day it was taken). */
export const venueGeo = (candidate, day) => ({
  latitude: candidate.latitude,
  longitude: candidate.longitude,
  precision: 'venue',
  sourceUrl: candidate.sourceUrl,
  checkedAt: day,
})

/**
 * The table point for the typed suburb and postcode, kept only when it lies in Victoria and in
 * that postcode (a same-named suburb elsewhere is not this service's area); null otherwise.
 */
export function areaPointFor(point, postcode) {
  if (!point || !isInsideVictoria(point.latitude, point.longitude)) return null
  const wanted = text(postcode)
  const inPostcode =
    point.precision === 'postcode'
      ? point.label === wanted
      : String(point.label ?? '').endsWith(` ${wanted}`)
  return inPostcode ? point : null
}

/** An area point as a stored area position, sourced to the Vicmap places dataset, dated `day`. */
export const areaGeo = (point, day) => ({
  latitude: point.latitude,
  longitude: point.longitude,
  precision: 'area',
  sourceUrl: PLACES_SOURCE_URL,
  checkedAt: day,
})

/**
 * The save's check of the location: '' when the service is off the map or holds a valid position
 * found for its address inside Victoria; otherwise the message the form shows.
 */
export function locationProblem(location) {
  if (!location.showOnMap) return ''
  if (!isPositionCurrent(location)) return NOT_READY
  if (!isServiceGeo(location.geo)) return INCOMPLETE
  if (!isInsideVictoria(location.geo.latitude, location.geo.longitude)) return OUTSIDE_VICTORIA
  return ''
}

/** "12 Main Street, Clayton 3168; exact place on the map": one line for the conflict list. */
export function describeLocation(location) {
  const area = [text(location.suburb), text(location.postcode)].filter(Boolean).join(' ')
  const place = [text(location.address), area].filter(Boolean).join(', ') || '(no address)'
  let map = 'map position not found yet'
  if (!location.showOnMap) {
    map = 'not on the map'
  } else if (isPositionCurrent(location)) {
    map = location.geo.precision === 'venue' ? 'exact place on the map' : 'area on the map'
  }
  return `${place}; ${map}`
}

/**
 * The status line of the location group. A position that matches the address wins over any
 * lookup state; `note` says why an area was taken and `matchedLabel` names the place taken, both
 * for a lookup of this visit only (a position opened with the record is described by its date).
 */
export function locationStatusText({ location, phase, failure, note, matchedLabel }) {
  const postcode = text(location.postcode)
  if (!location.showOnMap) return 'Not shown on the map.'
  if (isPositionCurrent(location)) {
    const checked = formatCalendarDate(location.geo.checkedAt, { month: 'long' })
    if (location.geo.precision === 'venue') {
      return matchedLabel
        ? `Exact place found: ${matchedLabel}.`
        : `Exact place on the map (position checked ${checked}).`
    }
    const pin = `the map shows a hollow pin at the centre of the ${postcode} area`
    if (note === 'no-street') return `Area only: with no street address, ${pin}.`
    if (note === 'no-exact-match') {
      return `No exact place matched this street address, so ${pin}. Check the street address if that is wrong.`
    }
    if (note === 'area-chosen') {
      return `The map shows a hollow pin at the centre of the ${postcode} area.`
    }
    return `Area only: ${pin} (position checked ${checked}).`
  }
  if (phase === 'choose') {
    return `More than one place matches this address. Choose the right one, or use the ${postcode} area.`
  }
  if (phase === 'failed') {
    if (failure === 'not-found') {
      return `We could not place ${text(location.suburb)} ${postcode} in Victoria. Check the suburb and postcode, or untick Show on map.`
    }
    return FAILURES[failure] ?? FAILURES.unavailable
  }
  if (!isLookupReady(location)) {
    return 'Enter the suburb and a four-digit postcode to find the map position.'
  }
  return 'Finding the map position for this address…'
}
