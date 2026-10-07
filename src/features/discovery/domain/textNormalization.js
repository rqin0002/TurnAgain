/**
 * The text normaliser of the discovery feature (spec 6.1): search-only canonicalisation that
 * makes punctuation, case and diacritics comparable while the catalogue text stays untouched for
 * display. `normalizeForSearch` and `tokenize` are the staff tables' own functions re-exported, so
 * the app has one definition and discovery search cannot drift from table search; singularising
 * belongs to item matching alone, so it lives here.
 */

export { normalizeForSearch, tokenize } from '@/shared/domain/tableQuery.js'

/**
 * A fixed set of suffix rules, no irregular table: the matcher singularises both the query and
 * the catalogue text with this one function, so consistency is the contract, not English
 * ("clothes" and "clothes" both become "clothe" and match; "glasses" becomes "glass").
 */
export function singularize(token) {
  const word = typeof token === 'string' ? token : ''
  if (word.length <= 3) return word
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (/(?:sses|shes|ches|xes|zes)$/u.test(word)) return word.slice(0, -2)
  if (word.endsWith('ss')) return word
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}
