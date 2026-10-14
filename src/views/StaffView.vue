<script setup>
import { computed, onMounted, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import { useStaffNavigation } from '@/features/staff/composables/useStaffNavigation.js'

/**
 * The /staff layout: heading, what this workspace is for, the sub-navigation and the child route.
 * The sub-navigation is one row in a fixed order: the Overview, the daily sections every staff
 * account uses (Services, Sessions, Corrections), then, for admins only, Team and Members. Hiding
 * a link is not the permission: the parent route carries the role meta and the children inherit
 * it; `staff-team` and `staff-members` narrow it to admins, and the rules and the callables are
 * the boundary. No entry suggests that a record belongs to
 * someone: no record has an owner. The links are paths, not names, because a RouterLink to an
 * unregistered name throws.
 */
const { currentSection, accounts } = useStaffNavigation()
const currentFor = (section) => (currentSection.value === section ? 'page' : undefined)
const showsPlatform = computed(() => accounts.value !== 'hidden')

const DAILY_SUMMARY =
  "Keep services, activities, sessions and corrections accurate, and run the bookings of TurnAgain's own sessions."
const PLATFORM_SUMMARY = 'As an admin you also manage the team, member accounts and their roles.'
const description = computed(() =>
  showsPlatform.value ? `${DAILY_SUMMARY} ${PLATFORM_SUMMARY}` : DAILY_SUMMARY,
)

// The layout loads the staff catalogue once per mount and again after an identity change that
// keeps staff access; the catalogue itself empties on every epoch change.
const authStore = useAuthStore()
const catalogue = useStaffCatalogue()
onMounted(() => void catalogue.load())
watch(
  () => authStore.identityEpoch,
  () => void catalogue.load(),
)
</script>

<template>
  <div class="page-section">
    <div class="shell staff-page">
      <header class="staff-page__intro">
        <p class="eyebrow">TurnAgain / Staff</p>
        <h1 class="page-title">Staff workspace</h1>
        <p class="staff-page__description">{{ description }}</p>
      </header>

      <nav class="staff-page__register-nav" aria-label="Staff sections">
        <RouterLink to="/staff" :aria-current="currentFor('overview')">Overview</RouterLink>
        <RouterLink to="/staff/services" :aria-current="currentFor('services')"
          >Services</RouterLink
        >
        <RouterLink to="/staff/sessions" :aria-current="currentFor('sessions')"
          >Sessions</RouterLink
        >
        <RouterLink to="/staff/corrections" :aria-current="currentFor('corrections')"
          >Corrections</RouterLink
        >
        <template v-if="showsPlatform">
          <template v-if="accounts === 'link'">
            <RouterLink to="/staff/team" :aria-current="currentFor('team')">Team</RouterLink>
            <RouterLink to="/staff/members" :aria-current="currentFor('members')"
              >Members</RouterLink
            >
          </template>
          <span v-else class="staff-page__nav-disabled" aria-disabled="true"
            >Team and Members (not enabled in this deployment)</span
          >
        </template>
      </nav>

      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.staff-page__intro {
  max-width: 48rem;
}

.staff-page__intro .page-title {
  font-weight: 650;
  letter-spacing: -0.035em;
}

.staff-page__intro .eyebrow {
  color: var(--color-text-muted);
}

.staff-page__description {
  margin: 1rem 0 0;
  color: var(--color-text-muted);
  font-size: 1.0625rem;
}

/* One row of links that wraps on narrow screens; every link sits on the nav's bottom rule. */
.staff-page__register-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.25rem 1.25rem;
  margin-top: clamp(2rem, 4vw, 3rem);
  margin-bottom: clamp(1.5rem, 3vw, 2rem);
  border-bottom: 1px solid var(--color-border);
}

.staff-page__register-nav a,
.staff-page__nav-disabled {
  display: inline-flex;
  min-height: 3.25rem;
  align-items: center;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 0.75rem 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}

.staff-page__register-nav a:hover,
.staff-page__register-nav a[aria-current='page'] {
  border-bottom-color: var(--color-brand);
  color: var(--color-brand);
}

.staff-page__nav-disabled {
  font-weight: 400;
  cursor: default;
}

@media (min-width: 576px) {
  .staff-page__register-nav {
    gap: 0.5rem 2rem;
  }

  .staff-page__register-nav a,
  .staff-page__nav-disabled {
    font-size: 0.9375rem;
  }
}
</style>
