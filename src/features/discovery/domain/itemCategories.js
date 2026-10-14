import { deepFreeze } from '@/shared/domain/deepFreeze.js'

import { singularize, tokenize } from './textNormalization.js'

/**
 * The twelve item categories and the item-aware matcher behind "repair
 * microwave". Matching is whole-word or whole-phrase only: a term matches a contiguous run of
 * canonical tokens, never a substring, so "environment" never matches "iron". Both sides are
 * canonicalised with `canonical` (tokenised, then singularised token by token).
 *
 * `label` is the lowercase display phrase the card's match label renders verbatim ("May take small
 * appliances (based on category)"). `terms` are the words or phrases that resolve a query or a
 * catalogue entry to the category; `broadMatches` lists the other categories whose services may
 * also take this category's items (one level, used by `matchService`).
 *
 * The twelve are bundled here and are always present. An admin can add categories, which arrive
 * as data: `createCategoryIndex(added)` builds the lookup tables for the twelve plus those, and
 * `categoryLabel`, `resolveItemQuery` and `matchService` take that index as an optional last
 * argument (without one, or with anything that is not an index, they use the twelve alone).
 * `deriveItemCategories` always uses the twelve. An added category's `label` is its name as the
 * admin typed it.
 */
export const ITEM_CATEGORIES = deepFreeze([
  {
    id: 'small-appliances',
    label: 'small appliances',
    actions: ['repair', 'reuse', 'recycle'],
    terms: [
      'small appliance',
      'small household appliance',
      'small electrical appliance',
      'electrical appliance',
      'appliance',
      'microwave',
      'toaster',
      'kettle',
      'iron',
      'blender',
      'mixer',
      'food processor',
      'coffee machine',
      'rice cooker',
      'slow cooker',
      'air fryer',
      'vacuum',
      'vacuum cleaner',
      'hair dryer',
      'hairdryer',
      'lamp',
      'fan',
      'heater',
      'sewing machine',
      'power tool',
      'small power tool',
      'drill',
      'clock',
      'electric toothbrush',
      'electric razor',
      'electrical item',
      'small electrical item',
    ],
    broadMatches: ['general-repair', 'e-waste', 'reuse-goods'],
  },
  {
    id: 'computers',
    label: 'computers',
    actions: ['repair', 'reuse', 'recycle'],
    terms: [
      'computer',
      'laptop',
      'desktop',
      'pc',
      'monitor',
      'keyboard',
      'computer mouse',
      'printer',
      'tablet',
      'ipad',
      'hard drive',
      'modem',
      'router',
      'scanner',
    ],
    broadMatches: ['e-waste', 'reuse-goods'],
  },
  {
    id: 'e-waste',
    label: 'e-waste',
    actions: ['recycle', 'reuse'],
    terms: [
      'e waste',
      'ewaste',
      'small e waste',
      'electronic waste',
      'electronic',
      'small electronic',
      'phone',
      'mobile phone',
      'mobile',
      'smartphone',
      'smart watch',
      'television',
      'tv',
      'cable',
      'charger',
      'camera',
      'radio',
      'speaker',
      'stereo',
      'headphone',
      'game console',
      'console',
      'dvd player',
      'vape',
      'power supply',
    ],
    broadMatches: ['computers', 'household-recycling'],
  },
  {
    id: 'batteries',
    label: 'batteries',
    actions: ['recycle'],
    terms: [
      'battery',
      'household battery',
      'car battery',
      'lithium battery',
      'button battery',
      'rechargeable battery',
      'power bank',
    ],
    broadMatches: ['e-waste', 'household-recycling'],
  },
  {
    id: 'bicycles',
    label: 'bicycles',
    actions: ['repair', 'reuse', 'recycle'],
    terms: [
      'bicycle',
      'bike',
      'e bike',
      'ebike',
      'pushbike',
      'kids bike',
      'adult bike',
      'bike part',
      'bike light',
      'tyre',
      'inner tube',
      'saddle',
      'wheel',
      'helmet',
      'scooter',
      'e scooter',
    ],
    broadMatches: ['general-repair', 'reuse-goods'],
  },
  {
    id: 'clothing',
    label: 'clothing',
    actions: ['repair', 'reuse', 'recycle'],
    terms: [
      'clothing',
      'clothes',
      'garment',
      'textile',
      'fabric',
      'shirt',
      'blouse',
      'top',
      'dress',
      'skirt',
      'pants',
      'trousers',
      'jeans',
      'jacket',
      'coat',
      'knitwear',
      'jumper',
      'suit',
      'uniform',
      'work clothes',
      'workwear',
      'trades wear',
      'shoe',
      'boot',
      'sneaker',
      'hat',
      'scarf',
      'belt',
      'handbag',
      'bag',
      'accessory',
      'fashion accessory',
      'linen',
      'towel',
      'bedding',
      'blanket',
      'hosiery',
    ],
    broadMatches: ['general-repair', 'reuse-goods'],
  },
  {
    id: 'furniture',
    label: 'furniture',
    actions: ['repair', 'reuse', 'recycle'],
    terms: [
      'furniture',
      'small furniture',
      'chair',
      'table',
      'sofa',
      'couch',
      'desk',
      'bed',
      'bed base',
      'mattress',
      'cabinet',
      'bookshelf',
      'shelf',
      'drawer',
      'cupboard',
      'wardrobe',
      'homeware',
    ],
    broadMatches: ['general-repair', 'reuse-goods'],
  },
  {
    id: 'toys',
    label: 'toys',
    actions: ['repair', 'reuse', 'recycle'],
    terms: [
      'toy',
      'electric toy',
      'electronic toy',
      'soft toy',
      'pre loved toy',
      'board game',
      'puzzle',
      'doll',
      'lego',
      'teddy',
      'pram',
      'stroller',
    ],
    broadMatches: ['general-repair', 'reuse-goods'],
  },
  {
    id: 'jewellery',
    label: 'jewellery',
    actions: ['repair', 'reuse'],
    terms: [
      'jewellery',
      'jewelry',
      'costume jewellery',
      'necklace',
      'ring',
      'bracelet',
      'earring',
      'watch',
      'brooch',
      'pendant',
      'cufflink',
      'sunglasses',
    ],
    broadMatches: ['general-repair', 'reuse-goods'],
  },
  {
    id: 'household-recycling',
    label: 'household recycling',
    actions: ['recycle'],
    terms: [
      'recycling',
      'household recycling',
      'mixed recycling',
      'paper',
      'cardboard',
      'glass',
      'glass bottle',
      'bottle',
      'jar',
      'can',
      'tin',
      'carton',
      'plastic',
      'hard plastic',
      'soft plastic',
      'plastic bottle',
      'plastic container',
      'polystyrene',
      'light globe',
      'globe',
      'downlight',
      'fluorescent tube',
      'fluorescent light globe',
      'cfl',
      'x ray',
      'x ray film',
      'paint',
      'paint tin',
      'motor oil',
      'cooking oil',
      'oil',
      'gas bottle',
      'fire extinguisher',
      'aerosol',
      'aerosol can',
      'chemical',
      'scrap metal',
      'metal',
      'steel',
      'timber',
      'green waste',
      'garden waste',
      'hard rubbish',
      'hard waste',
      'general waste',
      'printer cartridge',
      'ink cartridge',
      'toner',
      'blister pack',
      'medication blister pack',
      'cd',
      'dvd',
      'vhs tape',
      'cassette',
      'floppy disc',
      'stationery',
      'pen',
      'whitegoods',
      'fridge',
      'air conditioner',
      'large appliance',
      'hot water service',
      'christmas tree',
      'carpet',
      'building material',
      'brick',
      'concrete',
      'rubble',
      'soil',
    ],
    broadMatches: ['batteries', 'e-waste'],
  },
  {
    id: 'general-repair',
    label: 'general repair',
    actions: ['repair'],
    terms: [
      'household item',
      'household goods',
      'mechanical item',
      'ornament',
      'umbrella',
      'knife',
      'scissors',
      'hand tool',
      'garden tool',
      'wood carving hand tool',
      'mower',
      'lawn mower',
      'ceramic',
      'crockery',
      'pottery',
      'wooden item',
      'woodwork',
      'picture frame',
      'frame',
      'bric a brac',
    ],
    broadMatches: [
      'small-appliances',
      'computers',
      'bicycles',
      'clothing',
      'furniture',
      'toys',
      'jewellery',
    ],
  },
  {
    id: 'reuse-goods',
    label: 'reuse goods',
    actions: ['reuse'],
    terms: [
      'second hand goods',
      'second hand',
      'pre loved',
      'book',
      'pre loved goods',
      'donation',
      'op shop',
      'treasure chest',
      'recycled goods',
      'tool library',
      'toy library',
    ],
    broadMatches: [
      'small-appliances',
      'computers',
      'bicycles',
      'clothing',
      'furniture',
      'toys',
      'jewellery',
    ],
  },
])

