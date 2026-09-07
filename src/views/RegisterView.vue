<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import RegisterForm from '../features/auth/components/RegisterForm.vue'
import { resolveSafeRedirect } from '../features/auth/router/authGuard.js'

const route = useRoute()
const router = useRouter()
const loginDestination = computed(() => {
  const redirect = resolveSafeRedirect(route.query.redirect, router)
  return redirect ? { name: 'login', query: { redirect } } : { name: 'login' }
})
const completeRegistration = () =>
  router.push(resolveSafeRedirect(route.query.redirect, router) ?? { name: 'account' })
</script>

<template>
  <section class="page-section">
    <div class="shell auth-page__layout">
      <header class="auth-page__intro">
        <h1 class="page-title">Create an account</h1>
        <p>
          Registration creates a Firebase Authentication identity and an active Firestore member
          profile. Privileged roles cannot be selected during self-registration.
        </p>
      </header>

      <div class="surface surface--padded surface--raised auth-card">
        <RegisterForm @success="completeRegistration" />
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
