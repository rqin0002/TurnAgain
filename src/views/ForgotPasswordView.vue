<script setup>
import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import PasswordResetForm from '../features/auth/components/PasswordResetForm.vue'
import { resolveSafeRedirect } from '../features/auth/router/authGuard.js'

const route = useRoute()
const router = useRouter()
const requested = ref(false)
const successPanel = ref(null)

const loginDestination = computed(() => {
  const redirect = resolveSafeRedirect(route.query.redirect, router)
  return redirect ? { name: 'login', query: { redirect } } : { name: 'login' }
})

const completeRequest = async () => {
  requested.value = true
  await nextTick()
  successPanel.value?.focus()
}

const resetForm = () => {
  requested.value = false
}
</script>

<template>
  <section class="page-section">
    <div class="shell auth-page__layout">
      <header class="auth-page__intro">
        <h1 class="page-title">Reset your password</h1>
        <p>Enter the email address you use for TurnAgain.</p>
      </header>

      <div class="surface surface--padded surface--raised auth-card">
        <template v-if="!requested">
          <PasswordResetForm @success="completeRequest" />
          <div class="auth-card__alternate">
            <p>Remembered your password?</p>
            <RouterLink
              class="button button--secondary auth-card__alternate-action"
              :to="loginDestination"
            >
              Back to sign in
            </RouterLink>
          </div>
        </template>

        <div
          v-else
          ref="successPanel"
          class="auth-recovery__success"
          role="status"
          aria-live="polite"
          tabindex="-1"
        >
          <div>
            <h2>Check your inbox</h2>
            <p>
              If an eligible account matches that address, Firebase will send password reset
              instructions. Check your spam folder if the message does not arrive shortly.
            </p>
          </div>

          <div class="auth-recovery__actions">
            <RouterLink class="button button--primary" :to="loginDestination">
              Back to sign in
            </RouterLink>
            <button class="button button--secondary" type="button" @click="resetForm">
              Try another email
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.auth-recovery__success {
  display: grid;
  gap: 1.25rem;
}

.auth-recovery__success h2 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.35rem;
}

.auth-recovery__success p {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
}

.auth-recovery__actions {
  display: grid;
  gap: 0.75rem;
}

@media (min-width: 30rem) {
  .auth-recovery__actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
