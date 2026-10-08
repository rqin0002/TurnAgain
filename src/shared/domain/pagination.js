/**
 * Page numbers and page slices for the public result lists (Find nearby and Activities).
 * `normalizePagination` reads the `page` and `pageSize` route-query values: page is a decimal
 * integer of 1 or more (anything else is 1), pageSize is 20 when asked for and otherwise 10, and
 * a repeated key counts by its first value. `paginateRecords` slices a list with tableQuery.js's
 * `paginateRows` (a page past the end becomes the last page) and returns `items`, `total`,
 * `page`, `pageSize`, `pageCount`, `from` and `to`. The staff tables page with
 * `applyTableState` instead.
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
