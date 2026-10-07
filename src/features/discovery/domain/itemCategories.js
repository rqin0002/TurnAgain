import { deepFreeze } from '@/shared/domain/deepFreeze.js'

import { singularize, tokenize } from './textNormalization.js'

/**
 * The twelve item categories (spec 6.1, 13.4) and the item-aware matcher behind "repair
 * microwave". Matching is whole-word or whole-phrase only: a term matches a contiguous run of
 * canonical tokens, never a substring, so "environment" never matches "iron". Both sides are
 * canonicalised with `canonical` (tokenised, then singularised token by token).
 *
 * `label` is the lowercase display phrase the D4 card label renders verbatim ("May take small
 * appliances (based on category)"). `terms` are the words or phrases that resolve a query or a
 * catalogue entry to the category; `broadMatches` lists the other categories whose services may
 * also take this category's items (one level, used by `matchService`).
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

/** The verb phrases that set `actionHint`, in the order spec 6.1 lists them. */
export const ACTION_VERBS = deepFreeze({
  repair: ['repair', 'fix', 'mend'],
  recycle: ['recycle', 'dispose', 'drop off'],
  reuse: ['donate', 'give away', 'reuse'],
})

const ACTION_ORDER = Object.freeze(['repair', 'recycle', 'reuse'])

/**
 * Question phrasing removed as whole spans before term matching (FW-R1): bare "can" and "top"
 * stay item terms (M4-D23), so "can I fix my toaster" must lose "can i" as a phrase rather than
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
 * Words dropped from the item only where no term consumed them (FW-R1), so "my old tools" finds
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

const byId = new Map(ITEM_CATEGORIES.map((category) => [category.id, category]))
const order = new Map(ITEM_CATEGORY_IDS.map((id, index) => [id, index]))
const inTableOrder = (ids) =>
  [...new Set(ids)].sort((left, right) => order.get(left) - order.get(right))

/** Longer phrases first, so "vacuum cleaner" consumes its span before "vacuum" could. */
const longestFirst = (left, right) => right.tokens.length - left.tokens.length

// Every term, canonicalised once, longest phrase first; ties keep table order.
const TERMS = ITEM_CATEGORIES.flatMap((category) =>
  category.terms.map((term) => ({ id: category.id, tokens: canonical(term) })),
).sort(longestFirst)

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

/** `tokens` with every occurrence of each span removed, spans in the order given. */
const withoutSpans = (tokens, spans) =>
  spans.reduce((remaining, span) => {
    let result = remaining
    let at = indexOfSpan(result, span.tokens)
    while (at !== -1) {
      result = [...result.slice(0, at), ...result.slice(at + span.tokens.length)]
      at = indexOfSpan(result, span.tokens, at)
    }
    return result
  }, tokens)

export function categoryLabel(id) {
  return byId.get(id)?.label ?? ''
}

/**
 * The query, resolved: canonical tokens, the first verb phrase as `actionHint` (its span
 * removed), then every question phrase removed ("can i", "where do i", FW-R1). The categories are
 * those whose terms match whole-token contiguous runs of what remains (multi-word terms first; a
 * consumed span never matches a second term). `itemTokens` is what remains less the filler words
 * no term consumed ("my", "old"; the term "bric a brac" keeps its "a"), and `residual` the item
 * tokens no term consumed. Token containment never matches: `resolveItemQuery('environment')`
 * resolves to no category.
 *
 * @param {unknown} text
 * @returns {{ tokens: string[], itemTokens: string[], categoryIds: string[], actionHint: 'repair' | 'reuse' | 'recycle' | null, residual: string[] }}
 */
export function resolveItemQuery(text) {
  const tokens = canonical(text)
  let actionHint = null
  let withoutVerb = tokens
  for (const verb of VERBS) {
    const at = indexOfSpan(tokens, verb.tokens)
    if (at === -1) continue
    actionHint = verb.action
    withoutVerb = [...tokens.slice(0, at), ...tokens.slice(at + verb.tokens.length)]
    break
  }
  const itemTokens = withoutSpans(withoutVerb, QUESTIONS)
  const consumed = Array.from({ length: itemTokens.length }, () => false)
  const matched = []
  for (const term of TERMS) {
    let from = 0
    for (;;) {
      const at = indexOfSpan(itemTokens, term.tokens, from)
      if (at === -1) break
      const free = consumed.slice(at, at + term.tokens.length).every((taken) => !taken)
      if (free) {
        consumed.fill(true, at, at + term.tokens.length)
        matched.push(term.id)
      }
      from = at + 1
    }
  }
  return {
    tokens,
    itemTokens: itemTokens.filter((token, index) => consumed[index] || !FILLER_WORDS.has(token)),
    categoryIds: inTableOrder(matched),
    actionHint,
    residual: itemTokens.filter((token, index) => !consumed[index] && !FILLER_WORDS.has(token)),
  }
}

const stringList = (value) =>
  Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []

/** The categories a service's `acceptedItems` and `aliases` resolve to (not its name, spec 6.1). */
export function deriveItemCategories(service) {
  const entries = [...stringList(service?.acceptedItems), ...stringList(service?.aliases)]
  return inTableOrder(entries.flatMap((entry) => resolveItemQuery(entry).categoryIds))
}

const serviceText = (service) =>
  [service?.name, ...stringList(service?.acceptedItems), ...stringList(service?.aliases)]
    .filter((entry) => typeof entry === 'string')
    .join(' ')

/**
 * How a service matches a resolved query: `direct` when every item token appears as a whole
 * canonical token of its name, accepted items or aliases (AND semantics); else `category` when
 * its `itemCategories` intersect the query's categories or one level of their `broadMatches`;
 * else null. The label is always a query category, as the status line counts it (FW-R2): the
 * first query category the service carries, else the first whose `broadMatches` hold one of the
 * service's categories, both in table order.
 *
 * @returns {{ kind: 'direct' | 'category' | null, matchedTerms: string[], categoryLabel: string | null }}
 */
export function matchService(service, resolved) {
  const none = { kind: null, matchedTerms: [], categoryLabel: null }
  const itemTokens = resolved?.itemTokens ?? []
  if (itemTokens.length === 0) return none
  const haystack = new Set(canonical(serviceText(service)))
  if (itemTokens.every((token) => haystack.has(token))) {
    return { kind: 'direct', matchedTerms: [...itemTokens], categoryLabel: null }
  }
  const ownSet = new Set(stringList(service?.itemCategories))
  const queryIds = inTableOrder(resolved?.categoryIds ?? [])
  const own = queryIds.find((id) => ownSet.has(id))
  if (own !== undefined) {
    return { kind: 'category', matchedTerms: [], categoryLabel: categoryLabel(own) }
  }
  const parent = queryIds.find((id) =>
    (byId.get(id)?.broadMatches ?? []).some((broad) => ownSet.has(broad)),
  )
  if (parent === undefined) return none
  return { kind: 'category', matchedTerms: [], categoryLabel: categoryLabel(parent) }
}
