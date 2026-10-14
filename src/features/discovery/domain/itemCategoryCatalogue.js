import { isPlainObject, isValidId } from '@/shared/domain/catalogueValidation.js'

import { ITEM_CATEGORIES, ITEM_CATEGORY_IDS } from './itemCategories.js'
import { normalizeForSearch } from './textNormalization.js'

/**
 * The shared item-category catalogue as stored: one document, `itemCategories/catalogue`, that an
 * admin extends from the service form. `categories` maps each id to `{ label, terms,
 * broadMatches }`, `order` lists the ids in the order they were added, `revision` is 1 when the
 * document is created and grows by one with every addition, and `updatedAt` is the time of the
 * last write. The twelve bundled categories are its first entries (the seed, or the first
 * addition, writes them); pages always read their wording from itemCategories.js and take only
 * the added entries from the document. Nothing is ever removed, renamed or reordered: an addition
 * appends one entry and changes nothing else, which the rules check.
 *
 * Pure: it turns a stored document into the added categories, checks what an admin typed,
 * derives the id and builds the next document. The repository and the seed read and write.
 */

export const ITEM_CATEGORY_DOCUMENT = Object.freeze({
  collection: 'itemCategories',
  id: 'catalogue',
})
export const CATEGORY_NAME_LIMITS = Object.freeze({ minimum: 2, maximum: 60 })
export const CATEGORY_TERM_LIMITS = Object.freeze({ maximum: 10, entryMaximum: 60 })
// The rules' bounds: a service stores at most 40 characters per category id, and the document
// holds at most 100 categories.
const ID_MAXIMUM = 40
const CATALOGUE_MAXIMUM = 100
const CONTROL = /\p{Cc}/u
const LETTERS_ONLY = 'Use letters, digits, spaces and punctuation only.'
const BUNDLED_IDS = new Set(ITEM_CATEGORY_IDS)

/** A name or search word as stored: runs of white space made one space, none at either end. */
const tidy = (text) =>
  String(text ?? '')
    .replace(/\s+/gu, ' ')
    .trim()

/**
 * The key two names are the same by: case, accents, punctuation and spacing are ignored ("E-Waste"
 * and "e waste" are one name); words in other scripts are compared as written.
 */
export const categoryNameKey = (name) => normalizeForSearch(name)

const isCategoryId = (id) => isValidId(id) && id.length <= ID_MAXIMUM
const isLine = (value, maximum) =>
  typeof value === 'string' && value.length >= 1 && value.length <= maximum && !CONTROL.test(value)
const isAddedEntry = (entry) =>
  isPlainObject(entry) &&
  isLine(entry.label, CATEGORY_NAME_LIMITS.maximum) &&
  Array.isArray(entry.terms) &&
  entry.terms.length >= 1 &&
  entry.terms.length <= CATEGORY_TERM_LIMITS.maximum + 1 &&
  entry.terms.every((term) => isLine(term, CATEGORY_TERM_LIMITS.entryMaximum)) &&
  Array.isArray(entry.broadMatches)

/** The stored form of the twelve: what the seed, or the first addition, starts the document with. */
export function bundledCatalogueData() {
  return {
    categories: Object.fromEntries(
      ITEM_CATEGORIES.map((category) => [
        category.id,
        {
          label: category.label,
          terms: [...category.terms],
          broadMatches: [...category.broadMatches],
        },
      ]),
    ),
    order: [...ITEM_CATEGORY_IDS],
    revision: 0,
  }
}

/**
 * The categories an admin added, in the order they were added, from the stored document's data
 * (null or undefined when the document does not exist: nothing added yet, revision 0). The twelve
 * are skipped (their wording is the bundle's); an entry that is missing or malformed is skipped and
 * counted. Returns null for a document whose own shape is wrong, which the caller treats as an
 * unreadable catalogue, never as "no categories".
 *
 * @returns {{ added: Array<{ id: string, label: string, terms: string[], broadMatches: string[] }>, revision: number, skippedCount: number } | null}
 */
export function projectItemCategoryCatalogue(data) {
  if (data === null || data === undefined) return { added: [], revision: 0, skippedCount: 0 }
  if (
    !isPlainObject(data) ||
    !isPlainObject(data.categories) ||
    !Array.isArray(data.order) ||
    !Number.isInteger(data.revision) ||
    data.revision < 1
  ) {
    return null
  }
  const seen = new Set()
  const added = []
  let skippedCount = 0
  for (const id of data.order) {
    if (BUNDLED_IDS.has(id)) continue
    const entry =
      typeof id === 'string' && Object.hasOwn(data.categories, id) ? data.categories[id] : null
    if (!isCategoryId(id) || seen.has(id) || !isAddedEntry(entry)) {
      skippedCount += 1
      continue
    }
    seen.add(id)
    added.push({
      id,
      label: entry.label,
      terms: [...entry.terms],
      broadMatches: entry.broadMatches.filter((other) => typeof other === 'string'),
    })
  }
  return { added, revision: data.revision, skippedCount }
}