export const ITEM_CATEGORY_IDS = Object.freeze(ITEM_CATEGORIES.map((category) => category.id))

/** The verb phrases that set `actionHint`. */
export const ACTION_VERBS = deepFreeze({
  repair: ['repair', 'fix', 'mend'],
  recycle: ['recycle', 'dispose', 'drop off'],
  reuse: ['donate', 'give away', 'reuse'],
})

const ACTION_ORDER = Object.freeze(['repair', 'recycle', 'reuse'])

/**
 * Question phrasing removed as whole spans before term matching: bare "can" and "top"
 * stay item terms, so "can I fix my toaster" must lose "can i" as a phrase rather than
 * resolve "can" to household recycling.
 */
const QUESTION_PHRASES = Object.freeze([
  'where can i',
  'how can i',
  'where do i',
  'how do i',
  'can i',
  'can you',
  'can we',
  'where to',
  'how to',
  'top rated',
  'near me',
])

/**
 * Words dropped from the item only where no term consumed them, so "my old tools" finds
 * what "tools" finds while the term "bric a brac" keeps its "a".
 */
const FILLER_WORDS = new Set(
  [
    'a',
    'an',
    'the',
    'my',
    'our',
    'your',
    'some',
    'old',
    'broken',
    'unwanted',
    'used',
    'i',
    'me',
    'please',
    'nearby',
  ].map(singularize),
)

