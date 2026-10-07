import { computed, shallowRef, toValue } from 'vue'

import { sortServicesByRating } from '@/features/ratings/domain/rankServices.js'
import { paginateRecords } from '@/shared/domain/pagination.js'
import { compareByName } from '@/shared/domain/tableQuery.js'

import { effectiveRadius as effectiveRadiusOf } from '../domain/findNearbyQuery.js'
import { categoryLabel, resolveItemQuery } from '../domain/itemCategories.js'
import {
  distanceKm,
  isMappableGeo,
  selectInBounds,
  selectNearby,
} from '../domain/nearbyServices.js'
import { formatResultsStatus } from '../domain/resultsCopy.js'
import {
  countServicesByAction,
  explainMatches,
  searchServices,
  splitByActionHint,
} from '../domain/searchServices.js'

/**
 * The results pipeline: `searchServices` -> the action-hint split -> geography (the
 * applied viewport, else the origin's radius, else everything) -> sort -> numbering ->
 * `paginateRecords`. Every in-radius or in-view result is numbered 1..N once; the page affects
 * only the list. Highest-rated sorts the whole candidate set with the summaries the view
 * fetched for `candidateIds`, and keeps the previous rated order until the next round is ready:
 * a round is ready only when `ratingStatus` is `ready` and its `ratingIds` cover every
 * candidate, so a follow-mode pan that changes the candidates before the debounced round runs
 * never re-ranks them with the old summaries. The kept order belongs to one item and one set of
 * action chips; a new query starts in name order until its own round is ready. A discovery
 * composable never imports a ratings composable: `summariesById`, `ratingStatus` and `ratingIds`
 * come in from the view, the composition root.
 *
 * Nearest stays in distance order while origin coordinates are held, `pending` included (a held
 * origin being re-acquired); it falls back to name order when none are held or the device said
 * `denied` or `unavailable`. "Other options" is never ranked by rating: it follows Nearest and
 * Name Z-A, and falls back to name order under Highest rated.
 *
 * Every option is a `MaybeRefOrGetter`: `services` (the catalogue), `state` (the parsed
 * `/find-nearby` query), `origin` and `originStatus` (`useLocationOrigin`), `appliedViewport`
 * (the reducer's bounds or null), `summariesById` and `ratingStatus` (`useRatingSummaries`),
 * `ratingIds` (the ids that round was loaded for; omitted, the round is taken to cover every
 * candidate), `truncated` (the catalogue read hit its cap).
 */
