<script setup>
import { useRouter } from 'vue-router'

import SearchForm from '../features/discovery/components/SearchForm.vue'

const router = useRouter()

/**
 * Stores the item and location criteria in the results URL so refresh, sharing,
 * and browser Back preserve the search without a global store.
 *
 * @param {{ item: string, location: string }} search
 */
const findOptions = (search) =>
  router.push({
    name: 'find-nearby',
    query: {
      ...(search.item ? { item: search.item } : {}),
      ...(search.location ? { location: search.location } : {}),
    },
  })
</script>

<template>
  <section class="home-hero page-section">
    <div class="shell home-hero__layout">
      <div class="home-hero__intro">
        <p class="eyebrow">Melbourne circular-economy guide</p>
        <h1>Give your things another turn.</h1>
        <p class="home-hero__lead">
          Find local reuse, repair and recycling options for unwanted or broken items.
        </p>
      </div>

      <div class="surface surface--padded surface--raised" aria-label="Find local options">
        <SearchForm @submit="findOptions" />
      </div>

      <p class="home-hero__privacy">
        A precise address is not required. Search with a suburb or postcode, or leave location blank
        to explore the current catalogue.
      </p>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  display: grid;
  min-height: clamp(34rem, 72vh, 47rem);
  align-items: center;
  background: var(--color-background);
}

.home-hero__layout {
  display: grid;
  gap: clamp(1.5rem, 4vw, 2.5rem);
}

.home-hero__intro {
  max-width: 46rem;
}

h1 {
  max-width: 18ch;
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(2.25rem, 8vw, 4.6rem);
  font-weight: 850;
  letter-spacing: -0.045em;
  line-height: 0.98;
}

.home-hero__lead {
  max-width: 42rem;
  margin: 1rem 0 0;
  color: var(--color-text-muted);
  font-size: clamp(1.05rem, 2.5vw, 1.25rem);
}

.home-hero__privacy {
  max-width: 50rem;
  margin: -0.5rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

@media (min-width: 1400px) {
  .home-hero {
    min-height: 48rem;
  }
}
</style>
