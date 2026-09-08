<script setup>
import { RouterLink, useRouter } from 'vue-router'

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
  <div class="home-page">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="shell home-hero__inner">
        <header class="home-intro">
          <h1 id="home-title">Give your things <span>another turn.</span></h1>
          <p>Find local repair, reuse and recycling options in Melbourne.</p>
        </header>

        <section class="home-search" aria-label="Find local options">
          <SearchForm @submit="findOptions" />
          <p class="home-search__hint">Leave either field blank to explore the catalogue.</p>
        </section>

        <nav class="home-shortcuts" aria-label="Browse by action">
          <h2>Local options. A clearer next step.</h2>
          <div>
            <RouterLink :to="{ name: 'find-nearby', query: { action: 'repair' } }"
              >Repair</RouterLink
            >
            <RouterLink :to="{ name: 'find-nearby', query: { action: 'reuse' } }">Reuse</RouterLink>
            <RouterLink :to="{ name: 'find-nearby', query: { action: 'recycle' } }"
              >Recycle</RouterLink
            >
          </div>
        </nav>
      </div>
    </section>

    <section class="shell home-explore" aria-labelledby="explore-title">
      <h2 id="explore-title">More ways to make a difference.</h2>
      <div class="home-explore__grid">
        <RouterLink class="explore-link" to="/activities">
          <h3>Repair, together.</h3>
          <p>Explore local repair cafés, workshops and community activities.</p>
          <span>Explore activities <span aria-hidden="true">→</span></span>
        </RouterLink>
        <RouterLink class="explore-link" to="/guides">
          <h3>Know before you go.</h3>
          <p>Practical guidance for the items that need a little extra care.</p>
          <span>Read the guides <span aria-hidden="true">→</span></span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-hero {
  background: var(--color-surface-muted);
  padding-block: clamp(3rem, 5.5vw, 5rem) 2.5rem;
}

.home-hero__inner {
  display: grid;
  justify-items: center;
  gap: 2.5rem;
}

.home-intro {
  max-width: 58rem;
  text-align: center;
}

h1 {
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(2.625rem, 6.15vw, 5.5rem);
  font-weight: 650;
  letter-spacing: -0.055em;
  line-height: 1.04;
}

h1 span {
  display: block;
  color: var(--color-brand);
}

.home-intro > p {
  max-width: 43rem;
  margin: 1.5rem auto 0;
  color: var(--color-text-muted);
  font-size: clamp(1.0625rem, 1.7vw, 1.3125rem);
  line-height: 1.5;
  letter-spacing: -0.015em;
}

.home-search {
  width: 100%;
  max-width: 68rem;
  min-width: 0;
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: clamp(1.25rem, 3vw, 2rem);
  box-shadow: 0 4px 24px rgb(29 29 31 / 4%);
}

.home-search__hint {
  margin: 0.875rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

.home-shortcuts {
  text-align: center;
}

.home-shortcuts h2 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.025em;
}

.home-shortcuts > div {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  margin-top: 0.375rem;
}

.home-shortcuts a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  text-decoration: none;
  font-size: 0.9375rem;
}

.home-shortcuts a:hover {
  text-decoration: underline;
}

.home-explore {
  padding-block: clamp(2.5rem, 5vw, 4rem);
}

.home-explore > h2 {
  margin: 0 0 1.5rem;
  color: var(--color-heading);
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.15;
}

.home-explore__grid {
  display: grid;
  gap: 1.25rem;
}

.explore-link {
  min-width: 0;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.5rem, 3vw, 2.25rem);
  color: var(--color-text);
  text-decoration: none;
  transition: background-color var(--duration-fast);
}

.explore-link h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1.2;
}

.explore-link p {
  max-width: 30rem;
  margin: 0.65rem 0 0.875rem;
  color: var(--color-text-muted);
  line-height: 1.55;
}

.explore-link > span {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 1.5rem;
  color: var(--color-link);
}

.explore-link:hover {
  background: #ededf0;
}

.explore-link:hover > span {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

@media (min-width: 640px) {
  .home-explore__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 575px) {
  .home-hero {
    padding-top: 2.5rem;
  }

  .home-hero__inner {
    gap: 2rem;
  }

  h1 {
    font-size: clamp(2.375rem, 9.5vw, 3.25rem);
  }

  .home-intro > p {
    margin-top: 1rem;
  }
}
</style>
