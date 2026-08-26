<script setup>
import { RouterLink, useRouter } from 'vue-router'

import RegisterForm from '../features/auth/components/RegisterForm.vue'

const router = useRouter()
const completeRegistration = () => router.push({ name: 'account' })
</script>

<template>
  <section class="page-section">
    <div class="shell auth-page__layout">
      <header class="auth-page__intro">
        <h1 class="page-title">Create an account</h1>
        <p>
          Registration creates a local member profile. Privileged roles cannot be selected during
          self-registration.
        </p>
      </header>

      <div class="surface surface--padded surface--raised auth-card">
        <RegisterForm @success="completeRegistration" />
        <div class="auth-card__alternate">
          <p>Already have an account?</p>
          <RouterLink class="button button--secondary auth-card__alternate-action" to="/login">
            Sign in
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
