<script setup>
import '@/features/auth/styles/auth.css'

import { computed, nextTick, onScopeDispose, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { useAuthForm } from '@/features/auth/composables/useAuthForm.js'
import { validateLoginInput } from '@/features/auth/domain/authValidation.js'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { BOOKING_MESSAGES } from '@/features/bookings/domain/bookingMessages.js'
import { isBookingReviewPath } from '@/features/bookings/domain/bookingRules.js'
import { defaultDestination } from '@/router/authGuard.js'
import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'
import { describeError } from '@/shared/domain/errorCopy.js'
import { resolveSafeRedirect } from '@/shared/domain/safeRedirect.js'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

let isPageActive = true
onScopeDispose(() => {
  // A sign-in that finishes after the person left this page must not navigate them again.
  isPageActive = false
})

// The URL is the hand-off (spec 9.2): registration, verification and sign-out reasons arrive as
// queries, never as store state, so a reload or a second tab shows the same notice.
const QUERY_NOTICES = Object.freeze({
  registered:
    'Verification email sent. Open the link in it, then sign in. Check your spam folder if it does not arrive.',
  verified: 'Your email address is verified. Sign in to continue.',
})
const REASON_NOTICES = Object.freeze({
  'account-disabled':
    'Your account has been disabled. Contact TurnAgain if you think this is a mistake.',
})
const queryNotice = computed(() => {
  if (route.query.registered === '1') {
    return QUERY_NOTICES.registered
  }
  if (route.query.verified === '1') {
    return QUERY_NOTICES.verified
  }
  return ''
})
const reasonNotice = computed(() => REASON_NOTICES[route.query.reason] ?? '')

const redirectTarget = computed(() => resolveSafeRedirect(route.query.redirect, router))
// Spec 7.4 L940: the person came from "Book this session" and goes back to it after signing in.
const isBookingRedirect = computed(() => isBookingReviewPath(redirectTarget.value))
const withRedirect = (name) =>
  redirectTarget.value ? { name, query: { redirect: redirectTarget.value } } : { name }
const destination = () => redirectTarget.value ?? defaultDestination(authStore)

const form = ref(null)
const verificationNotice = ref('')
const resendNotice = ref('')
const resendPending = ref(false)

const { values, errors, summary, submitting, submit } = useAuthForm({
  initial: { email: '', password: '' },
  validate: validateLoginInput,
  submit: async (validated, raw) => {
    verificationNotice.value = ''
    resendNotice.value = ''
    try {
      const signedIn = await authStore.login({ email: validated.email, password: raw.password })
      // null: the store already replaced the route (account disabled or session ended).
      if (signedIn && isPageActive) {
        await router.push(destination())
      }
    } catch (error) {
      if (error?.code !== 'email-unverified') {
        throw error
      }
      verificationNotice.value = error.message
    }
  },
})

/** "Send the verification email again" is a sign-in attempt with the typed password (C4.12). */
const resendVerification = async () => {
  if (resendPending.value || submitting.value) {
    return
  }
  if (!values.password) {
    errors.password = 'Enter your password to send the verification email again.'
    await nextTick()
    form.value?.querySelector('[name="password"]')?.focus()
    return
  }
  resendPending.value = true
  summary.value = ''
  try {
    const outcome = await authStore.resendVerification({
      email: values.email,
      password: values.password,
    })
    if (outcome === 'signed-in' && isPageActive) {
      await router.push(destination())
      return
    }
    if (outcome === 'sent') {
      resendNotice.value = 'Verification email sent again. Open the link in it, then sign in.'
    }
  } catch (error) {
    // The notice above says the email went out; only the resend's own error may show now. Its
    // button leaves with it, so focus moves to the alert instead of dropping to the body.
    verificationNotice.value = ''
    summary.value = describeError(error)
    await nextTick()
    form.value?.querySelector('[data-form-summary]')?.focus()
  } finally {
    resendPending.value = false
  }
}
</script>

<template>
  <section class="page-section">
    <div class="shell auth-page__layout">
      <header class="auth-page__intro">
        <h1 class="page-title">Sign in</h1>
        <p>Welcome back. Sign in to save services and share your experience.</p>
      </header>

      <div class="surface surface--padded auth-card">
        <p v-if="isBookingRedirect" class="auth-form__summary auth-form__summary--info">
          {{ BOOKING_MESSAGES.signInToBook }}
        </p>
        <form
          ref="form"
          class="auth-form"
          novalidate
          :aria-busy="submitting"
          @submit.prevent="submit"
        >
          <p v-if="reasonNotice" class="auth-form__summary" role="alert">{{ reasonNotice }}</p>
          <p v-if="queryNotice" class="auth-form__summary auth-form__summary--info" role="status">
            {{ queryNotice }}
          </p>
          <div v-if="verificationNotice" class="auth-form__summary auth-form__summary--info">
            <p role="status">{{ verificationNotice }}</p>
            <AppButton
              variant="secondary"
              type="button"
              :busy="resendPending"
              @click="resendVerification"
            >
              Send the verification email again
            </AppButton>
          </div>
          <p v-if="resendNotice" class="auth-form__summary auth-form__summary--info" role="status">
            {{ resendNotice }}
          </p>
          <p v-if="summary" class="auth-form__summary" role="alert" tabindex="-1" data-form-summary>
            {{ summary }}
          </p>

          <FormField id="login-email" label="Email address" :error="errors.email" required>
            <template #default="{ control }">
              <input
                v-bind="control"
                v-model="values.email"
                class="form-control"
                name="email"
                type="email"
                autocomplete="username"
                spellcheck="false"
              />
            </template>
          </FormField>

          <FormField id="login-password" label="Password" :error="errors.password" required>
            <template #default="{ control }">
              <input
                v-bind="control"
                v-model="values.password"
                class="form-control"
                name="password"
                type="password"
                autocomplete="current-password"
              />
            </template>
          </FormField>

          <div class="auth-form__recovery">
            <RouterLink :to="withRedirect('forgot-password')">Forgot your password?</RouterLink>
          </div>

          <AppButton class="auth-form__submit" variant="primary" type="submit" :busy="submitting">
            {{ submitting ? 'Signing in…' : 'Sign in' }}
          </AppButton>
        </form>
        <div class="auth-card__alternate">
          <p>New to TurnAgain?</p>
          <RouterLink
            class="button button--secondary auth-card__alternate-action"
            :to="withRedirect('register')"
          >
            Register
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
