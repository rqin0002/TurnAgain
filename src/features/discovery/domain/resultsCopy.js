/**
 * The result strings, once: the match labels, the area line, the distance,
 * the one live-region sentence and the pin names. Pure; components render what these return.
 */

/** "Matches 'microwave'" for a direct match, "May take small appliances (based on category)" for a category match. */
export function formatMatchLabel(match) {
  if (match?.kind === 'direct') return `Matches '${match.matchedTerms.join("', '")}'`
  if (match?.kind === 'category') return `May take ${match.categoryLabel} (based on category)`
  return ''
}

/** The area line of an `area` record, never a distance or minutes. */
export function formatAreaLine(service) {
  const postcode = service?.postcode
  return postcode
    ? `In the ${postcode} area (exact venue not published)`
    : 'In the area (exact venue not published)'
}

export function formatDistance(distanceKm) {
  return Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : ''
}

const places = (count) => `${count} ${count === 1 ? 'place' : 'places'}`

/**
 * "12 places within 5 km of Clayton 3168; 8 match 'microwave', 4 may take small appliances".
 * With "Open now" on, the places whose hours could not be read stay in the list and the count
 * says so: "...; 2 with hours not checked".
 *
 * @param {{ count: number, scope: { kind: 'radius', radiusKm: number, originLabel: string } | { kind: 'viewport' } | { kind: 'all' }, item?: string, directCount?: number, categoryCount?: number, categoryLabel?: string, hoursUncheckedCount?: number, truncated?: boolean }} options
 */
export function formatResultsStatus({
  count,
  scope,
  item = '',
  directCount = 0,
  categoryCount = 0,
  categoryLabel = '',
  hoursUncheckedCount = 0,
  truncated = false,
}) {
  let where
  if (scope?.kind === 'radius') {
    where =
      scope.radiusKm > 0
        ? `within ${scope.radiusKm} km of ${scope.originLabel}`
        : `near ${scope.originLabel}`
  } else if (scope?.kind === 'viewport') {
    where = 'in view'
  } else {
    where = 'in the catalogue'
  }
  let sentence = `${places(count)} ${where}`
  if (item) {
    const clauses = [`${directCount} match '${item}'`]
    if (categoryLabel) clauses.push(`${categoryCount} may take ${categoryLabel}`)
    sentence += `; ${clauses.join(', ')}`
  }
  if (hoursUncheckedCount > 0) sentence += `; ${hoursUncheckedCount} with hours not checked`
  if (truncated) sentence += ', sorted within the first 1,000 loaded records'
  return sentence
}

/**
 * The message of the empty "Open now" list: no place in range is open by its published hours.
 * The places whose hours could not be read are still listed, and the sentence counts them.
 */
export function formatNoneOpenNow(uncheckedCount) {
  const first = 'No places open right now by their published hours.'
  if (uncheckedCount === 1) return `${first} 1 has hours that could not be checked.`
  if (uncheckedCount > 1) return `${first} ${uncheckedCount} have hours that could not be checked.`
  return first
}

/**
 * "3. Mernda Repair Cafe, 4.2 km"; "3. Mernda Repair Cafe, in the area" for an area record. A
 * pin with no list number (the Service Detail map, `index: null`) is named without one:
 * "Mernda Repair Cafe, 4.2 km".
 */
export function formatPinName({ index, name, distanceKm = null, area = false }) {
  const prefix = Number.isInteger(index) ? `${index}. ` : ''
  if (area) return `${prefix}${name}, in the area`
  const distance = formatDistance(distanceKm)
  return distance ? `${prefix}${name}, ${distance}` : `${prefix}${name}`
}
