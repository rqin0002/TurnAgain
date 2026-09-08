<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { useAuthStore } from './features/auth/stores/authStore.js'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { isAuthenticated, operationStatus } = storeToRefs(authStore)
const canAccessStaff = computed(() => authStore.hasAnyRole(['staff', 'admin']))
const canRenderRoute = computed(
  () =>
    !route.meta.requiresAuth ||
    (isAuthenticated.value && authStore.hasAnyRole(route.meta.allowedRoles)),
)
const lastSearchPath = ref('/')
const lastActivitiesPath = ref('/activities')
const lastStaffPath = ref('/staff')
const menuOpen = ref(false)
const menuButton = ref(null)
const isDiscoveryRoute = computed(() =>
  ['home', 'find-nearby', 'service-detail'].includes(route.name),
)

const closeMenu = () => {
  if (menuOpen.value) {
    menuOpen.value = false
    menuButton.value?.focus()
  }
}

// Remember URL-backed working state only while this app shell is mounted.
// This preserves public search privacy while allowing staff to return to the
// same operational filters after visiting another page.
watch(
  () => route.fullPath,
  (fullPath) => {
    menuOpen.value = false
    if (route.name === 'find-nearby') {
      lastSearchPath.value = fullPath
    }
    if (route.name === 'activities') {
      lastActivitiesPath.value = fullPath
    }
    if (route.name === 'staff') {
      lastStaffPath.value = fullPath
    }
  },
  { immediate: true },
)

// Route guards run on navigation, not when Firebase changes the session in a
// different tab. Hide protected content immediately and recheck settled sessions.
watch(
  () => [authStore.user, authStore.status, operationStatus.value],
  () => {
    if (
      authStore.status === 'restoring' ||
      operationStatus.value !== 'idle' ||
      canRenderRoute.value
    ) {
      return
    }

    void router.replace(
      isAuthenticated.value
        ? { name: 'forbidden' }
        : { name: 'login', query: { redirect: route.fullPath } },
    )
  },
  { flush: 'post' },
)
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>

  <header class="app-header" @keydown.esc="closeMenu">
    <div class="shell app-header__inner">
      <RouterLink class="brand" to="/" aria-label="TurnAgain home">
        <span>TurnAgain</span>
      </RouterLink>

      <button
        ref="menuButton"
        class="menu-toggle"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="primary-navigation"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? 'Close menu' : 'Menu' }}
      </button>

      <nav
        id="primary-navigation"
        class="primary-nav"
        :class="{ 'primary-nav--open': menuOpen }"
        aria-label="Primary navigation"
      >
        <RouterLink :to="lastSearchPath" :class="{ 'is-current': isDiscoveryRoute }"
          >Find nearby</RouterLink
        >
        <RouterLink
          :to="lastActivitiesPath"
          :class="{ 'is-current': ['activities', 'activity-detail'].includes(route.name) }"
          >Activities</RouterLink
        >
        <RouterLink to="/guides">Guides</RouterLink>
        <RouterLink to="/about">About &amp; help</RouterLink>
        <template v-if="isAuthenticated">
          <RouterLink v-if="canAccessStaff" :to="lastStaffPath">Staff</RouterLink>
          <RouterLink to="/account">Account</RouterLink>
        </template>
        <template v-else>
          <RouterLink to="/login">Login</RouterLink>
        </template>
      </nav>
    </div>
  </header>

  <main id="main-content" tabindex="-1">
    <RouterView v-if="canRenderRoute" />
    <p v-else class="shell page-section" role="status">Checking your session…</p>
  </main>

  <footer class="app-footer">
    <div class="shell app-footer__inner">
      <div class="app-footer__mission">
        <RouterLink class="footer-brand" to="/">TurnAgain</RouterLink>
      </div>
      <p class="app-footer__note"><br />Copyright © TurnAgain. All rights reserved.</p>
    </div>
  </footer>
</template>

<style scoped>
.app-header {
  position: relative;
  z-index: 10;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);
}

.app-header__inner {
  display: flex;
  min-height: 4.5rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding-block: 0.65rem;
}

.brand {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0;
  color: var(--color-heading);
  font-size: 1.5rem;
  font-weight: 650;
  letter-spacing: -0.05em;
  text-decoration: none;
}

.menu-toggle {
  display: none;
  min-height: 2.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-small);
  background: transparent;
  padding: 0.5rem 0.85rem;
  color: var(--color-heading);
  font-weight: 600;
}

.primary-nav {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 1.75rem;
  /* A wrapped desktop navigation line stays anchored to the shell's inline end. */
  margin-inline-start: auto;
}

.primary-nav a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  border-bottom: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  padding: 0.45rem 0;
  color: var(--color-text);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}

.primary-nav a:hover,
.primary-nav a.router-link-exact-active,
.primary-nav a.is-current {
  border-bottom-color: currentColor;
  color: var(--color-brand-strong);
}

@media (max-width: 899px) {
  .app-header__inner {
    min-height: 4.25rem;
    gap: 0;
    padding-block: 0.75rem;
  }

  .brand {
    font-size: 1.375rem;
  }

  .menu-toggle {
    display: inline-flex;
    align-items: center;
  }

  .primary-nav {
    display: none;
    width: 100%;
    margin-inline-start: 0;
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
  }

  .primary-nav--open {
    display: grid;
  }

  .primary-nav a {
    min-height: 3rem;
    width: fit-content;
    max-width: 100%;
    padding-inline: 0;
    font-size: 1rem;
  }
}

.app-footer {
  margin-top: auto;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.app-footer__inner {
  display: grid;
  gap: 1.5rem;
  padding-block: 2rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

.app-footer p {
  margin: 0;
}

.app-footer__mission {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.5rem;
}

.footer-brand {
  color: var(--color-heading);
  font-size: 1.125rem;
  letter-spacing: -0.045em;
  text-decoration: none;
}

.app-footer__note {
  font-size: 0.75rem;
}

@media (min-width: 576px) {
  .app-footer__inner {
    grid-template-columns: 1fr auto;
    align-items: center;
  }

  .app-footer__note {
    text-align: right;
  }
}
</style>
