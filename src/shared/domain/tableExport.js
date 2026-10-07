/**
 * Export builders for the staff tables. Pure: the rows are the
 * filtered, sorted `allRows` of `applyTableState` (every page) and every cell is the text the
 * table shows (`cellText`: dates in Melbourne words, "Provider managed", never a raw ISO instant
 * or an array), so the CSV and the JSON carry exactly what is on screen. The CSV goes through
 * `@shared/csv.js` (BOM, CRLF, the formula guard); the file name carries the Melbourne day.
 */

import { toCsv } from '@shared/csv.js'
import { melbourneDayKey } from '@shared/melbourneTime.js'

import { cellText } from './tableQuery.js'

const toHeader = (columns) => columns.map(({ key, label }) => ({ key, label }))

/** One `{ [column.key]: cell text }` record per row, in column order. */
export function toExportRows(rows, columns) {
  return rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.key, cellText(column, row)])),
  )
}

/** The CSV file: a header of the labels, then one line per row of cell text. */
export function buildCsvExport({ rows, columns }) {
  return toCsv(toExportRows(rows, columns), toHeader(columns))
}

/**
 * The JSON file: `{ exportedAt, filters, columns, rows }` with the CSV's labels and rows, plus
 * `"incomplete": true` when the read behind the table was truncated.
 */
export function buildJsonExport({ rows, columns, filters, exportedAt, incomplete = false }) {
  return JSON.stringify(
    {
      exportedAt,
      filters,
      columns: toHeader(columns),
      rows: toExportRows(rows, columns),
      ...(incomplete ? { incomplete: true } : {}),
    },
    null,
    2,
  )
}

/**
 * `turnagain-<dataset>-<Melbourne YYYY-MM-DD>[-incomplete].<extension>`; `dataset` is
 * `services`, `sessions` or `participants-<sessionId>`. Throws TypeError without a valid `now`.
 */
export function exportFileName({ dataset, extension, now, incomplete = false }) {
  const day = melbourneDayKey(now)
  if (day === null) {
    throw new TypeError('exportFileName needs a valid Date or ISO string')
  }
  return `turnagain-${dataset}-${day}${incomplete ? '-incomplete' : ''}.${extension}`
}
