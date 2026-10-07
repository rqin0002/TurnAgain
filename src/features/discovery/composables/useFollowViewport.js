import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { createViewportState, reduceViewport } from '../domain/mapViewport.js'

export const FOLLOW_DEBOUNCE_MS = 300

/**
 * The map viewport of Find nearby: the reducer's state, dispatched only
 * here, and the follow-mode debounce on its apply.
 *
 * Follow mode: a user move applies its viewport after 300 ms without another move,
 * so the status line, the list and the rating candidates change together once the map settles.
 * With follow off the move only offers "Search this area", at once. A radius choice, a cleared
 * origin or the list view replaces the range a held move would apply, so it cancels that move;
 * a programmatic move does not. A URL change that reuses the view reaches the reducer through
 * the watchers on `view` and `radius`.
 *
 * @param {{ state: import('vue').MaybeRefOrGetter<{ view: string, radius: number | null, follow: boolean }>, origin: import('vue').MaybeRefOrGetter<object | null>, onOriginMoved?: () => void }} options
 */
export function useFollowViewport({ state, origin, onOriginMoved }) {
  const viewport = shallowRef(createViewportState())
  const dispatch = (event) => {
    viewport.value = reduceViewport(viewport.value, event)
  }
  const appliedViewport = computed(() => viewport.value.appliedViewport)
  const searchAreaVisible = computed(
    () => viewport.value.searchAreaAvailable && !toValue(state).follow,
  )

  let followTimer
  const supersede = (event) => {
    clearTimeout(followTimer)
    dispatch(event)
  }
  const onUserMove = (bounds) => {
    clearTimeout(followTimer)
    if (!toValue(state).follow) {
      dispatch({ type: 'user-move-end', bounds, follow: false })
      return
    }
    followTimer = setTimeout(() => {
      dispatch({ type: 'user-move-end', bounds, follow: toValue(state).follow })
    }, FOLLOW_DEBOUNCE_MS)
  }
  const onProgrammaticMove = (bounds) => dispatch({ type: 'programmatic-move-end', bounds })
  const searchThisArea = () => dispatch({ type: 'search-this-area' })

  // A navigation that reuses this view (the header's Find nearby link, Home's search while the map
  // is open) changes the URL without onView or onRadius; the reducer hears of it here as well.
  watch(
    () => toValue(state).view,
    (view) => {
      if (view === 'list') supersede({ type: 'view-changed', view: 'list' })
    },
  )
  watch(
    () => toValue(state).radius,
    () => supersede({ type: 'radius-chosen' }),
  )
  // A new origin, typed or a device fix, replaces the area a viewport or a held move would apply,
  // and the view frames it on the map, including a fix or a place that lands after the map.
  const originKey = computed(() => {
    const current = toValue(origin)
    return current ? `${current.source}|${current.latitude}|${current.longitude}` : ''
  })
  watch(originKey, () => {
    supersede({ type: 'clear-viewport' })
    onOriginMoved?.()
  })
  onScopeDispose(() => clearTimeout(followTimer))

  return {
    viewport,
    appliedViewport,
    searchAreaVisible,
    supersede,
    onUserMove,
    onProgrammaticMove,
    searchThisArea,
  }
}
