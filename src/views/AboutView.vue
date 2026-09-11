<script setup>
import { RouterLink, useRouter } from 'vue-router'

const router = useRouter()

const goToSection = async (event, hash) => {
  // Keep modified clicks, copied links and opening a section in a new tab native.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const section = document.getElementById(hash.slice(1))
  if (!section) return

  event.preventDefault()
  await router.push({ name: 'about', hash })
  if (router.currentRoute.value.name !== 'about' || router.currentRoute.value.hash !== hash) return

  // Focus follows the destination without interrupting the browser's scroll.
  const heading = section.querySelector('h2')
  if (heading) {
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }
}

// ABOUT PAGE CONTENT
// Edit this object to update page, labels, links or repeated content.
const pageContent = {
  hero: {
    eyebrow: 'About & help',
    title: 'A clearer next step for things you no longer need.',
    lead: 'TurnAgain brings repair, reuse and recycling options together, so you can compare the pathway before you travel.',
    promises: ['Provider source linked', 'Repair, reuse and recycling'],
  },

  navigation: {
    ariaLabel: 'About page sections',
    items: [
      { label: 'About', href: '#about-turnagain' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Service information', href: '#information' },
      { label: 'Before you go', href: '#before-you-go' },
      { label: 'Help', href: '#help' },
    ],
  },

  about: {
    id: 'about-turnagain',
    titleId: 'about-title',
    eyebrow: 'Why TurnAgain',
    title: 'Turn an unwanted item into a local action.',
    paragraphs: [
      'An unwanted or broken item rarely comes with one obvious answer. Its condition, your council area, service eligibility, fees, booking rules and transport needs can all change the right next step.',
      'TurnAgain is a Melbourne-focused community project designed to make waste reduction, repair and reuse easier to navigate. It is intended to reduce information friction for residents who may face language, digital confidence, transport or service access barriers.',
      'TurnAgain keeps three pathways: repair what can keep working, reuse what can serve someone else, and recycle what has reached the end of its useful life.',
    ],
  },

  howItWorks: {
    id: 'how-it-works',
    titleId: 'pathway-title',
    eyebrow: 'How it works',
    title: 'Choose the pathway that fits the item.',
    pathways: [
      {
        number: '01',
        title: 'Repair',
        copy: 'Look for community repair services that may help diagnose or fix a broken item.',
        note: 'Check session dates, booking rules and the types of items volunteers can assess.',
      },
      {
        number: '02',
        title: 'Reuse or donate',
        copy: 'Keep a usable item in circulation through an eligible reuse or donation service.',
        note: 'Check the item condition, quantity limits and any resident or drop-off requirements.',
      },
      {
        number: '03',
        title: 'Recycle',
        copy: 'Find a selected drop-off or resource-recovery option when repair or reuse is not suitable.',
        note: 'Check fees, accepted materials, residency rules and safe handling before you travel.',
      },
    ],
    steps: {
      titleId: 'search-steps-title',
      title: 'From item to next step',
      items: [
        {
          number: '1',
          title: 'Describe the item',
          body: 'Use a familiar name such as laptop, bicycle, clothing or battery.',
        },
        {
          number: '2',
          title: 'Add a location if useful',
          body: 'Enter a Victorian suburb or postcode, or leave it blank to browse all records.',
        },
        {
          number: '3',
          title: 'Compare the pathways',
          body: 'Filter the matching options by repair, reuse or recycling.',
        },
        {
          number: '4',
          title: 'Confirm before you act',
          body: 'Open the linked source and check the provider’s latest conditions.',
        },
      ],
    },
  },

  information: {
    id: 'information',
    titleId: 'information-title',
    eyebrow: 'Trust the source',
    title: 'What a result can—and cannot—tell you.',
    intro:
      'TurnAgain keeps evidence close to each option, while making the limits of catalogue information visible.',
    items: [
      {
        term: 'Source',
        description:
          'The council or provider page linked to a record. Use it to confirm current eligibility, accepted items, dates, fees and booking requirements.',
      },
      {
        term: 'Catalogue checked',
        description:
          'The date TurnAgain last checked the linked source. It is not a live-status indicator and does not mean the service is open now.',
      },
      {
        term: 'Listed items',
        description:
          'Searchable examples recorded in the catalogue—not a promise that every item, size, quantity or condition will be accepted.',
      },
      {
        term: 'Community ratings',
        description:
          'User feedback about a service. Ratings do not verify provider information or replace the conditions published by the provider.',
      },
    ],
  },

  beforeTravel: {
    id: 'before-you-go',
    titleId: 'before-title',
    eyebrow: 'Before you travel',
    title: 'Five checks can prevent a wasted trip.',
    intro:
      'Service details can change after a catalogue check. If anything is unclear, contact the provider before travelling or carrying a difficult item.',
    checks: [
      { number: '1', body: 'Is this exact item—and its current condition—accepted?' },
      { number: '2', body: 'Do I need to book, pay a fee or show proof of address?' },
      { number: '3', body: 'Are there quantity, size or preparation limits?' },
      {
        number: '4',
        body: 'Are the opening time, session date and location still current?',
      },
      {
        number: '5',
        body: 'Can I transport the item safely, and is the site accessible for me?',
      },
    ],
  },

  prototype: {
    titleId: 'prototype-title',
    eyebrow: 'Using TurnAgain',
    title: 'What you can do here.',
    groups: [
      {
        key: 'available',
        titleId: 'available-title',
        title: 'Available now',
        items: [
          'Search by item name, suburb or Victorian postcode—or browse without entering either.',
          'Filter selected services by repair, reuse or recycling and sort results by name.',
          'Open a service record to see listed items, its linked source and catalogue check date.',
          'View community rating summaries and, after signing in, add or update your own rating.',
          'Browse repair and reuse activities, session information and linked provider sources.',
        ],
      },
      {
        key: 'limits',
        titleId: 'limits-title',
        title: 'Current limits',
        items: [
          'The catalogue covers selected services and activities, so a search may not include every local option.',
          'Bookings and any fees are handled through the provider’s own process.',
          'Capacity is shown only when published; provider-managed availability must be checked with the provider.',
          'TurnAgain does not arrange collections or confirm that an item will be accepted.',
        ],
      },
    ],
  },

  // You can copy and paste the contents in the boxes of the items and modify the questions and answers as you wish.
  help: {
    id: 'help',
    titleId: 'help-title',
    eyebrow: 'Help',
    title: 'Questions people need answered.',
    items: [
      {
        question: 'How do I start a search?',
        answer:
          'Enter an item name, a Victorian suburb or postcode, or both. You can also leave both fields blank to browse the complete prototype catalogue. Use everyday item names rather than long descriptions.',
        action: { label: 'Go to the search', to: { name: 'home' } },
      },
      {
        question: 'Why did I get no matching options?',
        answer:
          'The catalogue covers selected services only. Try a broader item name, remove the location, or clear an action filter. No result does not mean that no suitable service exists outside TurnAgain.',
      },
      {
        question: 'Do I need an account?',
        answer:
          'No account is needed to search, browse, filter or open provider sources. In this prototype, signing in is only needed to add or update your own service rating.',
      },
      {
        question: 'Can I book a repair activity through TurnAgain?',
        answer:
          'Not in the current prototype. If a service requires a booking, follow the provider source for its current booking process. A booking would not, by itself, guarantee that an item can be repaired.',
      },
      {
        question: 'Does “catalogue checked” mean the service is open?',
        answer:
          'No. It records when the linked source was checked for the catalogue. Opening hours, event dates, fees and eligibility can change independently, so check the provider source before travelling.',
      },
      {
        question: 'Can TurnAgain guarantee that my item will be accepted?',
        answer:
          'No. Acceptance can depend on the exact item, condition, size, quantity, residency, available capacity and provider judgement. The provider’s current rules and final decision apply.',
      },
    ],
  },

  callToAction: {
    titleId: 'cta-title',
    title: 'Give it another turn.',
  },
}
</script>

<template>
  <article class="about-page">
    <header class="about-hero page-section">
      <div class="shell about-hero__layout">
        <div v-motion class="about-hero__content">
          <p class="eyebrow">{{ pageContent.hero.eyebrow }}</p>
          <h1>{{ pageContent.hero.title }}</h1>
          <p class="about-hero__lead">{{ pageContent.hero.lead }}</p>

          <ul class="about-hero__promises">
            <li v-for="promise in pageContent.hero.promises" :key="promise">{{ promise }}</li>
          </ul>
        </div>

        <nav class="about-nav" :aria-label="pageContent.navigation.ariaLabel">
          <p class="eyebrow">On this page</p>
          <ul>
            <li v-for="item in pageContent.navigation.items" :key="item.href">
              <a :href="item.href" @click="goToSection($event, item.href)">{{ item.label }}</a>
            </li>
          </ul>
        </nav>
      </div>
    </header>

    <section
      :id="pageContent.about.id"
      class="page-section"
      :aria-labelledby="pageContent.about.titleId"
    >
      <div class="shell content-layout">
        <div class="section-intro">
          <p class="eyebrow">{{ pageContent.about.eyebrow }}</p>
          <h2 :id="pageContent.about.titleId">{{ pageContent.about.title }}</h2>
        </div>

        <div class="prose-column">
          <p
            v-for="(paragraph, index) in pageContent.about.paragraphs"
            :key="paragraph"
            :class="{ 'prose-column__lead': index === 0 }"
          >
            {{ paragraph }}
          </p>
        </div>
      </div>
    </section>

    <section
      :id="pageContent.howItWorks.id"
      class="page-section pathway-section"
      :aria-labelledby="pageContent.howItWorks.titleId"
    >
      <div class="shell">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ pageContent.howItWorks.eyebrow }}</p>
            <h2 :id="pageContent.howItWorks.titleId">{{ pageContent.howItWorks.title }}</h2>
          </div>
        </div>

        <ol class="pathway-list">
          <li
            v-for="pathway in pageContent.howItWorks.pathways"
            :key="pathway.number"
            class="pathway-card"
          >
            <h3>{{ pathway.title }}</h3>
            <p>{{ pathway.copy }}</p>
            <p class="pathway-card__note">{{ pathway.note }}</p>
          </li>
        </ol>

        <section class="search-steps" :aria-labelledby="pageContent.howItWorks.steps.titleId">
          <h3 :id="pageContent.howItWorks.steps.titleId">
            {{ pageContent.howItWorks.steps.title }}
          </h3>
          <ol>
            <li v-for="step in pageContent.howItWorks.steps.items" :key="step.number">
              <div>
                <strong>{{ step.title }}</strong>
                <p>{{ step.body }}</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </section>

    <section
      :id="pageContent.information.id"
      class="page-section"
      :aria-labelledby="pageContent.information.titleId"
    >
      <div class="shell content-layout">
        <div class="section-intro">
          <p class="eyebrow">{{ pageContent.information.eyebrow }}</p>
          <h2 :id="pageContent.information.titleId">{{ pageContent.information.title }}</h2>
          <p>{{ pageContent.information.intro }}</p>
        </div>

        <dl class="information-list">
          <div v-for="item in pageContent.information.items" :key="item.term">
            <dt>{{ item.term }}</dt>
            <dd>{{ item.description }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <section
      :id="pageContent.beforeTravel.id"
      class="before-panel"
      :aria-labelledby="pageContent.beforeTravel.titleId"
    >
      <div class="shell before-panel__layout">
        <div>
          <p class="eyebrow">{{ pageContent.beforeTravel.eyebrow }}</p>
          <h2 :id="pageContent.beforeTravel.titleId">{{ pageContent.beforeTravel.title }}</h2>
          <p>{{ pageContent.beforeTravel.intro }}</p>
        </div>
        <ol class="travel-checks">
          <li v-for="check in pageContent.beforeTravel.checks" :key="check.number">
            <p>{{ check.body }}</p>
          </li>
        </ol>
      </div>
    </section>

    <section
      class="page-section prototype-section"
      :aria-labelledby="pageContent.prototype.titleId"
    >
      <div class="shell">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ pageContent.prototype.eyebrow }}</p>
            <h2 :id="pageContent.prototype.titleId">{{ pageContent.prototype.title }}</h2>
          </div>
        </div>

        <div class="boundary-grid">
          <section
            v-for="group in pageContent.prototype.groups"
            :key="group.key"
            class="boundary-card"
            :aria-labelledby="group.titleId"
          >
            <h3 :id="group.titleId">{{ group.title }}</h3>
            <ul>
              <li v-for="item in group.items" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>
      </div>
    </section>

    <section
      :id="pageContent.help.id"
      class="page-section help-section"
      :aria-labelledby="pageContent.help.titleId"
    >
      <div class="shell">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ pageContent.help.eyebrow }}</p>
            <h2 :id="pageContent.help.titleId">{{ pageContent.help.title }}</h2>
          </div>
        </div>

        <div class="faq-grid">
          <details v-for="item in pageContent.help.items" :key="item.question" v-motion:disclosure>
            <summary>{{ item.question }}</summary>
            <div>
              <p>{{ item.answer }}</p>
              <RouterLink v-if="item.action" :to="item.action.to">
                {{ item.action.label }}
              </RouterLink>
            </div>
          </details>
        </div>
      </div>
    </section>

    <section class="about-cta" :aria-labelledby="pageContent.callToAction.titleId">
      <div class="shell about-cta__inner">
        <div>
          <p class="eyebrow">Start with what you have</p>
          <h2 :id="pageContent.callToAction.titleId">{{ pageContent.callToAction.title }}</h2>
        </div>
        <RouterLink class="button button--primary" :to="{ name: 'home' }">
          Find an option for your item
        </RouterLink>
      </div>
    </section>
  </article>
