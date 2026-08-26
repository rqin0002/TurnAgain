<template>
  <section class="page-section">
    <div class="shell reading-width forbidden-page">
      <h1 class="page-title">You do not have access to that page.</h1>
      <p>Your current account role is not in the route's explicit allowlist.</p>
      <div class="page-actions">
        <RouterLink class="button button--primary" to="/account">Go to your account</RouterLink>
        <RouterLink class="button button--secondary" to="/">Return to Find nearby</RouterLink>
      </div>
    </div>
  </section>
</template>
