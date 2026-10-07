/**
 * URL-facing pagination (spec 8.3): `normalizePagination` reads route-query values, and
 * `paginateRecords` keeps the `items/total/pageCount/from/to` vocabulary its four consumers
 * (activityCatalogue, SearchResults, ActivitiesView, FindNearbyView) render. The slicing itself
 * lives in `tableQuery.js` (`paginateRows`), the canonical page-slicer; this module only maps
 * that result onto these names. The staff tables use `applyTableState` instead; this module
 * stays for its four consumers (decision M6-D11).
 */

import { paginateRows } from './tableQuery.js'

const first = (value) => (Array.isArray(value) ? value[0] : value)

/** Accept decimal integers only; normalise repeated query keys to their first value. */
export function normalizePagination({ page, pageSize } = {}) {
  const rawPage = first(page)
  const candidate =
    typeof rawPage === 'number' || (typeof rawPage === 'string' && /^\d+$/u.test(rawPage))
      ? Number(rawPage)
      : 1
  return {
    page: Number.isSafeInteger(candidate) && candidate >= 1 ? candidate : 1,
    pageSize: first(pageSize) === 20 || first(pageSize) === '20' ? 20 : 10,
  }
}

export function paginateRecords(records, criteria = {}) {
  const normalized = normalizePagination(criteria)
  const page = paginateRows(records, normalized)
  return {
    items: page.rows,
    total: page.totalResults,
    page: page.page,
    pageSize: normalized.pageSize,
    pageCount: page.totalPages,
    from: page.pageStart,
    to: page.pageEnd,
  }
}
