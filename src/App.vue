<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { firebaseConfigProblem } from '@/firebase/firebaseClient.js'
import AppButton from '@/shared/components/AppButton.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import OfflineBanner from '@/shared/components/OfflineBanner.vue'
import { useOnlineStatus } from '@/shared/composables/useOnlineStatus.js'
import { animateNavIndicator } from '@/shared/motion/index.js'

const route = useRoute()
const authStore = useAuthStore()
const { online } = useOnlineStatus()

// The header underline is an explicit effect (spec 10.3): it glides after every navigation or
// sign-in state change (the link set changes) and is placed without a glide on a resize, where
// the link has not changed, only its layout.
const navigation = ref(null)
const settleIndicator = () => void animateNavIndicator(navigation.value)
const placeIndicator = () => void animateNavIndicator(navigation.value, { immediate: true })
watch(
  () => [route.fullPath, authStore.status],
  () => void nextTick(settleIndicator),
  { flush: 'post' },
)
onMounted(() => {
  settleIndicator()
  window.addEventListener('resize', placeIndicator)
})
onBeforeUnmount(() => window.removeEventListener('resize', placeIndicator))

// The Sign in / Account slot renders once the first resolution has settled (spec 10.5).
const sessionKnown = computed(() => authStore.status !== 'restoring')
const canAccessStaff = computed(() => authStore.canAccess(['staff', 'admin']))

// A protected page renders the retry panel instead of its view when the first resolution failed
// (spec 9.1); the guard let the navigation through for exactly this (decision M8).
const showAuthErrorPanel = computed(
  () => route.meta.requiresAuth === true && authStore.status === 'error',
)
const AUTH_ERROR_MESSAGES = Object.freeze({
  timeout: 'Your account took too long to load.',
  offline: 'You appear to be offline. Your account loads again when the connection returns.',
  'profile-unavailable': 'Your account details could not be loaded.',
})
const authErrorMessage = computed(
  () => AUTH_ERROR_MESSAGES[authStore.lastError] ?? AUTH_ERROR_MESSAGES['profile-unavailable'],
)
// A Retry pressed before the SDK reported the persisted user waits again in 'restoring'; the
// protected page already showing gets a loading panel, not a view without its user.
const showAuthRestoringPanel = computed(
  () => route.meta.requiresAuth === true && authStore.status === 'restoring',
)

// The banner's live region holds the sentence only (its Retry control sits beside it) and, once a
// sync attempt failed, says why the change is not finishing.
const emailSyncMessage = computed(() =>
  authStore.lastError
    ? `Finishing your email change… ${authErrorMessage.value}`
    : 'Finishing your email change…',
)
const syncing = ref(false)
const retryEmailSync = async () => {
  syncing.value = true
  try {
    await authStore.revalidateProfile({ reason: 'email-sync' })
  } finally {
    syncing.value = false
  }
}

// Remember URL-backed working state only while this shell is mounted, so Find nearby, Activities
// and the staff workspace reopen on the filters the person left (never persisted).
const lastSearchPath = ref('/find-nearby')
const lastActivitiesPath = ref('/activities')
const lastStaffPath = ref('/staff')
// A new identity (another account, a role change, a downgrade) never inherits the previous one's
// staff page or filters (N8).
watch(
  () => authStore.identityEpoch,
  () => {
    lastStaffPath.value = '/staff'
  },
)
const menuOpen = ref(false)
const menuButton = ref(null)
const isDiscoveryRoute = computed(() => ['find-nearby', 'service-detail'].includes(route.name))

