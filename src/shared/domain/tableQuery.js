/**
 * Generic table query helpers: tokenised search, stable sort and page slicing.
 * Pure. Feature modules supply the column-specific values and comparators. `paginateRows` is the
 * canonical page-slicer: `pagination.js` delegates to it and renames the fields for its
 * URL-facing consumers (discovery and activities keep that module). The
 * column-driven table API (`normalizeTableState`, `toTableQuery`,
 * `applyTableState`, `cellText`) sits at the end of this file and composes the helpers above for
 * `DataTable` and `useTableState`. This file never imports `pagination.js`.
 */

export const normalizeForSearch = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')

export const tokenize = (value) => normalizeForSearch(value).split(' ').filter(Boolean)

const flattenValues = (values) =>
  (Array.isArray(values) ? values.flat(Number.POSITIVE_INFINITY) : [values]).filter(
    (value) => value !== null && value !== undefined,
  )

/** Every query token appears somewhere in the (nested) values; an empty query matches everything. */
export const matchesTokens = (values, query) => {
  const tokens = tokenize(query)
  if (tokens.length === 0) {
    return true
  }
  const haystack = normalizeForSearch(flattenValues(values).join(' '))
  return tokens.every((token) => haystack.includes(token))
}

export const compareText = (left, right) =>
  String(left ?? '').localeCompare(String(right ?? ''), 'en-AU', {
    numeric: true,
    sensitivity: 'base',
  })

/** Name first, id as the tiebreak, so equal names always order the same way. */
export const compareByName = (left, right) =>
  compareText(left?.name, right?.name) || compareText(left?.id, right?.id)

/** Stable sort that never mutates the input: equal keys keep their source order. */
export function sortRecords(records, compare) {
  return records
    .map((record, sourceIndex) => ({ record, sourceIndex }))
    .sort(
      (left, right) => compare(left.record, right.record) || left.sourceIndex - right.sourceIndex,
    )
    .map(({ record }) => record)
}

const toPage = (value) => (Number.isSafeInteger(value) && value >= 1 ? value : 1)

/** Bounded page of an already sorted list, with the 1-based range labels the tables render. */
export function paginateRows(records, { page = 1, pageSize = 10 } = {}) {
  const size = Number.isSafeInteger(pageSize) && pageSize >= 1 ? pageSize : 10
  const totalResults = records.length
  const totalPages = Math.max(1, Math.ceil(totalResults / size))
  const current = Math.min(toPage(page), totalPages)
  const startIndex = (current - 1) * size
  const rows = records.slice(startIndex, startIndex + size)
  return {
    rows,
    totalResults,
    totalPages,
    page: current,
    pageStart: totalResults === 0 ? 0 : startIndex + 1,
    pageEnd: Math.min(startIndex + rows.length, totalResults),
  }
}

/** Filter, stable sort and page in one call. */
export function applyTableQuery(
  records,
  { predicate = () => true, compare = () => 0, page = 1, pageSize = 10 } = {},
) {
  const source = Array.isArray(records) ? records : []
  return paginateRows(sortRecords(source.filter(predicate), compare), { page, pageSize })
}

/**
 * @typedef {object} Column
 * @property {string} key                    URL key of the filter; never 'sort' or 'page'
 * @property {string} label                  header text, CSV/JSON label
 * @property {(row: object) => string | number | null} value   sort and filter value
 * @property {(row: object) => string} [text]                  cell text = export text;
 *                                                             default String(value(row) ?? '')
 * @property {'text' | 'number' | 'date'} sort                 required on every data column
 * @property {'text' | 'select' | 'multi'} filter              required on every data column; 'multi'
 *                                                             picks any number of options
 * @property {Array<{ value: string, label: string }>} [options]  required for 'select' and 'multi'
 * @property {(row: object) => unknown[]} [searchValues]       text filter haystack; default [value(row)]
 * @property {(row: object) => string[]} [matchValues]         select/multi filter values;
 *                                                             default [String(value(row) ?? '')]
 * @property {boolean} [nullsLast]                              null/invalid values last in both directions
 * @property {'narrow' | 'wide'} [width]                        table layout hint for the column
 * @property {boolean} [nowrap]                                 the cell text never wraps
 * @property {boolean} [wrap]                                   long words may break anywhere
 * @property {string} [placeholder]                             text filter placeholder
 * @property {string} [anyLabel]                                select filter's "no filter" option;
 *                                                             default "Any <label in lower case>"
 */

