const AUTH_ROUTE_NAMES = new Set(['forgot-password', 'login', 'register'])
const ENCODED_PATH_SEPARATOR_PATTERN = /%(?:2f|5c)/iu

const hasControlOrBackslash = (value) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return character === '\\' || codePoint <= 0x1f || codePoint === 0x7f
  })

/**
 * Resolves an untrusted post-authentication destination to a known internal route.
 * Protocol-relative paths, encoded path separators, auth loops, and catch-all matches fail closed.
 *
 * @param {unknown} value - Candidate query-string redirect value.
 * @param {import('vue-router').Router} router - Router used as the route-recognition boundary.
 * @returns {string | null} A normalized internal full path, or `null` when it is unsafe.
 */
export function resolveSafeRedirect(value, router) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return null
  }

  let decodedValue
  try {
    decodedValue = decodeURIComponent(value)
  } catch {
    return null
  }

  const pathnameEnd = value.search(/[?#]/u)
  const rawPathname = pathnameEnd === -1 ? value : value.slice(0, pathnameEnd)

  if (
    ENCODED_PATH_SEPARATOR_PATTERN.test(rawPathname) ||
    hasControlOrBackslash(value) ||
    hasControlOrBackslash(decodedValue) ||
    decodedValue.startsWith('//')
  ) {
    return null
  }

  let resolved
  try {
    resolved = router.resolve(value)
  } catch {
    return null
  }

  if (
    resolved.matched.length === 0 ||
    AUTH_ROUTE_NAMES.has(resolved.name) ||
    resolved.matched.some((record) => record.name === 'not-found')
  ) {
    return null
  }

  return resolved.fullPath
}