const closeMenu = () => {
  if (menuOpen.value) {
    menuOpen.value = false
    menuButton.value?.focus()
  }
}

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
    if (typeof route.name === 'string' && route.name.startsWith('staff')) {
      lastStaffPath.value = fullPath
    }
  },
  { immediate: true },
)
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <OfflineBanner :online="online" />

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
        ref="navigation"
        id="primary-navigation"
        class="primary-nav"
        :class="{ 'primary-nav--open': menuOpen }"
        aria-label="Primary navigation"
      >
        <RouterLink to="/">Home</RouterLink>
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
        <template v-if="sessionKnown">
          <RouterLink v-if="canAccessStaff" :to="lastStaffPath">Staff</RouterLink>
          <RouterLink v-if="authStore.isSignedIn" to="/account">Account</RouterLink>
          <RouterLink v-else to="/login">Sign in</RouterLink>
        </template>
        <span class="primary-nav__indicator" data-navigation-indicator aria-hidden="true"></span>
      </nav>
    </div>
  </header>

  <main id="main-content" tabindex="-1">
    <div v-if="firebaseConfigProblem" class="shell page-section">
      <StatePanel variant="notice" title="TurnAgain can't start" :message="firebaseConfigProblem" />
    </div>
    <template v-else>
      <div v-if="authStore.emailSyncPending" class="shell app-banner">
        <p class="app-banner__text" role="status">{{ emailSyncMessage }}</p>
        <AppButton
          v-if="authStore.lastError"
          variant="text"
          type="button"
          :busy="syncing"
          @click="retryEmailSync"
        >
          Retry
        </AppButton>
      </div>
      <div v-if="showAuthErrorPanel" class="shell page-section">
        <StatePanel
          variant="error"
          title="Couldn't load your account"
          :message="authErrorMessage"
          retry-label="Retry"
          @retry="authStore.retry()"
        />
      </div>
      <div v-else-if="showAuthRestoringPanel" class="shell page-section">
        <StatePanel variant="loading" title="Loading your account" />
      </div>
      <RouterView v-else />
    </template>
  </main>

  <footer class="app-footer">
    <div class="shell app-footer__inner">
      <RouterLink class="footer-brand" to="/">TurnAgain</RouterLink>
      <nav class="app-footer__links" aria-label="Footer">
        <RouterLink to="/about">About</RouterLink>
        <RouterLink to="/about#checked">How information is checked</RouterLink>
        <RouterLink to="/about#contact">Contact and corrections</RouterLink>
        <RouterLink to="/accessibility">Accessibility</RouterLink>
        <RouterLink to="/about#privacy">Privacy</RouterLink>
        <RouterLink to="/about#api">Public API</RouterLink>
      </nav>
      <p class="app-footer__note">Copyright © TurnAgain. All rights reserved.</p>
    </div>
  </footer>
</template>

<style scoped>
/* Mobile first (spec 10.1): the menu button and the stacked list are the default; the inline
   navigation appears at the 992 px contract breakpoint. */
.app-header {
  position: relative;
  z-index: 10;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);
}

.app-header__inner {
  display: flex;
  min-height: var(--header-h);
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0;
  padding-block: 0.75rem;
}

.brand {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  color: var(--color-heading);
  font-size: 1.375rem;
  font-weight: 650;
  letter-spacing: -0.05em;
  text-decoration: none;
}

.menu-toggle {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-small);
  background: transparent;
  padding: 0.5rem 0.85rem;
  color: var(--color-heading);
  font-weight: 600;
  transition: background-color var(--duration-fast);
}

.menu-toggle:active {
  background: var(--color-brand-soft);
  transition-duration: var(--duration-press);
}

.primary-nav {
  position: relative;
  display: none;
  width: 100%;
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
}

.primary-nav--open {
  display: grid;
}

/* The indicator span is measured by animateNavIndicator; the CSS shows it only on the inline
   (desktop) navigation, where `position: relative` above is its containing block. */
.primary-nav__indicator {
  display: none;
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  background: var(--color-brand-strong);
  pointer-events: none;
}

.primary-nav a {
  display: inline-flex;
  min-height: 3rem;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  border-bottom: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  padding: 0.45rem 0;
  color: var(--color-text);
  font-size: 1rem;
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

@media (min-width: 992px) {
  .app-header__inner {
    min-height: var(--header-h);
    gap: 1rem;
    padding-block: 0.65rem;
  }

  .brand {
    font-size: 1.5rem;
  }

  .menu-toggle {
    display: none;
  }

  .primary-nav,
  .primary-nav--open {
    display: flex;
    width: auto;
    min-width: 0;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 1.75rem;
    margin-top: 0;
    margin-inline-start: auto;
    padding-top: 0;
    border-top: 0;
  }

  .primary-nav a {
    min-height: 2.75rem;
    font-size: 0.875rem;
  }

  .primary-nav[data-indicator-ready] .primary-nav__indicator {
    display: block;
  }

  .primary-nav[data-indicator-ready] a:is(.router-link-exact-active, .is-current) {
    border-bottom-color: transparent;
  }
}

.app-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-top: 1rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 0.75rem 1rem;
}

.app-banner__text {
  margin: 0;
}

.app-footer {
  margin-top: auto;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.app-footer__inner {
  display: grid;
  gap: 1.25rem;
  padding-block: 2rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

.app-footer p {
  margin: 0;
}

.footer-brand {
  color: var(--color-heading);
  font-size: 1.125rem;
  letter-spacing: -0.045em;
  text-decoration: none;
}

.app-footer__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
}

.app-footer__links a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

.app-footer__note {
  font-size: 0.75rem;
}

@media (min-width: 576px) {
  .app-footer__inner {
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  .app-footer__links {
    justify-content: flex-end;
  }

  .app-footer__note {
    grid-column: 1 / -1;
  }
}
</style>