</template>

<style scoped>
.about-page {
  background: var(--color-background);
}

.about-page h1,
.about-page h2,
.about-page h3,
.about-page p {
  margin-top: 0;
}

.about-page h1,
.about-page h2,
.about-page h3 {
  font-weight: 650;
  text-wrap: balance;
}

.about-page h2 {
  margin-bottom: 0;
  color: var(--color-heading);
  font-size: clamp(1.875rem, 3.7vw, 2.875rem);
  letter-spacing: -0.035em;
  line-height: 1.14;
}

.about-page .eyebrow {
  color: var(--color-text-muted);
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.about-page section[id] {
  scroll-margin-top: 2rem;
}

.about-hero {
  padding-block: clamp(3.5rem, 8vw, 7rem) 2rem;
}

.about-hero__layout {
  display: grid;
  gap: clamp(2.5rem, 5vw, 4rem);
}

.about-hero__content {
  max-width: 58rem;
  margin-inline: auto;
  text-align: center;
}

.about-hero h1 {
  max-width: 21ch;
  margin: 0 auto 1.5rem;
  color: var(--color-heading);
  font-size: clamp(2.5rem, 5.8vw, 4.75rem);
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.about-hero__lead {
  max-width: 43rem;
  margin: 0 auto;
  color: var(--color-text-muted);
  font-size: clamp(1.0625rem, 2vw, 1.25rem);
  line-height: 1.65;
}

.about-hero__promises {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem 1.5rem;
  margin: 1.5rem 0 0;
  padding: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  list-style: none;
}

.about-nav {
  text-align: center;
}

.about-nav > p {
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.about-nav ul {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem 1.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.about-nav a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  color: var(--color-brand);
  text-decoration: none;
}

.about-nav a:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.content-layout,
.before-panel__layout {
  display: grid;
  gap: 2rem;
  max-width: 64rem;
}

.section-intro > p:last-child,
.before-panel__layout > div > p:last-child {
  margin: 1.25rem 0 0;
  color: var(--color-text-muted);
  line-height: 1.75;
}

.prose-column p {
  margin-bottom: 1.25rem;
  color: var(--color-text-muted);
  line-height: 1.8;
}

.prose-column p:last-child {
  margin-bottom: 0;
}

.prose-column .prose-column__lead {
  color: var(--color-heading);
  font-size: 1.125rem;
}

.pathway-section {
  background: var(--color-surface-muted);
}

.section-heading {
  max-width: 46rem;
  margin: 0 auto clamp(2rem, 4vw, 3rem);
  text-align: center;
}

.pathway-list {
  display: grid;
  gap: 1.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pathway-card {
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: clamp(1.5rem, 3vw, 2rem);
}

.pathway-card h3 {
  margin: 0 0 1rem;
  font-size: 1.625rem;
  letter-spacing: -0.025em;
}

.pathway-card p {
  margin-bottom: 0;
  line-height: 1.75;
}

.pathway-card__note {
  margin-top: 1rem;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.search-steps {
  margin-top: clamp(2.5rem, 5vw, 4rem);
}

.search-steps h3 {
  margin: 0 0 1.75rem;
  font-size: 1.5rem;
  letter-spacing: -0.025em;
  text-align: center;
}

.search-steps ol {
  display: grid;
  gap: 1.5rem 2.5rem;
  margin: 0;
  padding-left: 1.25rem;
}

.search-steps li {
  padding-left: 0.35rem;
}

.search-steps li::marker {
  color: var(--color-text-muted);
  font-weight: 600;
}

.search-steps strong {
  color: var(--color-heading);
  font-weight: 600;
}

.search-steps p {
  margin: 0.5rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  line-height: 1.7;
}

.information-list {
  display: grid;
  margin: 0;
}

.information-list > div {
  display: grid;
  gap: 0.5rem;
  border-bottom: 1px solid var(--color-border);
  padding-block: 1.25rem;
}

.information-list > div:first-child {
  padding-top: 0;
}

.information-list > div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.information-list dt {
  color: var(--color-heading);
  font-weight: 600;
}

.information-list dd {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.75;
}

.before-panel {
  background: var(--color-surface-muted);
  padding-block: clamp(3rem, 6vw, 5rem);
}

.travel-checks {
  display: grid;
  gap: 1.1rem;
  margin: 0;
  padding-left: 1.5rem;
}

.travel-checks li {
  padding-left: 0.5rem;
}

.travel-checks li::marker {
  color: var(--color-text-muted);
  font-weight: 600;
}

.travel-checks p {
  margin-bottom: 0;
  line-height: 1.75;
}

.boundary-grid {
  display: grid;
  gap: 1.25rem;
}

.boundary-card {
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.5rem, 3.5vw, 2.5rem);
}

.boundary-card h3 {
  margin: 0 0 1.25rem;
  font-size: 1.5rem;
  letter-spacing: -0.025em;
}

.boundary-card ul {
  display: grid;
  gap: 0.85rem;
  margin: 0;
  padding-left: 1.15rem;
}

.boundary-card li {
  padding-left: 0.25rem;
  color: var(--color-text-muted);
  line-height: 1.75;
}

.help-section {
  border-top: 1px solid var(--color-border);
}

.faq-grid {
  max-width: 56rem;
  margin-inline: auto;
}

.faq-grid details {
  border-bottom: 1px solid var(--color-border);
}

.faq-grid summary {
  position: relative;
  min-height: 4.5rem;
  padding: 1.5rem 3rem 1.5rem 0;
  color: var(--color-heading);
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  list-style: none;
}

.faq-grid summary::-webkit-details-marker {
  display: none;
}

.faq-grid summary::after {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  width: 0.55rem;
  height: 0.55rem;
  transform: translateY(-70%) rotate(45deg);
  border-right: 2px solid var(--color-text-muted);
  border-bottom: 2px solid var(--color-text-muted);
  content: '';
}

.faq-grid details[open] summary::after {
  transform: translateY(-20%) rotate(225deg);
}

.faq-grid details > div {
  padding: 0 2rem 1.75rem 0;
  color: var(--color-text-muted);
}

.faq-grid details > div p {
  margin-bottom: 0;
  line-height: 1.8;
}

.faq-grid details > div a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  margin-top: 0.5rem;
  font-weight: 600;
}

.about-cta {
  background: var(--color-surface-muted);
  padding-block: clamp(3rem, 6vw, 5rem);
}

.about-cta__inner {
  display: grid;
  justify-items: center;
  gap: 1.75rem;
  text-align: center;
}

@media (min-width: 700px) {
  .boundary-grid,
  .search-steps ol {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .content-layout,
  .before-panel__layout {
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    align-items: start;
    gap: clamp(2rem, 6vw, 5rem);
  }

  .pathway-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1100px) {
  .search-steps ol {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
