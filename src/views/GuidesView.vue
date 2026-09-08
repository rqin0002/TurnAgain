<script setup>
import { RouterLink } from 'vue-router'

import GuidanceTopicCard from '../features/guidance/components/GuidanceTopicCard.vue'

/**
 * Source-backed public guidance for high-risk or commonly misunderstood items.
 *
 * This is deliberately a small editorial dataset, not a second service
 * catalogue. Content stays as plain text so Vue's normal escaping remains the
 * rendering boundary, while time-sensitive decisions remain with the linked
 * government or council source.
 */

/**
 * @typedef {object} GuidanceSource
 * @property {string} title
 * @property {string} organisation
 * @property {string} url
 * @property {string} checkedAt ISO calendar date in YYYY-MM-DD form.
 */

/**
 * @typedef {object} GuidanceTopic
 * @property {string} id
 * @property {string} scope
 * @property {string} title
 * @property {string} summary
 * @property {readonly string[]} steps
 * @property {readonly GuidanceSource[]} sources
 * @property {{ label: string, to: import('vue-router').RouteLocationRaw }} [action]
 */

/** @type {readonly GuidanceTopic[]} */
const GUIDANCE_TOPICS = [
  {
    id: 'electronics-and-batteries',
    scope: 'Victoria wide safety guidance',
    title: 'Electronics & batteries',
    summary:
      'E-waste and batteries should not go in household bins. Incorrect disposal can cause fires in collection trucks and resource-recovery facilities.',
    steps: [
      'Keep the device or battery out of every household bin.',
      'Use a council or specialist drop-off point that accepts the exact item.',
      'Confirm accepted device and battery types before travelling.',
    ],
    sources: [
      {
        title: 'Fire Prevention Program',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/fire-prevention-program',
        checkedAt: '2026-09-03',
      },
    ],
    action: {
      label: 'Search for e-waste options',
      to: { name: 'find-nearby', query: { item: 'e-waste' } },
    },
  },
  {
    id: 'household-chemicals',
    scope: 'Victoria wide disposal guidance',
    title: 'Household chemicals',
    summary:
      'Hazardous household chemicals need product-specific handling. Do not place them in household rubbish or pour them down a drain.',
    steps: [
      'Read the product label and keep the chemical safely stored until disposal.',
      'Never mix chemicals during use or storage.',
      'Use the official disposal list to find the pathway for that exact product.',
    ],
    sources: [
      {
        title: 'How to dispose of hazardous household chemicals',
        organisation: 'Department of Energy, Environment and Climate Action',
        url: 'https://www.environment.vic.gov.au/hazardous-household-chemicals/how-to-dispose-of-hazardous-household-chemicals',
        checkedAt: '2026-09-03',
      },
      {
        title: 'Safe management of hazardous household chemicals',
        organisation: 'Department of Energy, Environment and Climate Action',
        url: 'https://www.environment.vic.gov.au/hazardous-household-chemicals/safe-management-of-hazardous-household-chemicals',
        checkedAt: '2026-09-03',
      },
    ],
  },
  {
    id: 'household-recycling',
    scope: 'Statewide framework with local delivery',
    title: 'Household recycling',
    summary:
      'Victoria is transitioning to four household streams, but the service available today still depends on the council or collection provider for the property.',
    steps: [
      'The four streams are glass, FOGO, mixed recycling and general rubbish.',
      'Check the local service before relying on a bin colour, collection schedule or accepted-item list.',
      'For shared or privately collected bins, also check the building-specific rules.',
    ],
    sources: [
      {
        title: 'Standardising household recycling across Victoria',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/Standardising-household-recycling-across-Victoria',
        checkedAt: '2026-09-03',
      },
      {
        title: 'Know Your Council',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/know-your-council/',
        checkedAt: '2026-09-03',
      },
    ],
    action: {
      label: 'Find recycling options',
      to: { name: 'find-nearby', query: { action: 'recycle' } },
    },
  },
]
</script>

