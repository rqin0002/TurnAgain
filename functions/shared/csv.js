/**
 * CSV for spreadsheets (spec 5.11): a UTF-8 BOM so Excel reads the accents, CRLF row ends
 * (RFC 4180) including after the last row, a quoted cell whenever it holds a quote, a comma or a
 * line break, and a leading apostrophe on any cell that starts with = + - @, a tab, a carriage
 * return or a line feed (the OWASP CSV-injection triggers; the full-width forms are not added,
 * decision M6-D6), so a spreadsheet never evaluates a participant's name as a formula. Pure: the
 * staff copy of the session broadcast and the SPA's Export CSV both use it.
 */

const BOM = '\uFEFF'
const CRLF = '\r\n'
const FORMULA_START = /^[=+\-@\t\r\n]/u
const NEEDS_QUOTES = /[",\r\n]/u

/** One cell: null and undefined are empty, everything else is its String() text. */
export function toCsvCell(value) {
  if (value === null || value === undefined) {
    return ''
  }
  const text = String(value)
  const safe = FORMULA_START.test(text) ? `'${text}` : text
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

const isColumn = (column) =>
  column !== null &&
  typeof column === 'object' &&
  typeof column.key === 'string' &&
  typeof column.label === 'string'

/**
 * A header row of `columns[].label`, then one row per entry of `rows` reading `row[column.key]`.
 * Throws TypeError when `rows` is not an array or `columns` is not a non-empty array of
 * `{ key, label }` strings.
 */
export function toCsv(rows, columns) {
  if (!Array.isArray(rows)) {
    throw new TypeError('toCsv: rows must be an array')
  }
  if (!Array.isArray(columns) || columns.length === 0 || !columns.every(isColumn)) {
    throw new TypeError('toCsv: columns must be a non-empty array of { key, label } strings')
  }
  const lines = [
    columns.map((column) => toCsvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => toCsvCell(row?.[column.key])).join(',')),
  ]
  return `${BOM}${lines.join(CRLF)}${CRLF}`
}
