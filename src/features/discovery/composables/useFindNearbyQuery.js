import { computed, toValue, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  canonicalizeFindNearbyState,
  isSameFindNearbyState,
  parseFindNearbyQuery,
  toFindNearbyQuery,
} from '../domain/findNearbyQuery.js'

// A patch to any of these starts the list over unless it sets the page itself.
const PAGE_RESETTING_KEYS = [
  'item',
  'location',
  'near',
  'actionTypes',
  'open',
  'sort',
  'radius',
  'pageSize',
]

/**
 * The Find nearby filters live in the page URL, so a search can be shared, bookmarked and
 * reloaded. On the Find nearby page this composable is the only code that parses or changes
 * them; Home and the guides only link in with a starting query, and the app shell keeps a copy
 * of the whole URL for its Find nearby link. `state` is the parsed route query. `update(patch)`
 * is how the page changes a filter: always `router.replace`, so Back leaves the results page in
 * one step, and a changed filter starts the list at page 1. A canonical watcher also rewrites the
 * URL, at most once per navigation, when the origin status or the device's answer makes
 * `near=me` or `sort=nearest` impossible; it waits for `settled`, the view's flag that its
 * `restoreIfGranted()` has resolved (at once when the URL carries no `near=me`) and no typed
 * location lookup is running. The watcher runs after the render flush, so a lookup the view
 * starts for a new `location` in the same flush is already running when the URL is judged.
 *
 * @param {{ originStatus: import('vue').MaybeRefOrGetter<string>, deviceStatus?: import('vue').MaybeRefOrGetter<string | null>, settled: import('vue').MaybeRefOrGetter<boolean> }} options
 * @returns {{ state: import('vue').ComputedRef<object>, update: (patch: object) => Promise<unknown>, canonical: import('vue').ComputedRef<object> }}
 */
export function useFindNearbyQuery({ originStatus, deviceStatus = null, settled }) {
  const route = useRoute()
  const router = useRouter()
  const state = computed(() => parseFindNearbyQuery(route.query))
  const canonical = computed(() =>
    canonicalizeFindNearbyState(state.value, {
      originStatus: toValue(originStatus),
      deviceStatus: toValue(deviceStatus),
    }),
  )

  const update = (patch) => {
    const next = { ...state.value, ...patch }
    const resetsPage = PAGE_RESETTING_KEYS.some((key) => Object.hasOwn(patch, key))
    if (resetsPage && !Object.hasOwn(patch, 'page')) next.page = 1
    return router.replace({ name: 'find-nearby', query: toFindNearbyQuery(next) })
  }

  // The URL a canonical rewrite was issued for. While the route is still on it the rewrite is in
  // flight and is not issued twice; any navigation away (the rewrite landing included) forgets
  // it, so a later visit to the same URL is judged afresh.
  let replacedFor = null
  watch(
    () => route.fullPath,
    (fullPath) => {
      if (fullPath !== replacedFor) replacedFor = null
    },
    { flush: 'sync' },
  )
  watch(
    [state, () => toValue(originStatus), () => toValue(deviceStatus), () => toValue(settled)],
    () => {
      if (!toValue(settled) || isSameFindNearbyState(canonical.value, state.value)) return
      if (replacedFor === route.fullPath) return
      replacedFor = route.fullPath
      void router.replace({ name: 'find-nearby', query: toFindNearbyQuery(canonical.value) })
    },
    { immediate: true, flush: 'post' },
  )

  return { state, update, canonical }
}