/** Tokenised, then singularised token by token: the canonical form every matcher compares. */
const canonical = (text) => tokenize(text).map(singularize)

/** Longer phrases first, so "vacuum cleaner" consumes its span before "vacuum" could. */
const longestFirst = (left, right) => right.tokens.length - left.tokens.length

const isAddedCategory = (category, known) =>
  category !== null &&
  typeof category === 'object' &&
  typeof category.id === 'string' &&
  !known.has(category.id) &&
  typeof category.label === 'string' &&
  category.label.trim() !== '' &&
  Array.isArray(category.terms) &&
  category.terms.every((term) => typeof term === 'string') &&
  Array.isArray(category.broadMatches)

/**
 * The lookup tables every matcher reads, built once per catalogue: the bundled twelve first, in
 * their order, then `added` (categories an admin created, `{ id, label, terms, broadMatches }`,
 * in the catalogue's order). An added entry that reuses one of the twelve ids, repeats an id or
 * is malformed is left out, so the twelve always read as this file defines them. Terms are
 * canonicalised once and sorted longest phrase first (ties keep table order); a term with no
 * letter or digit is dropped. Pure; the result and its lists are frozen, and its two maps are for
 * reading only.
 *
 * @param {Array<{ id: string, label: string, terms: string[], broadMatches: string[] }>} [added]
 */
export function createCategoryIndex(added = []) {
  const known = new Set(ITEM_CATEGORY_IDS)
  const extra = []
  for (const category of Array.isArray(added) ? added : []) {
    if (!isAddedCategory(category, known)) continue
    known.add(category.id)
    extra.push(
      deepFreeze({
        id: category.id,
        label: category.label,
        actions: [],
        terms: [...category.terms],
        broadMatches: category.broadMatches.filter((id) => typeof id === 'string'),
      }),
    )
  }
  const categories = Object.freeze([...ITEM_CATEGORIES, ...extra])
  const terms = categories
    .flatMap((category) =>
      category.terms.map((term) => ({ id: category.id, tokens: canonical(term) })),
    )
    .filter((term) => term.tokens.length > 0)
    .map((term) => ({ ...term, key: term.tokens.join(' ') }))
    .sort(longestFirst)
  return Object.freeze({
    categories,
    ids: Object.freeze(categories.map((category) => category.id)),
    byId: new Map(categories.map((category) => [category.id, category])),
    order: new Map(categories.map((category, position) => [category.id, position])),
    terms: Object.freeze(terms),
  })
}

