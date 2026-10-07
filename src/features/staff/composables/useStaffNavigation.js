import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/features/auth/stores/authStore.js'

import { isStaffFunctionsEnabled } from '../data/staffCapabilities.js'

/** The sub-navigation section each staff route belongs to (the edit route decides by `kind`). */
const SECTION_OF_ROUTE = Object.freeze({
  'staff-overview': 'overview',
  'staff-services': 'services',
  'staff-service-new': 'services',
  'staff-sessions': 'sessions',
  'staff-session': 'sessions',
  'staff-session-new': 'sessions',
  'staff-activity-new': 'sessions',
  'staff-corrections': 'corrections',
  'staff-team': 'team',
})

/**
 * The /staff sub-navigation (spec 8.1 L977): the section the current route belongs to, and how
 * Team appears: hidden for staff, a link for an admin in a build with Cloud Functions, the text
 * "Team (not enabled in this deployment)" for an admin without them.
 *
 * @returns {{ currentSection: import('vue').ComputedRef<'overview' | 'services' | 'sessions' | 'corrections' | 'team' | null>, team: import('vue').ComputedRef<'hidden' | 'link' | 'disabled'> }}
 */
export function useStaffNavigation() {
  const route = useRoute()
  const authStore = useAuthStore()

  const currentSection = computed(() => {
    if (route.name === 'staff-record-edit') {
      return route.params.kind === 'services' ? 'services' : 'sessions'
    }
    return SECTION_OF_ROUTE[route.name] ?? null
  })

  const team = computed(() => {
    if (!authStore.canAccess(['admin'])) {
      return 'hidden'
    }
    return isStaffFunctionsEnabled() ? 'link' : 'disabled'
  })

  return { currentSection, team }
}