export function useDiscoveryResults({
  services,
  state,
  origin,
  originStatus,
  appliedViewport,
  summariesById,
  ratingStatus,
  ratingIds,
  truncated,
}) {
  const current = () => toValue(state)
  const resolved = computed(() => resolveItemQuery(current().item))
  const matched = computed(() =>
    searchServices(toValue(services), {
      item: current().item,
      actionTypes: current().actionTypes,
      sort: 'name-asc',
    }),
  )
  const split = computed(() => splitByActionHint(matched.value, resolved.value))
  const hintDropped = computed(() => split.value.hintDropped)
  const matches = computed(() =>
    Object.fromEntries(
      explainMatches(toValue(services), current().item).map(({ id, ...match }) => [id, match]),
    ),
  )
  const effectiveRadius = computed(() => effectiveRadiusOf(current(), toValue(origin)))
  const filterApplies = computed(() =>
    Boolean(toValue(appliedViewport) || (toValue(origin) && effectiveRadius.value > 0)),
  )

  /** The geographic step over one block: viewport, radius, or everything with a distance. */
  const geography = (list) => {
    const bounds = toValue(appliedViewport)
    const from = toValue(origin)
    if (bounds) return selectInBounds(list, { bounds, origin: from }).items
    if (from && effectiveRadius.value > 0) {
      return selectNearby(list, { origin: from, radiusKm: effectiveRadius.value }).items
    }
    return list.map((service) => ({
      service,
      distanceKm: from && isMappableGeo(service.geo) ? distanceKm(from, service.geo) : null,
    }))
  }
  const primary = computed(() => geography(split.value.primary))
  const otherInRange = computed(() => geography(split.value.otherOptions))
  const candidateIds = computed(() => primary.value.map((entry) => entry.service.id))
  // Both blocks: a dropped hint moves every match into "Other options", and its places without a
  // map position are still worth offering.
  const missingLocationCount = computed(() =>
    filterApplies.value
      ? [...split.value.primary, ...split.value.otherOptions].filter(
          (service) => !isMappableGeo(service.geo),
        ).length
      : 0,
  )

  const effectiveSort = computed(() => {
    const { sort } = current()
    const status = toValue(originStatus)
    const located = Boolean(toValue(origin)) && status !== 'denied' && status !== 'unavailable'
    return sort === 'nearest' && !located ? 'name-asc' : sort
  })
  const sortDegraded = computed(
    () => current().sort !== effectiveSort.value && toValue(originStatus) !== 'pending',
  )

  const byName = (entries) => [...entries].sort((a, b) => compareByName(a.service, b.service))
  const byOrder = (entries, order) => {
    const rank = new Map(order.map((id, index) => [id, index]))
    return [...entries].sort(
      (a, b) =>
        (rank.get(a.service.id) ?? Number.POSITIVE_INFINITY) -
          (rank.get(b.service.id) ?? Number.POSITIVE_INFINITY) ||
        compareByName(a.service, b.service),
    )
  }
  /** The unranked orders: distance (unknown last), then name; name Z-A; name A-Z. */
  const orderEntries = (entries, sort) => {
    if (sort === 'nearest') {
      return [...entries].sort(
        (a, b) =>
          (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
          compareByName(a.service, b.service),
      )
    }
    if (sort === 'name-desc') return byName(entries).reverse()
    return byName(entries)
  }
  // The last rated order and the query it was ranked for (`{ key, order }`), kept across rounds so
  // a loading round never reorders the cards. A deliberate cache written inside a computed: it
  // records what the last ready round decided and is read only by the next evaluation.
  let lastRated = null
  /** The summaries belong to the current candidates: `ready`, and loaded for all of them. */
  const ratingsReady = (entries) => {
    if (toValue(ratingStatus) !== 'ready') return false
    const rated = toValue(ratingIds)
    if (rated === undefined || rated === null) return true
    const covered = new Set(rated)
    return entries.every((entry) => covered.has(entry.service.id))
  }
  const sorted = computed(() => {
    const entries = primary.value
    const sort = effectiveSort.value
    if (sort === 'highest-rated') {
      const { item, actionTypes } = current()
      const key = `${item}\n${actionTypes.join(',')}`
      if (ratingsReady(entries)) {
        const services = entries.map((entry) => entry.service)
        const order = sortServicesByRating(services, toValue(summariesById)).map((s) => s.id)
        lastRated = { key, order }
        return byOrder(entries, order)
      }
      const kept = lastRated?.key === key ? lastRated.order : null
      return kept ? byOrder(entries, kept) : byName(entries)
    }
    return orderEntries(entries, sort)
  })
  const otherOptions = computed(() =>
    orderEntries(
      otherInRange.value,
      effectiveSort.value === 'highest-rated' ? 'name-asc' : effectiveSort.value,
    ),
  )
  const visible = computed(() =>
    sorted.value.map((entry, index) => ({ ...entry, index: index + 1 })),
  )
  const paged = computed(() =>
    paginateRecords(visible.value, { page: current().page, pageSize: current().pageSize }),
  )
  const distances = computed(() =>
    Object.fromEntries(
      [...primary.value, ...otherInRange.value].map((entry) => [
        entry.service.id,
        entry.distanceKm,
      ]),
    ),
  )
  const counts = computed(() =>
    countServicesByAction(searchServices(toValue(services), { item: current().item })),
  )

  const selectedId = shallowRef('')
  /** Selects a result and reports the page it sits on, so the view can move the list there. */
  const select = (id, from = 'card') => {
    selectedId.value = id
    const position = visible.value.findIndex((entry) => entry.service.id === id)
    const page =
      position === -1 ? paged.value.page : Math.ceil((position + 1) / paged.value.pageSize)
    return { page, from }
  }

  const scope = computed(() => {
    if (toValue(appliedViewport)) return { kind: 'viewport' }
    const from = toValue(origin)
    if (from) return { kind: 'radius', radiusKm: effectiveRadius.value, originLabel: from.label }
    return { kind: 'all' }
  })
  const listState = computed(() => {
    if (matched.value.length === 0) return 'none-at-all'
    if (primary.value.length === 0 && otherInRange.value.length === 0) return 'none-in-radius'
    return 'some'
  })
  const statusLine = computed(() => {
    const kinds = candidateIds.value.map((id) => matches.value[id]?.kind)
    return formatResultsStatus({
      count: primary.value.length,
      scope: scope.value,
      // The item words without the verb, as the match label spells them ("8 match 'microwave'").
      item: resolved.value.itemTokens.join(' '),
      directCount: kinds.filter((kind) => kind === 'direct').length,
      categoryCount: kinds.filter((kind) => kind === 'category').length,
      categoryLabel: categoryLabel(resolved.value.categoryIds[0]),
      truncated: Boolean(toValue(truncated)),
    })
  })

  return {
    resolved,
    matched,
    primary,
    otherOptions,
    hintDropped,
    matches,
    candidateIds,
    visible,
    paged,
    distances,
    counts,
    selectedId,
    select,
    missingLocationCount,
    truncated: computed(() => Boolean(toValue(truncated))),
    effectiveRadius,
    effectiveSort,
    sortDegraded,
    scope,
    listState,
    statusLine,
  }
}
