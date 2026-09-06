function toStringList(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string')
  }

  return typeof value === 'string' ? [value] : []
}

function normalizeForSearch(value) {
  // Search-only canonicalization makes punctuation and diacritics comparable;
  // the original catalogue text remains untouched for display and attribution.
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

function matchesText(haystackParts, query) {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) {
    return true
  }

  const haystack = normalizeForSearch(haystackParts.join(' '))

  return normalizedQuery.split(' ').every((token) => {
    if (haystack.includes(token)) {
      return true
    }

    return token.endsWith('s') && token.length > 3 ? haystack.includes(token.slice(0, -1)) : false
  })
}

function getItemSearchText(service) {
  return [
    service?.name,
    ...toStringList(service?.acceptedItems),
    ...toStringList(service?.aliases),
  ].filter(Boolean)
}

function getLocationSearchText(service) {
  return [
    service?.address,
    service?.suburb,
    service?.postcode,
    ...toStringList(service?.searchAreas),
  ].filter(Boolean)
}

function getActions(service) {
  return toStringList(service?.actionTypes)
}

function getSelectedActions(criteria) {
  return toStringList(criteria?.actionTypes).map(normalizeForSearch).filter(Boolean)
}

function matchesSelectedActions(service, selectedActions) {
  if (selectedActions.length === 0) {
    return true
  }

  const serviceActions = new Set(getActions(service).map(normalizeForSearch))

  // Checkbox filters use OR semantics: matching any selected action is enough.
  return selectedActions.some((action) => serviceActions.has(action))
}

function compareByName(left, right) {
  return String(left?.name ?? '').localeCompare(String(right?.name ?? ''), 'en-AU', {
    sensitivity: 'base',
    numeric: true,
  })
}

function createComparator(sort) {
  if (sort === 'name-asc') {
    return compareByName
  }

  if (sort === 'name-desc') {
    return (left, right) => compareByName(right, left)
  }

  return () => 0
}

/**
 * Filters and stably sorts catalogue services against normalized search text.
 * The source array is never sorted or mutated: the returned array is new, record
 * references are preserved, and original indices break all comparator ties.
 *
 * @param {Array<Record<string, unknown>>} services Source catalogue records.
 * @param {{
 *   item?: string,
 *   location?: string,
 *   actionTypes?: string[] | string,
 *   sort?: string
 * }} [criteria={}] Search, action-filter, and sort criteria.
 * @returns {Array<Record<string, unknown>>} Matching services in stable display order.
 */
export function searchServices(services, criteria = {}) {
  if (!Array.isArray(services)) {
    return []
  }

  const selectedActions = getSelectedActions(criteria)
  const comparator = createComparator(criteria.sort)
  // Validation accepts VIC/Victoria labels; the catalogue need not repeat the
  // state on every Melbourne address for those same valid searches to match.
  const location = String(criteria.location ?? '').replace(/\bVIC(?:TORIA)?\b/giu, '')

  return services
    .filter(
      (service) =>
        matchesText(getItemSearchText(service), criteria.item) &&
        matchesText(getLocationSearchText(service), location) &&
        matchesSelectedActions(service, selectedActions),
    )
    .map((service, originalIndex) => ({ service, originalIndex }))
    .sort(
      (left, right) =>
        comparator(left.service, right.service) || left.originalIndex - right.originalIndex,
    )
    .map(({ service }) => service)
}

/**
 * Counts services by normalized action type. A service contributes at most once
 * to each action count, even when its source data repeats that action.
 *
 * @param {Array<Record<string, unknown>>} services Services to summarize.
 * @returns {Record<string, number>} Counts keyed by `all` and normalized actions.
 */
export function countServicesByAction(services) {
  if (!Array.isArray(services)) {
    return { all: 0 }
  }

  const counts = { all: services.length }

  services.forEach((service) => {
    const uniqueActions = new Set(getActions(service).map(normalizeForSearch).filter(Boolean))

    uniqueActions.forEach((action) => {
      counts[action] = (counts[action] ?? 0) + 1
    })
  })

  return counts
}
