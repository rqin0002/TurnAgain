<script setup>
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '../features/auth/stores/authStore.js'

const authStore = useAuthStore()
const router = useRouter()
const logoutError = ref('')
const isBusy = computed(() => authStore.operationStatus !== 'idle')

const logOut = async () => {
  if (isBusy.value) {
    return
  }

  logoutError.value = ''
  if (await authStore.logout()) {
    // Let session observers settle before completing this explicit navigation.
    await nextTick()
    await router.replace({ name: 'home' })
  } else {
    logoutError.value = authStore.errorMessage
  }
}
</script>

<template>
  <section class="page-section">
    <div class="shell account-page">
      <header class="account-page__header">
        <h1 class="account-page__title">Your account</h1>
        <p class="account-page__lead">Your profile and account access, in one place.</p>
      </header>

      <section class="account-page__profile" aria-labelledby="account-profile-heading">
        <h2 id="account-profile-heading">Profile</h2>
        <dl class="account-page__details">
          <div>
            <dt>Name</dt>
            <dd>{{ authStore.user?.displayName }}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{{ authStore.user?.email }}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{{ authStore.user?.role }}</dd>
          </div>
        </dl>
      </section>

      <p v-if="logoutError" class="account-page__error" role="alert">{{ logoutError }}</p>
      <div class="account-page__actions">
        <button
          class="button button--secondary"
          type="button"
          :disabled="isBusy"
          :aria-busy="authStore.operationStatus === 'logging-out'"
          @click="logOut"
        >
          {{ authStore.operationStatus === 'logging-out' ? 'Logging out…' : 'Log out' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.account-page {
  max-width: 40rem;
}

.account-page__header {
  margin-bottom: 2rem;
}

.account-page__title {
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(2rem, 4vw, 2.5rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.15;
}

.account-page__lead {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.account-page__profile {
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 4vw, 2rem);
}

.account-page__profile h2 {
  margin: 0 0 1.5rem;
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.3;
}

.account-page__details {
  display: grid;
  margin: 0;
}

.account-page__details > div {
  display: grid;
  min-width: 0;
  gap: 0.375rem;
  padding-block: 1rem;
}

.account-page__details > div:first-child {
  padding-top: 0;
}

.account-page__details > div:last-child {
  padding-bottom: 0;
}

.account-page__details > div + div {
  border-top: 1px solid var(--color-border);
}

.account-page__details dt {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  font-weight: 400;
}

.account-page__details dd {
  min-width: 0;
  margin: 0;
  color: var(--color-heading);
  font-weight: 500;
  overflow-wrap: anywhere;
}

.account-page__actions {
  display: flex;
  margin-top: 1.5rem;
}

.account-page__error {
  margin: 1.5rem 0 0;
  border-radius: var(--radius-small);
  background: var(--color-danger-soft);
  padding: 0.875rem 1rem;
  color: var(--color-danger);
}

@media (min-width: 576px) {
  .account-page__details > div {
    grid-template-columns: 6rem minmax(0, 1fr);
    align-items: baseline;
    gap: 1.5rem;
  }
}
</style>
