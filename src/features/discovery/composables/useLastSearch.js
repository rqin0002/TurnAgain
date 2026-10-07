import { shallowRef } from 'vue'

import { CACHE_KEYS, clearCache, readCache, writeCache } from '@/shared/data/localCache.js'

/**
 * The last search (`turnagain:v1:lastSearch`): `item`, `location`, `actionTypes` and a
 * `sort` other than nearest, nothing else, so Home can prefill the form. Never `near`, never
 * coordinates, never the view, the follow flag or the page. A composable so no view imports
 * `shared/data` directly.
 */

const LAST_SEARCH_SORTS = ['name-asc', 'name-desc', 'highest-rated']
const ACTIONS = ['repair', 'reuse', 'recycle']

const text = (value) => (typeof value === 'string' ? value : '')

const project = (value) => {
  if (!value || typeof value !== 'object') return null
  const actionTypes = Array.isArray(value.actionTypes)
    ? ACTIONS.filter((action) => value.actionTypes.includes(action))
    : []
  return {
    item: text(value.item),
    location: text(value.location),
    actionTypes,
    sort: LAST_SEARCH_SORTS.includes(value.sort) ? value.sort : 'name-asc',
  }
}

/**
 * @returns {{
 *   lastSearch: import('vue').ShallowRef<{ item: string, location: string, actionTypes: string[], sort: string } | null>,
 *   remember: (state: object) => boolean,
 *   forget: () => void
 * }}
 */
export function useLastSearch() {
  const lastSearch = shallowRef(project(readCache(CACHE_KEYS.lastSearch)?.value))

  /** Writes the four keys; an empty search (no item, place or chip) is not worth remembering. */
  const remember = (state) => {
    const value = project({ ...state, sort: state?.sort === 'nearest' ? 'name-asc' : state?.sort })
    if (!value.item && !value.location && value.actionTypes.length === 0) return false
    const written = writeCache(CACHE_KEYS.lastSearch, value)
    if (written) lastSearch.value = value
    return written
  }

  const forget = () => {
    clearCache(CACHE_KEYS.lastSearch)
    lastSearch.value = null
  }

  return { lastSearch, remember, forget }
}
