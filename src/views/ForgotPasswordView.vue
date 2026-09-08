<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import AuthFormField from '../features/auth/components/AuthFormField.vue'
import { validatePasswordResetInput } from '../features/auth/domain/authValidation.js'
import { resolveSafeRedirect } from '../features/auth/router/authGuard.js'
import { useAuthStore } from '../features/auth/stores/authStore.js'

const route = useRoute()
const router = useRouter()
const requested = ref(false)
const successPanel = ref(null)
const authStore = useAuthStore()
const form = ref(null)
const isSubmitting = ref(false)
const summary = ref('')
const fields = reactive({ email: '' })
const errors = reactive({ email: '' })
const pending = computed(
  () => isSubmitting.value || authStore.operationStatus === 'requesting-password-reset',
)

const loginDestination = computed(() => {
  const redirect = resolveSafeRedirect(route.query.redirect, router)
  return redirect ? { name: 'login', query: { redirect } } : { name: 'login' }
})

const updateEmail = (value) => {
  fields.email = value
  errors.email = ''
}

const readSubmittedEmail = () => {
  const submitted = form.value ? new FormData(form.value).get('email') : null
  return typeof submitted === 'string' ? submitted : fields.email
}

const submit = async () => {
  if (pending.value) {
    return
  }

  summary.value = ''
  const submittedEmail = readSubmittedEmail()
  fields.email = submittedEmail
  const validation = validatePasswordResetInput({ email: submittedEmail })
  Object.assign(errors, validation.errors)

  if (!validation.isValid) {
    summary.value = 'Check the highlighted field and try again.'
    await nextTick()
    form.value?.querySelector('[name="email"]')?.focus()
    return
  }

  isSubmitting.value = true
  try {
    const sent = await authStore.requestPasswordReset({
      email: validation.values.email,
    })

    if (sent) {
      requested.value = true
      await nextTick()
      successPanel.value?.focus()
      return
    }

    summary.value =
      authStore.errorMessage || 'Password recovery is temporarily unavailable. Try again later.'
  } catch {
    summary.value = 'Password recovery is temporarily unavailable. Try again later.'
  } finally {
    isSubmitting.value = false
  }
}

const resetForm = () => {
  // The former child component reset on remount; keep that fresh-form behavior here.
  fields.email = ''
  errors.email = ''
  summary.value = ''
  isSubmitting.value = false
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
          <form
            ref="form"
            class="auth-form"
            novalidate
            :aria-busy="pending"
            @submit.prevent="submit"
          >
            <div v-if="summary" class="auth-form__summary" role="alert" aria-live="assertive">
              {{ summary }}
            </div>

            <AuthFormField
              id="password-reset-email"
              :model-value="fields.email"
              name="email"
              type="email"
              label="Email address"
              autocomplete="email"
              :spellcheck="false"
              required
              :disabled="pending"
              :error="errors.email"
              @update:model-value="updateEmail"
            />

            <button
              class="button button--primary auth-form__submit"
              type="submit"
              :disabled="pending"
            >
              <span v-if="pending" class="auth-form__spinner" aria-hidden="true"></span>
              {{ pending ? 'Sending reset link…' : 'Send reset link' }}
            </button>
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
              If an eligible account matches that address, We will send password reset
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
