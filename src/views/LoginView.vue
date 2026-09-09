<script setup>
import { computed, nextTick, onScopeDispose, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import AuthFormField from '../features/auth/components/AuthFormField.vue'
import { AuthError } from '../features/auth/data/AuthError.js'
import { validateLoginInput } from '../features/auth/domain/authValidation.js'
import { resolveSafeRedirect } from '../features/auth/router/authGuard.js'
import { useAuthStore } from '../features/auth/stores/authStore.js'

/**
 * Development-only credentials for the three public demonstration identities.
 * Firebase Authentication validates sign-in; this list does not authenticate users.
 * The build-time branch removes the credentials from production JavaScript.
 *
 * @type {ReadonlyArray<Readonly<{ uid: string, email: string, password: string, role: string }>>}
 */
const DEMO_ACCOUNTS = import.meta.env.DEV
  ? Object.freeze([
      Object.freeze({
        uid: 'user-member-demo',
        email: 'member@turnagain.test',
        password: 'Qwer1234!',
        role: 'member',
      }),
      Object.freeze({
        uid: 'user-staff-demo',
        email: 'staff@turnagain.test',
        password: 'Qwer1234!',
        role: 'staff',
      }),
      Object.freeze({
        uid: 'user-admin-demo',
        email: 'admin@turnagain.test',
        password: 'Qwer1234!',
        role: 'admin',
      }),
    ])
  : []

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const form = ref(null)
const isSubmitting = ref(false)
const summary = ref('')
const verificationNotice = ref(
  authStore.consumeRegistrationNotice()
    ? 'Account created. Please verify your email address using the link in your email, then sign in. Check your spam folder if you cannot find it.'
    : '',
)
const fields = reactive({ email: '', password: '' })
const errors = reactive({ email: '', password: '' })
const pending = computed(() => isSubmitting.value || authStore.operationStatus === 'logging-in')
let isPageActive = true

onScopeDispose(() => {
  // Finishing sign-in must not redirect someone who has already left this page.
  isPageActive = false
})

const recoveryDestination = computed(() => {
  const redirect = resolveSafeRedirect(route.query.redirect, router)
  return redirect ? { name: 'forgot-password', query: { redirect } } : { name: 'forgot-password' }
})

const registrationDestination = computed(() => {
  const redirect = resolveSafeRedirect(route.query.redirect, router)
  return redirect ? { name: 'register', query: { redirect } } : { name: 'register' }
})

const updateField = (field, value) => {
  fields[field] = value
  errors[field] = ''
}

const focusFirstInvalid = async () => {
  const field = ['email', 'password'].find((name) => errors[name])
  await nextTick()
  form.value?.querySelector(`[name="${field}"]`)?.focus()
}

const readSubmittedFields = () => {
  const submitted = form.value ? new FormData(form.value) : null
  const email = submitted?.get('email')
  const password = submitted?.get('password')

  return {
    email: typeof email === 'string' ? email : fields.email,
    password: typeof password === 'string' ? password : fields.password,
  }
}

const submit = async () => {
  if (pending.value) {
    return
  }

  summary.value = ''
  verificationNotice.value = ''
  // Read native controls at submit time because password managers can autofill
  // without dispatching the input event that normally updates Vue state.
  const submittedFields = readSubmittedFields()
  Object.assign(fields, submittedFields)
  const validation = validateLoginInput(submittedFields)
  Object.assign(errors, validation.errors)

  if (!validation.isValid) {
    summary.value = 'Check the highlighted fields and try again.'
    await focusFirstInvalid()
    return
  }

  isSubmitting.value = true
  try {
    const user = await authStore.login({
      email: validation.values.email,
      password: submittedFields.password,
    })

    if (user) {
      if (isPageActive) {
        await router.push(resolveSafeRedirect(route.query.redirect, router) ?? { name: 'account' })
      }
      return
    }

    if (authStore.errorMessage === new AuthError('email-unverified').message) {
      verificationNotice.value = authStore.errorMessage
    } else {
      summary.value = authStore.errorMessage || 'Email or password is incorrect.'
    }
  } catch {
    summary.value = 'Authentication is temporarily unavailable.'
  } finally {
    isSubmitting.value = false
  }
}

const roleLabel = (role) => role.charAt(0).toUpperCase() + role.slice(1)
</script>

<template>
  <section class="page-section">
    <div class="shell auth-page__layout">
      <header class="auth-page__intro">
        <h1 class="page-title">Sign in</h1>
        <p>Welcome back. Sign in to share your experience.</p>
      </header>

      <div class="surface surface--padded auth-card">
        <form ref="form" class="auth-form" novalidate :aria-busy="pending" @submit.prevent="submit">
          <div
            v-if="verificationNotice"
            class="auth-form__summary auth-form__summary--info"
            role="status"
            aria-live="polite"
          >
            {{ verificationNotice }}
          </div>
          <div v-if="summary" class="auth-form__summary" role="alert" aria-live="assertive">
            {{ summary }}
          </div>

          <AuthFormField
            id="login-email"
            :model-value="fields.email"
            name="email"
            type="email"
            label="Email address"
            autocomplete="username"
            :spellcheck="false"
            required
            :disabled="pending"
            :error="errors.email"
            @update:model-value="updateField('email', $event)"
          />

          <AuthFormField
            id="login-password"
            :model-value="fields.password"
            name="password"
            type="password"
            label="Password"
            autocomplete="current-password"
            required
            :disabled="pending"
            :error="errors.password"
            @update:model-value="updateField('password', $event)"
          />

          <div class="auth-form__recovery">
            <RouterLink :to="recoveryDestination">Forgot your password?</RouterLink>
          </div>

          <button
            class="button button--primary auth-form__submit"
            type="submit"
            :disabled="pending"
          >
            <span
              v-if="pending"
              class="auth-form__spinner"
              data-testid="auth-pending-indicator"
              aria-hidden="true"
            ></span>
            {{ pending ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
        <div class="auth-card__alternate">
          <p>New to TurnAgain?</p>
          <RouterLink
            class="button button--secondary auth-card__alternate-action"
            :to="registrationDestination"
          >
            Register
          </RouterLink>
        </div>
      </div>
      <aside
        v-if="DEMO_ACCOUNTS.length"
        class="surface surface--padded auth-demo"
        aria-labelledby="demo-accounts-heading"
      >
        <h2 id="demo-accounts-heading">Demo accounts</h2>
        <dl>
          <div v-for="account in DEMO_ACCOUNTS" :key="account.uid">
            <dt>{{ roleLabel(account.role) }}</dt>
            <dd>
              <code>{{ account.email }}</code> / <code>{{ account.password }}</code>
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  </section>
</template>