/** The bundled twelve alone: what every matcher uses when it is given no index. */
export const DEFAULT_CATEGORY_INDEX = createCategoryIndex()

const indexOr = (index) => (index?.byId instanceof Map ? index : DEFAULT_CATEGORY_INDEX)
const inTableOrder = (ids, index) => {
  const rank = (id) => index.order.get(id) ?? index.order.size
  return [...new Set(ids)].sort((left, right) => rank(left) - rank(right))
}

// Every verb phrase, canonicalised once, longest phrase first; ties keep repair, recycle, reuse.
const VERBS = ACTION_ORDER.flatMap((action) =>
  ACTION_VERBS[action].map((phrase) => ({ action, tokens: canonical(phrase) })),
).sort(longestFirst)

// Every question phrase, canonicalised once, longest phrase first so "where can i" is removed
// whole before "can i" could split it.
const QUESTIONS = QUESTION_PHRASES.map((phrase) => ({ tokens: canonical(phrase) })).sort(
  longestFirst,
)

/** The index where `needle` occurs contiguously in `tokens` from `from`, or -1. */
const indexOfSpan = (tokens, needle, from = 0) => {
  for (let start = from; start + needle.length <= tokens.length; start += 1) {
    if (needle.every((token, offset) => tokens[start + offset] === token)) return start
  }
  return -1
}

/**
 * `pairs` (`{ word, token }`) with every run whose canonical tokens equal one of the spans
 * removed, spans in the order given. The comparison reads `pair.token`; the typed word travels
 * with it, so what is left can still be shown as typed.
 */
const withoutSpans = (pairs, spans) => {
  const tokensOf = (list) => list.map((pair) => pair.token)
  return spans.reduce((remaining, span) => {
    let result = remaining
    let at = indexOfSpan(tokensOf(result), span.tokens)
    while (at !== -1) {
      result = [...result.slice(0, at), ...result.slice(at + span.tokens.length)]
      at = indexOfSpan(tokensOf(result), span.tokens, at)
    }
    return result
  }, pairs)
}

/** The label of a category id in `index` (the twelve without one), or '' when it is unknown. */
export function categoryLabel(id, index) {
  return indexOr(index).byId.get(id)?.label ?? ''
}

/**
 * Reads a free-text search into its parts. The action hint comes from one verb phrase: the
 * longest one in the query, ties going to repair, then recycle, then reuse ("fix or drop off my
 * toaster" gives recycle). Its span is removed; any other verb stays among the item words. Then
 * every question phrase is removed ("can i", "where do i"). The categories are those whose terms
 * match whole-token contiguous runs of what remains (multi-word terms first; a consumed span
 * never matches a different term, but a term with exactly the same words, which only an added
 * category can have, matches it too). `itemTokens` is what remains less the filler words no term
 * consumed ("my", "old"; the term "bric a brac" keeps its "a"), and `residual` the item tokens no
 * term consumed. `itemLabels` holds the same words as typed (lower-cased, without punctuation or
 * accents, not singularised), one per item token in the same order, for what the person reads:
 * the match label, the status line and the relaxed-hint sentence ("old clothes" gives
 * `itemTokens` ['clothe'] and `itemLabels` ['clothes']). Token containment never matches:
 * `resolveItemQuery('environment')` resolves to no category. `index` is a createCategoryIndex
 * result; without one the twelve are used.
 *
 * @param {unknown} text
 * @param {ReturnType<typeof createCategoryIndex>} [index]
 * @returns {{ tokens: string[], itemTokens: string[], itemLabels: string[], categoryIds: string[], actionHint: 'repair' | 'reuse' | 'recycle' | null, residual: string[] }}
 */
