import { compareByName } from '@/shared/domain/tableQuery.js'

import { matchService, resolveItemQuery } from './itemCategories.js'
import { normalizeForSearch } from './textNormalization.js'

/**
 * The catalogue search: item-aware matching through `itemCategories.js`, the action
 * chips as an OR filter, and a stable name sort. No location criterion: a typed place becomes an
 * origin with a radius, never a text filter. `nearest` and `highest-rated` are applied
 * by the results composable on top of the name order.
 */

const toStringList = (value) => {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string')
  return typeof value === 'string' ? [value] : []
}

const getActions = (service) =>
  toStringList(service?.actionTypes).map(normalizeForSearch).filter(Boolean)

const matchesSelectedActions = (service, selectedActions) => {
  if (selectedActions.length === 0) return true
  const serviceActions = new Set(getActions(service))
  // Chips use OR semantics: matching any selected action is enough.
  return selectedActions.some((action) => serviceActions.has(action))
}

const createComparator = (sort) =>
  sort === 'name-desc' ? (left, right) => compareByName(right, left) : compareByName

/**
 * Filters and stably sorts catalogue services. The source array is never mutated: the returned
 * array is new, record references are preserved, and ties break by name, then id, then the
 * source index.
 *
 * @param {Array<Record<string, unknown>>} services
 * @param {{ item?: string, actionTypes?: string[] | string, sort?: string }} [criteria={}]
 * @returns {Array<Record<string, unknown>>}
 */
export function searchServices(services, { item = '', actionTypes = [], sort = 'name-asc' } = {}) {
  if (!Array.isArray(services)) return []
  const resolved = resolveItemQuery(item)
  const selectedActions = toStringList(actionTypes).map(normalizeForSearch).filter(Boolean)
  const comparator = createComparator(sort)
  return services
    .map((service, sourceIndex) => ({ service, sourceIndex }))
    .filter(
      ({ service }) =>
        (resolved.itemTokens.length === 0 || matchService(service, resolved).kind !== null) &&
        matchesSelectedActions(service, selectedActions),
    )
    .sort(
      (left, right) =>
        comparator(left.service, right.service) ||
        String(left.service.id ?? '').localeCompare(String(right.service.id ?? '')) ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ service }) => service)
}

/**
 * Counts services by normalised action type. A service contributes at most once to each action,
 * even when its source data repeats that action.
 *
 * @returns {Record<string, number>}
 */
export function countServicesByAction(services) {
  if (!Array.isArray(services)) return {}
  const counts = {}
  for (const service of services) {
    for (const action of new Set(getActions(service))) counts[action] = (counts[action] ?? 0) + 1
  }
  return counts
}

/**
 * One entry per service the item matches, in input order, with the match the card label renders;
 * an empty item explains nothing. The seed's dry run counts these per kind.
 *
 * @returns {Array<{ id: string, kind: 'direct' | 'category', matchedTerms: string[], categoryLabel: string | null }>}
 */
export function explainMatches(services, item) {
  if (!Array.isArray(services)) return []
  const resolved = resolveItemQuery(item)
  if (resolved.itemTokens.length === 0) return []
  const explanations = []
  for (const service of services) {
    const match = matchService(service, resolved)
    if (match.kind === null) continue
    explanations.push({ id: service.id, ...match })
  }
  return explanations
}

/**
 * The action-hint split: user-selected chips are applied before this call and are never relaxed; only
 * the verb-derived hint may be. With a hint, the hinted services are the primary block; when
 * none carries the hinted action, the primary block is empty and every service becomes an
 * "other option" below it.
 *
 * @returns {{ primary: object[], otherOptions: object[], hintDropped: boolean }}
 */
export function splitByActionHint(services, resolved) {
  const list = Array.isArray(services) ? services : []
  const hint = resolved?.actionHint ?? null
  if (hint === null) return { primary: list, otherOptions: [], hintDropped: false }
  const hinted = list.filter((service) => getActions(service).includes(hint))
  if (hinted.length > 0) return { primary: hinted, otherOptions: [], hintDropped: false }
  return { primary: [], otherOptions: list, hintDropped: true }
}