/** @typedef {{ filters: Record<string, string>, sort: { key: string, direction: 'asc' | 'desc' } | null, page: number }} TableState */
/** @typedef {{ rows: object[], allRows: object[], total: number, page: number, pageCount: number, from: number, to: number }} TableResult */

/** Rows per page of every DataTable: a constant, never a prop. */
export const TABLE_PAGE_SIZE = 10

const FILTER_MAX_LENGTH = 100
const SORT_PATTERN = /^(.+):(asc|desc)$/u
const PAGE_PATTERN = /^\d{1,5}$/u
// A value the sort cannot place: null, undefined, a non-finite number, an unparsable date.
const MISSING = Symbol('missing')

const firstValue = (value) => (Array.isArray(value) ? value[0] : value)

const cleanFilter = (value) => value.trim().replace(/\s+/gu, ' ').slice(0, FILTER_MAX_LENGTH)

const isOption = (column, value) => (column.options ?? []).some((option) => option.value === value)

/** The character that joins a multi filter's chosen values in its URL form. */
export const MULTI_SEPARATOR = ','

/**
 * The canonical value of a multi filter: the chosen values that are options of the column, each
 * once, in the column's option order, joined with commas; '' when none is left. Values that are
 * not options are dropped, so a stale or hand-edited URL never empties the table.
 *
 * @param {Column} column - a column with `filter: 'multi'`
 * @param {string | string[]} values - a comma-joined string (the URL form) or a list of values
 * @returns {string}
 */
export function multiFilterValue(column, values) {
  const list = Array.isArray(values) ? values : String(values ?? '').split(MULTI_SEPARATOR)
  const chosen = new Set(list.map((value) => String(value).trim()))
  return (column.options ?? [])
    .map((option) => option.value)
    .filter((value) => chosen.has(value))
    .join(MULTI_SEPARATOR)
}

/** The option values a canonical multi filter value names; [] for ''. */
export const multiFilterValues = (value) =>
  typeof value === 'string' && value !== '' ? value.split(MULTI_SEPARATOR) : []

/** The text a cell shows and the export writes: `text(row)`, else the value. */
export function cellText(column, row) {
  return column.text ? column.text(row) : String(column.value(row) ?? '')
}

function readSort(raw, columns) {
  const match = typeof raw === 'string' ? SORT_PATTERN.exec(raw) : null
  if (!match || !columns.some((column) => column.key === match[1])) {
    return null
  }
  return { key: match[1], direction: match[2] }
}

function readPage(raw) {
  if (typeof raw !== 'string' || !PAGE_PATTERN.test(raw)) {
    return 1
  }
  return Math.max(1, Number(raw))
}

/**
 * The table state a route query names. Filters are allow-listed to the column keys: the first value
 * of a repeated key, trimmed, whitespace collapsed, at most 100 characters; an empty value is
 * dropped and so is a select value that is not one of the column's options (a stale or hand-edited
 * `?status=draft` must not empty the table). A multi value is a comma-joined subset of the options
 * in option order (`actions=repair,recycle`), cleaned by `multiFilterValue`. `sort` is
 * `<key>:asc|desc` on a column key, else `defaultSort`; `page` is a positive integer of at most
 * five digits, else 1.
 *
 * @param {Record<string, unknown>} query - `route.query`
 * @param {Column[]} columns
 * @param {{ defaultSort?: { key: string, direction: 'asc' | 'desc' } | null }} [options]
 * @returns {TableState}
 */
export function normalizeTableState(query, columns, { defaultSort = null } = {}) {
  const source = query ?? {}
  const filters = {}
  for (const column of columns) {
    const raw = firstValue(source[column.key])
    if (typeof raw !== 'string') {
      continue
    }
    const value = column.filter === 'multi' ? multiFilterValue(column, raw) : cleanFilter(raw)
    if (value === '' || (column.filter === 'select' && !isOption(column, value))) {
      continue
    }
    filters[column.key] = value
  }
  const sort =
    readSort(firstValue(source.sort), columns) ??
    (defaultSort ? { key: defaultSort.key, direction: defaultSort.direction } : null)
  return { filters, sort, page: readPage(firstValue(source.page)) }
}