/**
 * What an admin typed for a new category, checked: the name (2 to 60 characters once white space
 * is tidied, letters and punctuation but no control character, at least one letter or digit) and
 * up to ten other search words (each up to 60 characters; empty ones dropped). `values.terms` is
 * the name followed by the words, each kept once by the name key (a word with no letter or digit
 * is left out).
 *
 * @param {{ name: unknown, terms?: unknown[] }} input
 * @returns {{ isValid: boolean, errors: { name: string, terms: string }, values: { label: string, terms: string[] } }}
 */
export function checkCategoryInput({ name, terms = [] }) {
  const label = tidy(name)
  const words = (Array.isArray(terms) ? terms : []).map(tidy).filter(Boolean)
  const errors = { name: '', terms: '' }
  if (label === '') errors.name = 'Enter a category name.'
  else if (CONTROL.test(label)) errors.name = LETTERS_ONLY
  else if (label.length < CATEGORY_NAME_LIMITS.minimum) errors.name = 'Use at least 2 characters.'
  else if (label.length > CATEGORY_NAME_LIMITS.maximum) errors.name = 'Use 60 characters or fewer.'
  else if (categoryNameKey(label) === '') errors.name = 'Use at least one letter or digit.'
  if (words.length > CATEGORY_TERM_LIMITS.maximum) errors.terms = 'Keep at most 10 search words.'
  else if (words.some((word) => word.length > CATEGORY_TERM_LIMITS.entryMaximum)) {
    errors.terms = 'Keep each search word to 60 characters or fewer.'
  } else if (words.some((word) => CONTROL.test(word))) errors.terms = LETTERS_ONLY
  const keys = new Set()
  const unique = []
  for (const word of [label, ...words]) {
    const key = categoryNameKey(word)
    if (key === '' || keys.has(key)) continue
    keys.add(key)
    unique.push(word)
  }
  return {
    isValid: errors.name === '' && errors.terms === '',
    errors,
    values: { label, terms: unique },
  }
}

/**
 * The id of a new category: the name's Latin letters and digits in lower case, joined by "-", at
 * most 40 characters ("Café & Bar Fittings" -> "cafe-bar-fittings"); "category" when the name has
 * none; "-2", "-3"… appended while the id is taken.
 */
export function categoryIdFor(label, takenIds) {
  const taken = new Set(takenIds)
  const words = normalizeForSearch(label).match(/[a-z0-9]+/gu) ?? []
  const base = words.join('-').slice(0, ID_MAXIMUM).replace(/-+$/u, '') || 'category'
  if (!taken.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`
    const id = `${base.slice(0, ID_MAXIMUM - tail.length).replace(/-+$/u, '')}${tail}`
    if (!taken.has(id)) return id
  }
}

/**
 * The next stored document for an addition. `stored` is the document's data as read (null when it
 * does not exist yet: the twelve are its base), `values` a valid checkCategoryInput result. A name
 * with the same key as an existing category's name returns that category (`exists`, no data), so a
 * retry after a lost answer, or a second admin typing the same name, never adds it twice. A
 * catalogue of 100 categories returns `full`. Otherwise `created` with the whole next document
 * (without `updatedAt`, which the writer stamps): one entry appended, `revision + 1`.
 *
 * @returns {{ outcome: 'created', id: string, label: string, data: { categories: object, order: string[], revision: number } } | { outcome: 'exists', id: string, label: string, data: null } | { outcome: 'full', id: null, label: string, data: null }}
 */
export function appendItemCategory(stored, values) {
  const base = stored ?? bundledCatalogueData()
  const key = categoryNameKey(values.label)
  const names = [
    ...ITEM_CATEGORIES.map((category) => [category.id, category.label]),
    ...base.order
      .filter((id) => !BUNDLED_IDS.has(id))
      .map((id) => [id, base.categories[id]?.label]),
  ]
  const existing = names.find(
    ([, label]) => typeof label === 'string' && categoryNameKey(label) === key,
  )
  if (existing) return { outcome: 'exists', id: existing[0], label: existing[1], data: null }
  if (base.order.length >= CATALOGUE_MAXIMUM) {
    return { outcome: 'full', id: null, label: values.label, data: null }
  }
  const id = categoryIdFor(values.label, [...ITEM_CATEGORY_IDS, ...base.order])
  return {
    outcome: 'created',
    id,
    label: values.label,
    data: {
      categories: {
        ...base.categories,
        [id]: { label: values.label, terms: [...values.terms], broadMatches: [] },
      },
      order: [...base.order, id],
      revision: base.revision + 1,
    },
  }
}

/**
 * What the seed does with the stored catalogue: create it with the twelve when it does not exist,
 * else nothing. `count` is how many categories the document holds (or will hold); `missing` lists
 * bundled ids a stored document lacks, which the seed reports and never writes (pages read the
 * twelve from the bundle, so nothing is lost).
 *
 * @returns {{ action: 'create' | 'unchanged', count: number, missing: string[] }}
 */
export function planItemCategorySeed(stored) {
  if (stored === null || stored === undefined) {
    return { action: 'create', count: ITEM_CATEGORY_IDS.length, missing: [] }
  }
  const order = Array.isArray(stored.order) ? stored.order : []
  const present = new Set(order)
  return {
    action: 'unchanged',
    count: order.length,
    missing: ITEM_CATEGORY_IDS.filter((id) => !present.has(id)),
  }
}
