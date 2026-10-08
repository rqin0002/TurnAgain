/**
 * The one persisted cache: public catalogue data under `turnagain:v1:*` keys in an
 * envelope `{ v, savedAt, value }`. Every call is wrapped in try/catch because private mode, a
 * blocked storage and thumbnail capture all throw or lose data, and the page must render the same
 * without storage. Timestamps are stored as ISO strings (a Firestore Timestamp would otherwise
 * stringify to `{ seconds, nanoseconds }` and break the cached paint).
 */

export const CACHE_VERSION = 1
export const CACHE_PREFIX = 'turnagain:v1:'
export const CACHE_KEYS = Object.freeze({
  services: 'turnagain:v1:catalogue:services',
  activities: 'turnagain:v1:catalogue:activities',
  ratingSummaries: 'turnagain:v1:ratingSummaries',
  lastSearch: 'turnagain:v1:lastSearch',
})
/** Longest serialised envelope `writeCache` stores, as a string length (UTF-16 code units). */
export const MAX_ENTRY_LENGTH = 1024 * 1024

const storage = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Reading the global itself throws when storage is blocked by policy.
    return null
  }
}

/** Dates and Timestamp-like objects (anything with toDate) become ISO strings, recursively. */
const toStorable = (value) => {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  if (Array.isArray(value)) {
    return value.map(toStorable)
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toStorable(entry)]))
}

/**
 * @param {string} key
 * @returns {{ value: unknown, savedAt: Date } | null} null for a missing, foreign or unreadable entry
 */
export function readCache(key) {
  const store = storage()
  if (!store) {
    return null
  }
  try {
    const raw = store.getItem(key)
    if (raw === null) {
      return null
    }
    const envelope = JSON.parse(raw)
    if (
      envelope === null ||
      typeof envelope !== 'object' ||
      envelope.v !== CACHE_VERSION ||
      typeof envelope.savedAt !== 'string' ||
      !Object.hasOwn(envelope, 'value')
    ) {
      return null
    }
    const savedAt = new Date(envelope.savedAt)
    if (Number.isNaN(savedAt.getTime())) {
      return null
    }
    return { value: envelope.value, savedAt }
  } catch {
    return null
  }
}

/**
 * Stores `value` under `key` in a versioned envelope; true when stored.
 * An envelope longer than MAX_ENTRY_LENGTH is not written and the existing entry for `key` is
 * removed, so a catalogue that outgrew the limit does not keep painting an older copy. Any
 * other failure (quota, blocked storage, unserialisable value) returns false and leaves the
 * existing entry as it was.
 *
 * @returns {boolean} true when the value was stored
 */
export function writeCache(key, value) {
  const store = storage()
  if (!store) {
    return false
  }
  try {
    const serialised = JSON.stringify({
      v: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      value: toStorable(value),
    })
    if (serialised.length > MAX_ENTRY_LENGTH) {
      store.removeItem(key)
      return false
    }
    store.setItem(key, serialised)
    return true
  } catch {
    return false
  }
}

/** Removes every entry whose key starts with `prefix` (the whole cache with CACHE_PREFIX). */
export function clearCache(prefix) {
  const store = storage()
  if (!store || typeof prefix !== 'string') {
    return
  }
  try {
    const matching = []
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (key !== null && key.startsWith(prefix)) {
        matching.push(key)
      }
    }
    for (const key of matching) {
      store.removeItem(key)
    }
  } catch {
    // A throwing storage has nothing to clear.
  }
}
