<script setup>
import { onMounted, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import { useStaffNavigation } from '@/features/staff/composables/useStaffNavigation.js'

/**
 * The /staff layout (spec 8.1 L977): heading, the sub-navigation and the child route. The parent
 * route carries the role meta and the children inherit it; `staff-team` narrows it to admins.
 * The links are paths, not names, because the child routes arrive task by task in milestone 6 and
 * a RouterLink to an unregistered name throws.
 */
const { currentSection, team } = useStaffNavigation()
const currentFor = (section) => (currentSection.value === section ? 'page' : undefined)

// The layout loads the staff catalogue once per mount and again after an identity change that
// keeps staff access (spec 8.1 L979); the catalogue itself empties on every epoch change.
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
        <p class="staff-page__description">Services, sessions, corrections and the team.</p>
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
        <RouterLink v-if="team === 'link'" to="/staff/team" :aria-current="currentFor('team')"
          >Team</RouterLink
        >
        <span v-else-if="team === 'disabled'" class="staff-page__nav-disabled" aria-disabled="true"
          >Team (not enabled in this deployment)</span
        >
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

.staff-page__register-nav {
  display: flex;
  flex-wrap: wrap;
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
