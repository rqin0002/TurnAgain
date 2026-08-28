<script setup>
import { RouterLink, useRoute, useRouter } from 'vue-router'

import LoginForm from '../features/auth/components/LoginForm.vue'
import { DEMO_ACCOUNTS } from '../features/auth/data/demoAccounts.js'
import { resolveSafeRedirect } from '../features/auth/router/authGuard.js'

const route = useRoute()
const router = useRouter()

const completeLogin = () =>
  router.push(resolveSafeRedirect(route.query.redirect, router) ?? { name: 'account' })

const roleLabel = (role) => role.charAt(0).toUpperCase() + role.slice(1)
</script>

<template>
  <section class="page-section">
    <div class="shell auth-page__layout">
      <header class="auth-page__intro">
        <h1 class="page-title">Sign in</h1>
        <p>Access your  TurnAgain account</p>
      </header>

      <div class="surface surface--padded surface--raised auth-card">
        <LoginForm @success="completeLogin" />
        <div class="auth-card__alternate">
          <p>New to TurnAgain?</p>
          <RouterLink class="button button--secondary auth-card__alternate-action" to="/register">
            Register
          </RouterLink>
        </div>
      </div>
      <!-- Delete aside part after all project finish -->
      <aside class="surface surface--padded auth-demo" aria-labelledby="demo-accounts-heading">
        <h2 id="demo-accounts-heading">Local demo accounts</h2>
        <p>Delete aside part in LoginView.vue for final release</p>
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
