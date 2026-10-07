<script setup>
import '@/features/auth/styles/auth.css'

import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { useAuthForm } from '@/features/auth/composables/useAuthForm.js'
import { validatePasswordResetInput } from '@/features/auth/domain/authValidation.js'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'
import { resolveSafeRedirect } from '@/shared/domain/safeRedirect.js'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const requested = ref(false)
const successPanel = ref(null)

const loginDestination = computed(() => {
  const redirect = resolveSafeRedirect(route.query.redirect, router)
  return redirect ? { name: 'login', query: { redirect } } : { name: 'login' }
})

const { values, errors, summary, submitting, submit, reset } = useAuthForm({
  initial: { email: '' },
  validate: validatePasswordResetInput,
  submit: async (validated) => {
    await authStore.requestPasswordReset(validated.email)
    requested.value = true
    await nextTick()
    successPanel.value?.focus()
  },
})

const tryAnotherEmail = () => {
  reset()
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

      <div class="surface surface--padded auth-card">
        <template v-if="!requested">
          <form class="auth-form" novalidate :aria-busy="submitting" @submit.prevent="submit">
            <p
              v-if="summary"
              class="auth-form__summary"
              role="alert"
              tabindex="-1"
              data-form-summary
            >
              {{ summary }}
            </p>

            <FormField
              id="password-reset-email"
              label="Email address"
              :error="errors.email"
              required
            >
              <template #default="{ control }">
                <input
                  v-bind="control"
                  v-model="values.email"
                  class="form-control"
                  name="email"
                  type="email"
                  autocomplete="email"
                  spellcheck="false"
                />
              </template>
            </FormField>

            <AppButton class="auth-form__submit" variant="primary" type="submit" :busy="submitting">
              {{ submitting ? 'Sending reset link…' : 'Send reset link' }}
            </AppButton>
          </form>
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

        <div v-else ref="successPanel" class="auth-recovery__success" role="status" tabindex="-1">
          <div>
            <h2>Check your inbox</h2>
            <p>
              If an account matches that address, we have sent password reset instructions. Check
              your spam folder if the message does not arrive shortly.
            </p>
          </div>

          <div class="auth-recovery__actions">
            <RouterLink class="button button--primary" :to="loginDestination">
              Back to sign in
            </RouterLink>
            <AppButton variant="secondary" type="button" @click="tryAnotherEmail">
              Try another email
            </AppButton>
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

/* Breakpoint: the two actions sit side by side from 576 px. */
@media (min-width: 576px) {
  .auth-recovery__actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
