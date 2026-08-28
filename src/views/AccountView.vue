<script setup>
import { useAuthStore } from '../features/auth/stores/authStore.js'

const authStore = useAuthStore()
</script>

<template>
  <section class="page-section">
    <div class="shell reading-width">
      <h1 class="page-title">Your account</h1>
      <p class="account-page__lead">
        This public profile is read from the current local session.
      </p>

      <dl class="surface surface--padded profile-list">
        <div>
          <dt>Display name</dt>
          <dd>{{ authStore.user?.displayName }}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{{ authStore.user?.email }}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{{ authStore.user?.role }}</dd>
        </div>
      </dl>

      <p class="auth-boundary-note">
        This is account route.
      </p>
    </div>
  </section>
</template>
