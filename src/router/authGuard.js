import { decideRouteAccess, requiresFreshProfile } from '@/features/auth/router/routeAccess.js'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { resolveSafeRedirect } from '@/shared/domain/safeRedirect.js'

/** Where a signed-in user lands when no safe redirect is given (spec 9.5); LoginView reuses it. */
export function defaultDestination(authStore) {
  return { name: authStore.canAccess(['staff', 'admin']) ? 'staff' : 'account' }
}

/**
 * The navigation guard (spec 9.5, decision M8), registered in router/index.js as
 * `router.beforeEach((to) => authGuard(to, router))`; the router is a parameter because
 * `resolveSafeRedirect` needs `router.resolve` and this module never imports the router. Public
 * routes never wait; protected and guest-only routes wait for the store's first resolution; a
 * timed-out or failed resolution lets the protected view render its retry panel (App.vue) and
 * never blocks the sign-in page (C4.9). The role decision is `decideRouteAccess`, which the store
 * re-runs for the showing page once such a resolution recovers (Astra F3). Route meta is UX; the
 * rules are the boundary.
 *
 * @param {import('vue-router').RouteLocationNormalized} to
 * @param {import('vue-router').Router} router
 */
export async function authGuard(to, router) {
  if (!to.meta.requiresAuth && !to.meta.guestOnly) {
    return true
  }
  const authStore = useAuthStore()
  await authStore.ready

  if (to.meta.guestOnly) {
    return authStore.isSignedIn
      ? (resolveSafeRedirect(to.query.redirect, router) ?? defaultDestination(authStore))
      : true
  }
  if (authStore.status === 'error') {
    return true
  }
  const decision = decideRouteAccess(to.meta, authStore.isSignedIn ? authStore.user : null)
  if (decision === 'login') {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (decision === 'forbidden') {
    return { name: 'forbidden' }
  }
  return true
}

/**
 * After a completed navigation to a protected route, re-validate the profile without holding
 * the page (spec 9.3: the 60-second cache lives in the store and applies to 'navigation' only).
 * A staff or admin route asks for 'staff-navigation', which always re-reads (decision M6-DA4);
 * a query-only change on the same path keeps 'navigation'. Registered as `router.afterEach`.
 */
export function afterNavigation(to, from, failure) {
  if (failure || !to.meta.requiresAuth) {
    return
  }
  const authStore = useAuthStore()
  if (authStore.isSignedIn) {
    // A query-only change on the same staff path (a filter, a sort, a page) is not a click into
    // /staff: it keeps the cached 'navigation' re-check (one uncached read per staff navigation).
    const reason =
      requiresFreshProfile(to.meta) && to.path !== from.path ? 'staff-navigation' : 'navigation'
    void authStore.revalidateProfile({ reason })
  }
}
