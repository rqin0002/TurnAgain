import { useRouter } from 'vue-router'

import { resolveSafeRedirect } from '../features/auth/router/authGuard.js'

/**
 * Returns to a known application history entry, with a useful direct-link fallback.
 * Checking Vue Router's entry avoids sending a newly opened detail tab off-site.
 *
 * @param {import('vue-router').RouteLocationRaw} fallbackRoute - Parent listing route.
 * @returns {{ goBack: () => void }} A handler for an explicit Back control.
 */
export function useBackNavigation(fallbackRoute) {
  const router = useRouter()

  const goBack = () => {
    const backPath = resolveSafeRedirect(router.options.history.state.back, router)
    if (backPath && backPath !== router.currentRoute.value.fullPath) {
      router.back()
    } else {
      void router.replace(fallbackRoute)
    }
  }

  return { goBack }
}
