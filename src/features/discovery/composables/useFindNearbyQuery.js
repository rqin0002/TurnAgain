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
  'sort',
  'radius',
  'pageSize',
]

/**
 * The `/find-nearby` query as state: `state` is the parsed route query, `update(patch)`
 * is the only writer (always `router.replace`, so Back leaves the results page in one step), and
 * the canonical watcher rewrites the URL at most once per navigation when the origin status or
 * the device's answer makes `near=me` or `sort=nearest` impossible. `settled` is the
 * view's: true once its `restoreIfGranted()` has resolved (at once when the URL carries no
 * `near=me`) and no typed lookup is resolving (`!resolvingTyped`). The watcher runs after the
 * render flush, so a lookup the view starts for a new `location` in the same flush is already
 * resolving when the URL is judged.
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