/**
 * The route query of a table state: the non-empty filters in column order, `sort` only when it
 * differs from `defaultSort`, `page` only when it is above 1 (defaults stay out of the URL).
 *
 * @param {TableState} state
 * @param {Column[]} columns
 * @param {{ defaultSort?: { key: string, direction: 'asc' | 'desc' } | null }} [options]
 * @returns {Record<string, string>}
 */
export function toTableQuery(state, columns, { defaultSort = null } = {}) {
  const query = {}
  for (const column of columns) {
    const value = state.filters?.[column.key]
    if (typeof value === 'string' && value !== '') {
      query[column.key] = value
    }
  }
  const sort = state.sort ?? null
  const isDefault =
    sort !== null &&
    defaultSort !== null &&
    sort.key === defaultSort.key &&
    sort.direction === defaultSort.direction
  if (sort && !isDefault) {
    query.sort = `${sort.key}:${sort.direction}`
  }
  if (Number.isSafeInteger(state.page) && state.page > 1) {
    query.page = String(state.page)
  }
  return query
}

function matchesColumn(column, row, filterValue) {
  if (column.filter === 'select' || column.filter === 'multi') {
    const values = column.matchValues?.(row) ?? [String(column.value(row) ?? '')]
    // A multi filter keeps a row that has any one of the chosen values.
    const chosen = column.filter === 'multi' ? multiFilterValues(filterValue) : [filterValue]
    return chosen.some((value) => values.includes(value))
  }
  return matchesTokens(column.searchValues?.(row) ?? [column.value(row)], filterValue)
}

/** The sortable form of one cell, or MISSING. A select column sorts on its option label. */
function sortKey(column, row) {
  const value = column.value(row)
  if (column.sort === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? value : MISSING
  }
  if (column.sort === 'date') {
    const time = typeof value === 'string' ? Date.parse(value) : Number.NaN
    return Number.isNaN(time) ? MISSING : time
  }
  if (value === null || value === undefined) {
    return MISSING
  }
  if (column.filter === 'select') {
    const option = (column.options ?? []).find((candidate) => candidate.value === String(value))
    return option ? option.label : cellText(column, row)
  }
  return value
}

function comparatorFor(column, direction) {
  const sign = direction === 'desc' ? -1 : 1
  return (left, right) => {
    const a = sortKey(column, left)
    const b = sortKey(column, right)
    if (a === MISSING || b === MISSING) {
      if (a === b) {
        return 0
      }
      // nullsLast: after every value in both directions; otherwise the lowest value.
      const missingFirst = a === MISSING ? -1 : 1
      return column.nullsLast ? -missingFirst : sign * missingFirst
    }
    const order = column.sort === 'text' ? compareText(a, b) : a - b
    return sign * order
  }
}

/**
 * Filter every column independently (text: every token in `searchValues ?? [value]`; select: the
 * filter value is one of `matchValues ?? [String(value)]`; multi: any chosen value is one of them),
 * sort stably on `state.sort` (ties and an absent sort keep the source order), then slice page
 * `state.page` of TABLE_PAGE_SIZE rows, clamped to the last page. `allRows` is every filtered,
 * sorted row (what the exports carry).
 *
 * @param {object[]} rows
 * @param {Column[]} columns
 * @param {TableState} state
 * @returns {TableResult}
 */
export function applyTableState(rows, columns, state) {
  const source = Array.isArray(rows) ? rows : []
  const filters = state.filters ?? {}
  const active = columns.filter(
    (column) => typeof filters[column.key] === 'string' && filters[column.key] !== '',
  )
  const filtered = source.filter((row) =>
    active.every((column) => matchesColumn(column, row, filters[column.key])),
  )
  const sortColumn = state.sort
    ? columns.find((column) => column.key === state.sort.key)
    : undefined
  const allRows = sortColumn
    ? sortRecords(filtered, comparatorFor(sortColumn, state.sort.direction))
    : filtered
  const page = paginateRows(allRows, { page: state.page, pageSize: TABLE_PAGE_SIZE })
  return {
    rows: page.rows,
    allRows,
    total: page.totalResults,
    page: page.page,
    pageCount: page.totalPages,
    from: page.pageStart,
    to: page.pageEnd,
  }
}
