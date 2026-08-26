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
const logoutAlert = ref('')
const lastSearchPath = ref('/')

// Remember the complete submitted results URL only while this app shell is
// mounted, preserving search refinements without persisting location data.
watch(
  () => route.fullPath,
  (fullPath) => {
    if (route.name === 'find-nearby') {
      lastSearchPath.value = fullPath
    }
  },
  { immediate: true },
)

const logOut = async () => {
  if (operationStatus.value === 'logging-out') {
    return
  }

  logoutAlert.value = ''
  await authStore.logout()
  if (authStore.errorMessage) {
    logoutAlert.value =
      'You are signed out on this page, but the saved session may not have been cleared. Close this tab before using a shared device.'
  }
  await router.push('/')
}
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>

  <header class="app-header">
    <div class="shell app-header__inner">
      <RouterLink class="brand" to="/" aria-label="TurnAgain home">
        <span class="brand__mark" aria-hidden="true">↻</span>
        <span>TurnAgain</span>
      </RouterLink>

      <nav class="primary-nav" aria-label="Primary navigation">
        <RouterLink :to="lastSearchPath">Find nearby</RouterLink>
        <RouterLink to="/about">About &amp; help</RouterLink>
        <template v-if="isAuthenticated">
          <RouterLink v-if="canAccessStaff" to="/staff">Staff</RouterLink>
          <RouterLink to="/account">Account</RouterLink>
          <button
            class="primary-nav__button"
            type="button"
            :disabled="operationStatus === 'logging-out'"
            @click="logOut"
          >
            {{ operationStatus === 'logging-out' ? 'Logging out…' : 'Log out' }}
          </button>
        </template>
        <template v-else>
          <RouterLink to="/login">Login</RouterLink>
        </template>
      </nav>
    </div>
  </header>

  <div v-if="logoutAlert" class="shell session-alert" role="alert" aria-live="assertive">
    {{ logoutAlert }}
  </div>

  <main id="main-content" tabindex="-1">
    <RouterView />
  </main>

  <footer class="app-footer">
    <div class="shell app-footer__inner">
      <p><strong>TurnAgain</strong> — Keeping useful things in circulation.</p>
      <p>From 2026</p>
    </div>
  </footer>
</template>

<style scoped>
.app-header {
  position: relative;
  z-index: 10;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 96%, transparent);
}

.app-header__inner {
  display: flex;
  min-height: 4.25rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding-block: 0.6rem;
}

.brand {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 850;
  letter-spacing: -0.02em;
  text-decoration: none;
}

.brand__mark {
  display: inline-grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 50%;
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
  font-size: 1.35rem;
}

.primary-nav {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.25rem;
  /* A wrapped desktop navigation line stays anchored to the shell's inline end. */
  margin-inline-start: auto;
}

.primary-nav a,
.primary-nav__button {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  border: 0;
  border-radius: var(--radius-small);
  background: transparent;
  padding: 0.45rem 0.6rem;
  color: var(--color-text);
  font-size: 0.875rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.primary-nav a:hover,
.primary-nav a.router-link-exact-active,
.primary-nav__button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
}

.primary-nav__button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.session-alert {
  margin-top: 1rem;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-small);
  background: var(--color-danger-soft);
  padding: 0.75rem 1rem;
  color: var(--color-danger);
}

@media (max-width: 420px) {
  .app-header__inner {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.5rem;
  }

  .primary-nav {
    width: 100%;
    margin-inline-start: 0;
    justify-content: flex-start;
    gap: 0;
  }

  .primary-nav a,
  .primary-nav__button {
    padding-inline: 0.45rem;
    font-size: 0.8rem;
  }
}

.app-footer {
  margin-top: auto;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.app-footer__inner {
  display: grid;
  gap: 0.35rem;
  padding-block: 1.5rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.app-footer p {
  margin: 0;
}

@media (min-width: 576px) {
  .primary-nav {
    gap: 0.5rem;
  }

  .primary-nav a,
  .primary-nav__button {
    padding-inline: 0.85rem;
    font-size: 0.95rem;
  }

  .app-footer__inner {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }

  .app-footer__inner p:last-child {
    text-align: right;
  }
}
</style>
