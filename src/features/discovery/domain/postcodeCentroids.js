import { normalizeForSearch } from './textNormalization.js'

/**
 * The typed-origin lookup (spec 6.2): a suburb name, a postcode or both become a point from the
 * Vicmap places table (`./vicPlaces.json`, built once by `npm run seed -- --build-places`,
 * CC BY 4.0). The table is a lazy chunk, so `resolveTypedOrigin` is async; `resolveTypedOriginIn`
 * is the pure core the tests and the seed call with a table in hand (Node needs an import
 * attribute for JSON, so the seed reads the file itself and never calls `loadPlaces`).
 */

export const PLACES_SOURCE_URL =
  'https://discover.data.vic.gov.au/dataset/vicmap-features-locality-point'
export const PLACES_ATTRIBUTION = 'Places: Vicmap © State of Victoria, CC BY 4.0'

// The two lookup outcomes the person reads live beside the lookup they describe, so a component
// can import the copy without pulling in the origin composable's module-level state.

/** The message for typed text that names no place in the table. */
export function unknownPlaceCopy(text) {
  return `We don't have a location for '${text}'. Try a Victorian postcode, e.g. 3168`
}

/** The message for a lookup that could not run (the places chunk failed to load). */
export function placeLookupFailedCopy(text) {
  return `We couldn't look up '${text}'. Check your connection and try again.`
}

let tablePromise = null

/**
 * The places table, imported once; `{ attribution, generatedAt, source, localities, postcodes }`.
 * A failed import is forgotten, so the next lookup tries the chunk again instead of replaying a
 * dropped connection for the rest of the session.
 */
export function loadPlaces(importTable = () => import('./vicPlaces.json')) {
  tablePromise ??= importTable()
    .then((module) => module.default ?? module)
    .catch((error) => {
      tablePromise = null
      throw error
    })
  return tablePromise
}

/** VIC or Victoria as the state: the last word, before nothing but an optional postcode. */
const STATE_SUFFIX = /(?:^|[\s,]+)vic(?:toria)?(?=[\s,]*(?:\d{4})?[\s,]*$)/iu

/**
 * Splits "Clayton VIC 3168", "3168" or "clayton" into the name words (normalised) and the
 * postcode, the last four-digit group; commas are dropped as punctuation. VIC and Victoria are
 * dropped only as the state, never inside a name, because "Victoria Point" and "Victoria Valley"
 * are localities. Only the postcode's own characters leave the name, so "Unit 13168 Clayton 3168"
 * keeps "13168" whole.
 *
 * @returns {{ name: string, postcode: string | null }}
 */
export function parseTypedPlace(text) {
  const stripped = String(text ?? '').replace(STATE_SUFFIX, ' ')
  const groups = [...stripped.matchAll(/(?<!\d)(\d{4})(?!\d)/gu)]
  const last = groups.at(-1)
  const postcode = last?.[1] ?? null
  const name = normalizeForSearch(
    last === undefined
      ? stripped
      : `${stripped.slice(0, last.index)} ${stripped.slice(last.index + 4)}`,
  )
  return { name, postcode }
}

const rowPoint = (latitude, longitude, label, precision) => ({
  latitude,
  longitude,
  label,
  precision,
})

const byPostcode = (table, postcode) => {
  const row = table.postcodes.find((entry) => entry[0] === postcode)
  return row ? rowPoint(row[1], row[2], row[0], 'postcode') : null
}

/**
 * Pure lookup over a table: (1) a postcode alone resolves to its centroid; (2) a known name
 * resolves to the locality of that name inside the typed postcode; when the typed postcode is
 * known but holds no locality of that name ("Richmond 3550"), the postcode's centroid wins over a
 * same-named place elsewhere in Victoria; without a postcode, or with one the table does not know,
 * the first locality of that name in table order; (3) an unknown name with a known postcode falls
 * back to the postcode; (4) anything else is null. The suburb label carries the postcode when the
 * row has one.
 *
 * @returns {{ latitude: number, longitude: number, label: string, precision: 'postcode' | 'suburb' } | null}
 */
export function resolveTypedOriginIn(table, text) {
  const { name, postcode } = parseTypedPlace(text)
  if (name === '' && postcode === null) return null
  if (name === '') return byPostcode(table, postcode)
  const candidates = table.localities.filter((row) => normalizeForSearch(row[0]) === name)
  const typedArea = postcode === null ? null : byPostcode(table, postcode)
  const inside = postcode === null ? null : candidates.find((row) => row[1] === postcode)
  // A known postcode outranks a same-named locality elsewhere (a radius 150 km away is wrong).
  if (!inside && typedArea) return typedArea
  const chosen = inside ?? candidates[0] ?? null
  if (chosen === null) return null
  const [rowName, rowPostcode, latitude, longitude] = chosen
  const label = rowPostcode === null ? rowName : `${rowName} ${rowPostcode}`
  return rowPoint(latitude, longitude, label, 'suburb')
}

/** The spec's signature, over the lazily loaded table. */
export async function resolveTypedOrigin(text) {
  return resolveTypedOriginIn(await loadPlaces(), text)
}
