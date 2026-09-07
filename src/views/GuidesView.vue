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
          <h1>Find a safer next step for your item.</h1>
          <p class="guides-hero__lead">
            Start with guidance for items that are easy to place in the wrong bin or need special
            handling.
          </p>
          <RouterLink class="button button--primary guides-hero__action" :to="{ name: 'home' }">
            Search for an Item
          </RouterLink>
        </div>

        <aside class="guides-source-note" aria-labelledby="guides-source-title">
          <p class="eyebrow">Information boundary</p>
          <h2 id="guides-source-title">Guidance helps you decide.</h2>
          <p>Each guide links to the government source and shows when TurnAgain last checked it.</p>
        </aside>
      </div>
    </header>

    <section class="page-section" aria-labelledby="guidance-topics-title">
      <div class="shell">
        <div class="guides-heading">
          <div>
            <p class="eyebrow">Common decision points</p>
            <h2 id="guidance-topics-title">Choose the guide that matches your item.</h2>
          </div>
        </div>

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

.guides-hero {
  border-bottom: 1px solid var(--color-border);
  background:
    linear-gradient(120deg, var(--color-brand-soft), transparent 66%), var(--color-background);
}

.guides-hero__layout {
  display: grid;
  gap: clamp(1.5rem, 5vw, 3rem);
}

.guides-hero__content {
  max-width: 48rem;
}

.guides-hero h1 {
  max-width: 17ch;
  margin-bottom: 1.1rem;
  color: var(--color-heading);
  font-size: clamp(2.45rem, 8vw, 5rem);
  font-weight: 850;
  letter-spacing: -0.055em;
  line-height: 0.98;
  text-wrap: balance;
}

.guides-hero__lead {
  max-width: 43rem;
  margin-bottom: 0;
  color: var(--color-text-muted);
  font-size: clamp(1.05rem, 2.6vw, 1.3rem);
  line-height: 1.6;
}

.guides-hero__action {
  margin-top: 1.5rem;
}

.guides-source-note {
  align-self: end;
  border: 1px solid color-mix(in srgb, var(--color-brand) 35%, var(--color-border));
  border-radius: var(--radius-medium);
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  padding: clamp(1.1rem, 3vw, 1.5rem);
  box-shadow: var(--shadow-low);
}

.guides-source-note h2 {
  margin-bottom: 0;
  color: var(--color-heading);
  font-size: 1.3rem;
  line-height: 1.3;
  text-wrap: balance;
}

.guides-source-note > p:last-child {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.guides-heading {
  display: grid;
  gap: 1rem;
  margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
}

.guides-heading h2 {
  max-width: 20ch;
  margin-bottom: 0;
  color: var(--color-heading);
  font-size: clamp(1.8rem, 5vw, 3rem);
  letter-spacing: -0.035em;
  line-height: 1.08;
  text-wrap: balance;
}

.guides-heading > p {
  max-width: 42rem;
  margin-bottom: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.guides-grid {
  display: grid;
  gap: 1rem;
}

.guides-safety-note {
  max-width: 52rem;
  margin-top: 1.25rem;
  border-left: 4px solid var(--color-danger);
  background: var(--color-surface);
  padding: 1rem 1.15rem;
}

.guides-safety-note h2 {
  margin-bottom: 0.4rem;
  color: var(--color-heading);
  font-size: 1.05rem;
}

.guides-safety-note p {
  margin-bottom: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

@media (min-width: 768px) {
  .guides-hero__layout,
  .guides-heading {
    grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr);
    align-items: start;
  }

  .guides-hero__layout {
    align-items: end;
  }
}

@media (min-width: 1100px) {
  .guides-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
