<template>
  <section class="page-section">
    <div class="shell reading-width not-found">
      <p class="eyebrow">404</p>
      <h1 class="page-title">That page could not be found.</h1>
      <p>The link may be out of date, or the address may have been typed incorrectly.</p>
      <RouterLink class="button button--primary" to="/">Return to Find nearby</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.not-found p:not(.eyebrow) {
  margin: 1rem 0 1.5rem;
  color: var(--color-text-muted);
}
</style>
