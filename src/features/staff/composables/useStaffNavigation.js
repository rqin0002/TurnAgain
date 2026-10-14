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
  'staff-members': 'members',
})

/**
 * The /staff sub-navigation: the section the current route belongs to, and how the two admin
 * account pages (Team and Members) appear: hidden for staff, links for an admin in a build with
 * Cloud Functions, the text "Team and Members (not enabled in this deployment)" for an admin
 * without them. The route meta and the rules decide access; this only decides what is shown.
 *
 * @returns {{ currentSection: import('vue').ComputedRef<'overview' | 'services' | 'sessions' | 'corrections' | 'team' | 'members' | null>, accounts: import('vue').ComputedRef<'hidden' | 'link' | 'disabled'> }}
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

  const accounts = computed(() => {
    if (!authStore.canAccess(['admin'])) {
      return 'hidden'
    }
    return isStaffFunctionsEnabled() ? 'link' : 'disabled'
  })

  return { currentSection, accounts }
}
