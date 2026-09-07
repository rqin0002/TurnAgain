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
    <div class="shell reading-width">
      <h1 class="page-title">Your account</h1>
      <p class="account-page__lead">This public profile is read from the current local session.</p>

      <dl class="surface surface--padded profile-list">
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

      <p v-if="logoutError" class="auth-form__summary" role="alert">{{ logoutError }}</p>
      <div class="page-actions">
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