<template>
  <article class="guides-page">
    <header class="guides-hero page-section">
      <div class="shell guides-hero__layout">
        <div class="guides-hero__content">
          <p class="eyebrow">The practical guide</p>
          <h1>Find a safer next step for your item.</h1>
          <p class="guides-hero__lead">
            Start with guidance for items that are easy to place in the wrong bin or need special
            handling.
          </p>
          <RouterLink class="button button--primary guides-hero__action" :to="{ name: 'home' }">
            Find an option for your item
          </RouterLink>
        </div>

        <section class="guides-source-note" aria-labelledby="guides-source-title">
          <h2 id="guides-source-title">Guidance helps you decide.</h2>
          <p>Each guide links to its government source and shows when TurnAgain last checked it.</p>
        </section>
      </div>
    </header>

    <section class="page-section" aria-labelledby="guidance-topics-title">
      <div class="shell">
        <div class="guides-heading">
          <div>
            <h2 id="guidance-topics-title">Choose the guide that matches your item.</h2>
          </div>
        </div>

        <nav class="guides-index" aria-label="Guide topics">
          <a v-for="topic in GUIDANCE_TOPICS" :key="topic.id" :href="`#${topic.id}`">
            {{ topic.title }}
          </a>
        </nav>

        <div class="guides-grid">
          <GuidanceTopicCard v-for="topic in GUIDANCE_TOPICS" :key="topic.id" :topic="topic" />
        </div>
      </div>
    </section>
  </article>
</template>

<style scoped>
.guides-page {
  background: var(--color-background);
}

.guides-page h1,
.guides-page h2,
.guides-page p {
  margin-top: 0;
}

.guides-page h1,
.guides-page h2 {
  font-weight: 650;
  text-wrap: balance;
}

.guides-page .eyebrow {
  color: var(--color-text-muted);
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.guides-hero {
  padding-block: clamp(3.5rem, 8vw, 7rem) 0;
}

.guides-hero__layout {
  display: grid;
  justify-items: center;
  gap: clamp(2.5rem, 5vw, 4rem);
}

.guides-hero__content {
  max-width: 58rem;
  text-align: center;
}

.guides-hero h1 {
  max-width: 20ch;
  margin: 0 auto 1.5rem;
  color: var(--color-heading);
  font-size: clamp(2.5rem, 5.8vw, 4.75rem);
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.guides-hero__lead {
  max-width: 40rem;
  margin: 0 auto;
  color: var(--color-text-muted);
  font-size: clamp(1.0625rem, 2vw, 1.25rem);
  line-height: 1.65;
}

.guides-hero__action {
  margin-top: 1.75rem;
}

.guides-source-note {
  width: 100%;
  max-width: 60rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.5rem, 3vw, 2rem);
  text-align: center;
}

.guides-source-note .eyebrow {
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
}

.guides-source-note h2 {
  margin-bottom: 0;
  color: var(--color-heading);
  font-size: 1.375rem;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.guides-source-note > p:last-child {
  max-width: 47rem;
  margin: 0.75rem auto 0;
  color: var(--color-text-muted);
  line-height: 1.75;
}

.guides-heading {
  max-width: 43rem;
  margin: 0 auto 1.75rem;
  text-align: center;
}

.guides-heading h2 {
  margin-bottom: 0;
  color: var(--color-heading);
  font-size: clamp(1.875rem, 3.7vw, 2.875rem);
  letter-spacing: -0.035em;
  line-height: 1.14;
}

.guides-index {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: clamp(2rem, 5vw, 3rem);
}

.guides-index a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  padding: 0.625rem 1rem;
  color: var(--color-brand);
  text-decoration: none;
}

.guides-index a:hover {
  background: var(--color-surface-muted);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.guides-grid {
  display: grid;
  max-width: 60rem;
  gap: 1.5rem;
  margin-inline: auto;
}
</style>