export function resolveItemQuery(text, index) {
  const table = indexOr(index)
  const words = tokenize(text)
  const tokens = words.map(singularize)
  // Each typed word beside its canonical token: matching reads the token, the labels the word.
  const pairs = words.map((word, position) => ({ word, token: tokens[position] }))
  let actionHint = null
  let withoutVerb = pairs
  for (const verb of VERBS) {
    const at = indexOfSpan(tokens, verb.tokens)
    if (at === -1) continue
    actionHint = verb.action
    withoutVerb = [...pairs.slice(0, at), ...pairs.slice(at + verb.tokens.length)]
    break
  }
  const remaining = withoutSpans(withoutVerb, QUESTIONS)
  const itemTokens = remaining.map((pair) => pair.token)
  const consumed = Array.from({ length: itemTokens.length }, () => false)
  // The words of the term that took the span starting at each position.
  const claimed = new Map()
  const matched = []
  for (const term of table.terms) {
    let from = 0
    for (;;) {
      const at = indexOfSpan(itemTokens, term.tokens, from)
      if (at === -1) break
      const free = consumed.slice(at, at + term.tokens.length).every((taken) => !taken)
      if (free) {
        consumed.fill(true, at, at + term.tokens.length)
        claimed.set(at, term.key)
        matched.push(term.id)
      } else if (claimed.get(at) === term.key) {
        matched.push(term.id)
      }
      from = at + 1
    }
  }
  const kept = remaining.filter(
    (pair, position) => consumed[position] || !FILLER_WORDS.has(pair.token),
  )
  return {
    tokens,
    itemTokens: kept.map((pair) => pair.token),
    itemLabels: kept.map((pair) => pair.word),
    categoryIds: inTableOrder(matched, table),
    actionHint,
    residual: remaining
      .filter((pair, position) => !consumed[position] && !FILLER_WORDS.has(pair.token))
      .map((pair) => pair.token),
  }
}

const stringList = (value) =>
  Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []

/**
 * The categories a service's `acceptedItems` and `aliases` resolve to (not its name), from the
 * twelve only: a service written before categories could be added keeps the matches it always
 * had, and a derivation never depends on whether the shared catalogue has loaded.
 */
export function deriveItemCategories(service) {
  const entries = [...stringList(service?.acceptedItems), ...stringList(service?.aliases)]
  return inTableOrder(
    entries.flatMap((entry) => resolveItemQuery(entry).categoryIds),
    DEFAULT_CATEGORY_INDEX,
  )
}

const serviceText = (service) =>
  [service?.name, ...stringList(service?.acceptedItems), ...stringList(service?.aliases)]
    .filter((entry) => typeof entry === 'string')
    .join(' ')

/**
 * How a service matches a resolved query: `direct` when every item token appears as a whole
 * canonical token of its name, accepted items or aliases (AND semantics), labelled with the
 * query's words as typed (`matchedTerms` is `resolved.itemLabels`); else `category` when
 * its `itemCategories` intersect the query's categories or one level of their `broadMatches`;
 * else null. The label is always a query category, as the status line counts it: the
 * first query category the service carries, else the first whose `broadMatches` hold one of the
 * service's categories, both in table order. `index` is the one the query was resolved with.
 *
 * @returns {{ kind: 'direct' | 'category' | null, matchedTerms: string[], categoryLabel: string | null }}
 */
export function matchService(service, resolved, index) {
  const table = indexOr(index)
  const none = { kind: null, matchedTerms: [], categoryLabel: null }
  const itemTokens = resolved?.itemTokens ?? []
  if (itemTokens.length === 0) return none
  const haystack = new Set(canonical(serviceText(service)))
  if (itemTokens.every((token) => haystack.has(token))) {
    return { kind: 'direct', matchedTerms: [...resolved.itemLabels], categoryLabel: null }
  }
  const ownSet = new Set(stringList(service?.itemCategories))
  const queryIds = inTableOrder(resolved?.categoryIds ?? [], table)
  const own = queryIds.find((id) => ownSet.has(id))
  if (own !== undefined) {
    return { kind: 'category', matchedTerms: [], categoryLabel: categoryLabel(own, table) }
  }
  const parent = queryIds.find((id) =>
    (table.byId.get(id)?.broadMatches ?? []).some((broad) => ownSet.has(broad)),
  )
  if (parent === undefined) return none
  return { kind: 'category', matchedTerms: [], categoryLabel: categoryLabel(parent, table) }
}
