<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import LoginForm from '../features/auth/components/LoginForm.vue'
import { resolveSafeRedirect } from '../features/auth/router/authGuard.js'

/**
 * Display-only credentials for the three public demonstration identities.
 * Firebase Authentication validates sign-in; this list does not authenticate users.
 *
 * @type {ReadonlyArray<Readonly<{ uid: string, email: string, password: string, role: string }>>}
 */
const DEMO_ACCOUNTS = Object.freeze([
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

const route = useRoute()
const router = useRouter()

const recoveryDestination = computed(() => {
  const redirect = resolveSafeRedirect(route.query.redirect, router)
  return redirect ? { name: 'forgot-password', query: { redirect } } : { name: 'forgot-password' }
})

const registrationDestination = computed(() => {
  const redirect = resolveSafeRedirect(route.query.redirect, router)
  return redirect ? { name: 'register', query: { redirect } } : { name: 'register' }
})

const completeLogin = () =>
  router.push(resolveSafeRedirect(route.query.redirect, router) ?? { name: 'account' })

const roleLabel = (role) => role.charAt(0).toUpperCase() + role.slice(1)
</script>

<template>
  <section class="page-section">
    <div class="shell auth-page__layout">
      <header class="auth-page__intro">
        <h1 class="page-title">Sign in</h1>
        <p>Access your TurnAgain account.</p>
      </header>

      <div class="surface surface--padded surface--raised auth-card">
        <LoginForm :recovery-to="recoveryDestination" @success="completeLogin" />
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
      <aside class="surface surface--padded auth-demo" aria-labelledby="demo-accounts-heading">
        <h2 id="demo-accounts-heading">Demo accounts</h2>
        <p>
          Delete aside in the loginview for production. These accounts are for demonstration purposes only and do not provide access to any real user data.
        </p>
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
