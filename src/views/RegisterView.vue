<script setup>
import '@/features/auth/styles/auth.css'

import { computed, onScopeDispose } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { useAuthForm } from '@/features/auth/composables/useAuthForm.js'
import { PASSWORD_RULE, validateRegistrationInput } from '@/features/auth/domain/authValidation.js'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'
import { resolveSafeRedirect } from '@/shared/domain/safeRedirect.js'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

let isPageActive = true
onScopeDispose(() => {
  isPageActive = false
})

const redirectTarget = computed(() => resolveSafeRedirect(route.query.redirect, router))
const loginDestination = computed(() =>
  redirectTarget.value
    ? { name: 'login', query: { redirect: redirectTarget.value } }
    : { name: 'login' },
)

const { values, errors, summary, submitting, submit } = useAuthForm({
  initial: { displayName: '', email: '', password: '', passwordConfirmation: '' },
  validate: validateRegistrationInput,
  submit: async (validated, raw) => {
    const outcome = await authStore.register({
      displayName: validated.displayName,
      email: validated.email,
      password: raw.password,
      redirect: redirectTarget.value ?? null,
    })
    if (outcome === 'registered' && isPageActive) {
      // The sign-in page reads ?registered=1 (spec 9.2); the store never signs a new account in.
      // A 'superseded' registration (another identity signed in from a second tab while the
      // email was sending) navigates nowhere: the store holds that session and the guest-only
      // route handles this page.
      await router.replace({
        name: 'login',
        query: {
          registered: '1',
          ...(redirectTarget.value ? { redirect: redirectTarget.value } : {}),
        },
      })
    }
  },
})
</script>

<template>
  <section class="page-section">
    <div class="shell auth-page__layout">
      <header class="auth-page__intro">
        <h1 class="page-title">Create an account</h1>
        <p>Save services, rate them and book activity sessions.</p>
      </header>

      <div class="surface surface--padded auth-card">
        <form class="auth-form" novalidate :aria-busy="submitting" @submit.prevent="submit">
          <p v-if="summary" class="auth-form__summary" role="alert" tabindex="-1" data-form-summary>
            {{ summary }}
          </p>

          <FormField id="register-display-name" label="Name" :error="errors.displayName" required>
            <template #default="{ control }">
              <input
                v-bind="control"
                v-model="values.displayName"
                class="form-control"
                name="displayName"
                type="text"
                autocomplete="name"
                dir="auto"
              />
            </template>
          </FormField>

          <FormField id="register-email" label="Email address" :error="errors.email" required>
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

          <FormField
            id="register-password"
            label="Password"
            :hint="PASSWORD_RULE"
            :error="errors.password"
            required
          >
            <template #default="{ control }">
              <input
                v-bind="control"
                v-model="values.password"
                class="form-control"
                name="password"
                type="password"
                autocomplete="new-password"
              />
            </template>
          </FormField>

          <FormField
            id="register-password-confirmation"
            label="Confirm password"
            :error="errors.passwordConfirmation"
            required
          >
            <template #default="{ control }">
              <input
                v-bind="control"
                v-model="values.passwordConfirmation"
                class="form-control"
                name="passwordConfirmation"
                type="password"
                autocomplete="new-password"
              />
            </template>
          </FormField>

          <AppButton class="auth-form__submit" variant="primary" type="submit" :busy="submitting">
            {{ submitting ? 'Creating account…' : 'Create account' }}
          </AppButton>
        </form>
        <div class="auth-card__alternate">
          <p>Already have an account?</p>
          <RouterLink
            class="button button--secondary auth-card__alternate-action"
            :to="loginDestination"
          >
            Sign in
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
