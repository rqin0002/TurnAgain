/**
 * The one route-access decision (spec 9.5), shared by the guard before a navigation and by the
 * store after a recovery, when the guard has already let a protected page render its retry panel
 * and the identity arrives later (Astra F3). Pure: the route's meta and the store's user in, one
 * of three words out. Route meta is UX; the rules are the boundary.
 *
 * @param {{ requiresAuth?: boolean, allowedRoles?: string[] } | undefined} meta - `route.meta`
 * @param {{ role: string } | null} user - the store's user, or null while nobody is signed in
 * @returns {'allow' | 'login' | 'forbidden'}
 */
export function decideRouteAccess(meta, user) {
  if (meta?.requiresAuth !== true) {
    return 'allow'
  }
  if (!user) {
    return 'login'
  }
  const { allowedRoles } = meta
  if (Array.isArray(allowedRoles) && !allowedRoles.includes(user.role)) {
    return 'forbidden'
  }
  return 'allow'
}

/**
 * Whether a completed navigation to this route re-reads the profile without the 60-second cache
 * (decision M6-DA4): a protected route whose roles exclude members is a staff or admin page, and
 * an account downgraded inside /staff must be out of it on its next click (spec L1297).
 *
 * @param {{ requiresAuth?: boolean, allowedRoles?: string[] } | undefined} meta - `route.meta`
 * @returns {boolean}
 */
export function requiresFreshProfile(meta) {
  return (
    meta?.requiresAuth === true &&
    Array.isArray(meta.allowedRoles) &&
    !meta.allowedRoles.includes('member')
  )
}
