<template>
  <section class="page-section">
    <div class="shell reading-width about-page">
      <p class="eyebrow">About &amp; help</p>
      <h1 class="page-title">Make the next step easier to check.</h1>
      <p class="lead">
        TurnAgain is a Melbourne-focused service prototype for finding reuse, repair and recycling
        pathways for unwanted or broken items.
      </p>

      <h2>How the current catalogue works</h2>
      <p>
        Results are loaded from a structured JSON catalogue and linked to their original council or
        provider source. The catalogue is intentionally small while the product establishes a
        reliable verification process.
      </p>

      <h2>Before you travel</h2>
      <p>
        Opening times, fees, residency rules and accepted items can change. Follow the source link
        on a result and confirm current conditions with the provider.
      </p>

      <h2>Location privacy</h2>
      <p>
        A precise address is not required for the current search. A suburb or postcode is optional,
        and leaving location blank searches every area in the prototype catalogue.
      </p>
    </div>
  </section>
</template>

<style scoped>
.lead {
  margin: 1rem 0 2.25rem;
  color: var(--color-text-muted);
  font-size: 1.15rem;
}

.about-page h2 {
  margin: 2rem 0 0.5rem;
  color: var(--color-heading);
  font-size: 1.35rem;
}

.about-page p:not(.eyebrow) {
  line-height: 1.7;
}
</style>
