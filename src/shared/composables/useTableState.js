import { computed, toValue } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  MULTI_SEPARATOR,
  applyTableState,
  normalizeTableState,
  toTableQuery,
} from '../domain/tableQuery.js'

/**
 * The URL is the single source of truth of a table: filters, sort and page live
 * in `route.query`, so they survive a refresh and Back, and the Overview can deep-link into a
 * register (`/staff/sessions?status=full`). Every change is a `router.replace` (a filter is not a
 * page in the history); a filter, a cleared filter or a new sort returns to page 1. Query keys the
 * table does not own (`correction`, for example) are kept; the hash is not (a filter change must
 * not scroll back to an anchor).
 *
 * @param {import('vue').MaybeRefOrGetter<import('../domain/tableQuery.js').Column[]>} columns
 * @param {{ defaultSort?: { key: string, direction: 'asc' | 'desc' } | null, rows?: import('vue').MaybeRefOrGetter<object[]> | null }} [options]
 */
export function useTableState(columns, { defaultSort = null, rows = null } = {}) {
  const route = useRoute()
  const router = useRouter()
  const columnList = () => toValue(columns)
  const rowList = () => toValue(rows) ?? []

  const state = computed(() => normalizeTableState(route.query, columnList(), { defaultSort }))
  const result = computed(() =>
    rows === null ? null : applyTableState(rowList(), columnList(), state.value),
  )
  const totalCount = computed(() => (rows === null ? 0 : rowList().length))

  const write = async (next) => {
    const list = columnList()
    const owned = new Set([...list.map((column) => column.key), 'sort', 'page'])
    const foreign = Object.fromEntries(
      Object.entries(route.query).filter(([key]) => !owned.has(key)),
    )
    // Round-trip through the normaliser so the URL only ever holds canonical values.
    const canonical = normalizeTableState(toTableQuery(next, list, { defaultSort }), list, {
      defaultSort,
    })
    await router.replace({
      query: { ...foreign, ...toTableQuery(canonical, list, { defaultSort }) },
    })
  }

  // A multi column's filter arrives as the list of chosen option values; the URL holds it
  // comma-joined, and the round-trip in `write` puts it in the column's option order.
  const setFilter = (key, value) =>
    write({
      ...state.value,
      filters: {
        ...state.value.filters,
        [key]: Array.isArray(value) ? value.join(MULTI_SEPARATOR) : String(value ?? ''),
      },
      page: 1,
    })
  const clearFilters = () => write({ ...state.value, filters: {}, page: 1 })
  const setSort = (key, direction) => write({ ...state.value, sort: { key, direction }, page: 1 })
  const setPage = (page) => write({ ...state.value, page })

  return { state, result, totalCount, setFilter, clearFilters, setSort, setPage }
}
