/**
 * Freezes a value and everything reachable from it (spec 3.3: domain data is immutable). Plain
 * objects and arrays only; a value that is already frozen is not walked again, so a shared or
 * cyclic reference terminates the walk. Returns the same reference for chaining.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const entry of Object.values(value)) deepFreeze(entry)
  }
  return value
}
