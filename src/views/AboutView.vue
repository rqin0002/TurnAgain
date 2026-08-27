<script setup>
import { RouterLink } from 'vue-router'

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
      'TurnAgain is a Melbourne-focused service designed to make those conditions easier to find and compare. It is intended to reduce information friction for residents who may face language, digital confidence, transport or service access barriers.',
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
    eyebrow: 'Prototype boundaries',
    title: 'Clear about what works today.',
    groups: [
      {
        key: 'available',
        titleId: 'available-title',
        className: 'boundary-card',
        title: 'In this prototype',
        items: [
          'Search by item name, suburb or Victorian postcode—or browse without entering either.',
          'Filter selected services by repair, reuse or recycling and sort results by name.',
          'Open a service record to see listed items, its linked source and catalogue check date.',
          'View community rating summaries and, after signing in, add or update a local-demo rating.',
        ],
      },
      {
        key: 'limits',
        titleId: 'limits-title',
        className: 'boundary-card',
        title: 'Current limits',
        items: ['This tab can add some new features in future updates.'],
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
      {
        question: 'What if the item is heavy or I do not have transport?',
        answer:
          'TurnAgain does not currently arrange pickup or transport. Check the provider or council source for hard-waste collection, pickup, mail-in or other accessible alternatives before moving the item.',
      },
      {
        question: 'What if information looks incorrect or out of date?',
        answer:
          'Treat the linked provider source as the authority and confirm the details directly with the provider. This prototype does not yet include a correction form or live provider synchronisation, so do not rely on a conflicting catalogue record for a time-sensitive trip.',
      },
      {
        question: 'Where does the catalogue information come from?',
        answer:
          'The prototype catalogue was compiled with AI assistance from the linked official council and provider sources. Each service record keeps its source and check date. Inclusion does not mean that a provider has endorsed TurnAgain.',
      },
      {
        question: 'How does location search affect my privacy?',
        answer:
          'TurnAgain does not request a precise address or your device location. A suburb or postcode is optional. Submitted search terms appear in the results-page address so the search can be refreshed or shared; avoid entering personal address details.',
      },
      {
        question: 'Are accounts and ratings live production data?',
        answer:
          'No. Authentication, profiles and rating changes in this version are local-demo data stored on this device. They should not be treated as a production account, provider endorsement or public moderation system.',
      },
      {
        question: 'What language and access support is available?',
        answer:
          'The current prototype is in English. It uses structured headings, keyboard-aware navigation and a list-based discovery path that does not require a map. TurnAgain does not yet claim multilingual support or independent accessibility certification.',
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
        <div class="about-hero__content">
          <p class="eyebrow">{{ pageContent.hero.eyebrow }}</p>
          <h1>{{ pageContent.hero.title }}</h1>
          <p class="about-hero__lead">{{ pageContent.hero.lead }}</p>

          <ul class="about-hero__promises">
            <li v-for="promise in pageContent.hero.promises" :key="promise">{{ promise }}</li>
          </ul>
        </div>
      </div>
    </header>

    <nav class="about-nav" :aria-label="pageContent.navigation.ariaLabel">
      <div class="shell about-nav__inner">
        <a v-for="item in pageContent.navigation.items" :key="item.href" :href="item.href">
          {{ item.label }}
        </a>
      </div>
    </nav>

    <section
      :id="pageContent.about.id"
      class="page-section"
      :aria-labelledby="pageContent.about.titleId"
    >
      <div class="shell editorial-grid">
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
          <p v-if="pageContent.howItWorks.intro">{{ pageContent.howItWorks.intro }}</p>
        </div>

        <ol class="pathway-list">
          <li
            v-for="pathway in pageContent.howItWorks.pathways"
            :key="pathway.number"
            class="pathway-card"
          >
            <span class="pathway-card__number" aria-hidden="true">{{ pathway.number }}</span>
            <h3>{{ pathway.title }}</h3>
            <p>{{ pathway.copy }}</p>
            <p class="pathway-card__note">{{ pathway.note }}</p>
          </li>
        </ol>

        <div class="search-steps" :aria-labelledby="pageContent.howItWorks.steps.titleId">
          <h3 :id="pageContent.howItWorks.steps.titleId">
            {{ pageContent.howItWorks.steps.title }}
          </h3>
          <ol>
            <li v-for="step in pageContent.howItWorks.steps.items" :key="step.number">
              <span>{{ step.number }}</span>
              <div>
                <strong>{{ step.title }}</strong>
                <p>{{ step.body }}</p>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <section
      :id="pageContent.information.id"
      class="page-section"
      :aria-labelledby="pageContent.information.titleId"
    >
      <div class="shell editorial-grid">
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
            <span>{{ check.number }}</span>
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
          <p v-if="pageContent.prototype.intro">{{ pageContent.prototype.intro }}</p>
        </div>

        <div class="boundary-grid">
          <section
            v-for="group in pageContent.prototype.groups"
            :key="group.key"
            class="boundary-card"
            :class="group.className"
            :aria-labelledby="group.titleId"
          >
            <p v-if="group.status" class="boundary-card__status">{{ group.status }}</p>
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
          <details v-for="item in pageContent.help.items" :key="item.question">
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
          <h2 :id="pageContent.callToAction.titleId">{{ pageContent.callToAction.title }}</h2>
        </div>
        <div v-if="pageContent.callToAction.actions?.length" class="about-cta__actions">
          <RouterLink
            v-for="action in pageContent.callToAction.actions"
            :key="action.key"
            class="button"
            :class="action.className"
            :to="action.to"
          >
            {{ action.label }}
          </RouterLink>
        </div>
      </div>
    </section>
  </article>
</template>

<style scoped>
.about-page {
  --about-accent: #c8dd72;
  --about-accent-soft: #f0f5d7;
  --about-dark: #123c31;
  overflow: clip;
  background: var(--color-background);
}

.about-page h1,
.about-page h2,
.about-page h3,
.about-page p {
  margin-top: 0;
}

.about-page h2 {
  margin-bottom: 0;
  color: var(--color-heading);
  font-size: clamp(1.8rem, 5vw, 3rem);
  letter-spacing: -0.035em;
  line-height: 1.08;
  text-wrap: balance;
}

#about-turnagain,
#how-it-works,
#information,
#before-you-go,
#help {
  scroll-margin-top: 1rem;
}

.about-hero {
  position: relative;
  isolation: isolate;
  border-bottom: 1px solid var(--color-border);
  background:
    linear-gradient(115deg, rgba(229, 243, 238, 0.78), rgba(247, 247, 243, 0.2) 58%),
    var(--color-background);
}

.about-hero::after {
  position: absolute;
  z-index: -1;
  top: -12rem;
  right: -10rem;
  width: 34rem;
  height: 34rem;
  border: 5rem solid color-mix(in srgb, var(--about-accent) 32%, transparent);
  border-radius: 50%;
  content: '';
  opacity: 0.62;
}

.about-hero__layout {
  display: grid;
  gap: clamp(2rem, 6vw, 4.5rem);
}

.about-hero__content {
  max-width: 49rem;
}

.about-hero h1 {
  max-width: 15ch;
  margin-bottom: 1.25rem;
  color: var(--color-heading);
  font-size: clamp(2.6rem, 8vw, 5.25rem);
  font-weight: 850;
  letter-spacing: -0.055em;
  line-height: 0.96;
  text-wrap: balance;
}

.about-hero__lead {
  max-width: 42rem;
  margin-bottom: 0;
  color: var(--color-text-muted);
  font-size: clamp(1.1rem, 2.7vw, 1.35rem);
  line-height: 1.55;
}

.about-hero__actions,
.about-cta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.75rem;
}

.about-hero__promises {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 1.5rem 0 0;
  padding: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  font-weight: 700;
  list-style: none;
}

.about-hero__promises li {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.about-hero__promises li::before {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--about-accent);
  content: '';
}

.decision-card {
  align-self: end;
  border: 1px solid color-mix(in srgb, var(--color-brand) 40%, var(--color-border));
  border-radius: 1rem;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  padding: clamp(1.25rem, 4vw, 2rem);
  box-shadow: var(--shadow-low);
}

.decision-card__label,
.boundary-card__status {
  margin-bottom: 0.6rem;
  color: var(--color-brand-strong);
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.decision-card h2 {
  font-size: clamp(1.55rem, 4vw, 2.15rem);
}

.decision-card > p:last-child,
.section-heading > p,
.section-intro > p:last-child {
  margin-bottom: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.about-nav {
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.about-nav__inner {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  overflow-x: auto;
  padding-block: 0.65rem;
  scrollbar-width: thin;
  white-space: nowrap;
}

.about-nav__inner a {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-small);
  color: var(--color-heading);
  font-size: 0.9rem;
  font-weight: 750;
  text-decoration: none;
}

.about-nav__inner a:hover {
  background: var(--color-brand-soft);
}

.editorial-grid {
  display: grid;
  gap: clamp(1.5rem, 5vw, 4rem);
}

.section-intro > p:last-child {
  max-width: 34rem;
  margin-top: 1rem;
}

.prose-column {
  max-width: 48rem;
}

.prose-column p {
  margin-bottom: 1.15rem;
  line-height: 1.75;
}

.prose-column__lead {
  color: var(--color-heading);
  font-size: clamp(1.1rem, 2.3vw, 1.3rem);
  font-weight: 650;
}

.scope-note {
  margin-top: 1.75rem;
  border-left: 4px solid var(--about-accent);
  background: var(--about-accent-soft);
  padding: 1rem 1.15rem;
}

.scope-note p {
  margin-bottom: 0.35rem;
}

.scope-note p:last-child {
  margin-bottom: 0;
}

.pathway-section {
  border-block: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.section-heading {
  display: grid;
  gap: 1rem;
  margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
}

.section-heading > p {
  max-width: 42rem;
}

.pathway-list,
.search-steps ol,
.travel-checks,
.boundary-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pathway-list {
  display: grid;
  gap: 1rem;
}

.pathway-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: 1.25rem;
}

.pathway-card::after {
  position: absolute;
  right: -2.5rem;
  bottom: -3.5rem;
  width: 8rem;
  height: 8rem;
  border: 1.4rem solid var(--color-brand-soft);
  border-radius: 50%;
  content: '';
}

.pathway-card__number {
  color: var(--color-brand-strong);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.08em;
}

.pathway-card h3 {
  margin: 0.55rem 0 0.6rem;
  font-size: 1.35rem;
}

.pathway-card p {
  position: relative;
  z-index: 1;
  margin-bottom: 0;
  line-height: 1.65;
}

.pathway-card__note {
  margin-top: 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.search-steps {
  margin-top: clamp(1.5rem, 4vw, 2.5rem);
  border-radius: var(--radius-medium);
  background: var(--about-dark);
  padding: clamp(1.25rem, 4vw, 2rem);
  color: #e9f2ee;
}

.search-steps h3 {
  margin: 0 0 1.25rem;
  color: #fff;
  font-size: 1.35rem;
}

.search-steps ol {
  display: grid;
  gap: 1.15rem;
}

.search-steps li {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  gap: 0.75rem;
}

.search-steps li > span {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  color: var(--about-accent);
  font-weight: 850;
}

.search-steps strong {
  color: #fff;
}

.search-steps p {
  margin: 0.25rem 0 0;
  color: #c7d7d1;
  font-size: 0.9rem;
  line-height: 1.55;
}

.information-list {
  display: grid;
  margin: 0;
}

.information-list > div {
  display: grid;
  gap: 0.45rem;
  border-top: 1px solid var(--color-border);
  padding-block: 1.15rem;
}

.information-list > div:first-child {
  border-top: 0;
  padding-top: 0;
}

.information-list dt {
  color: var(--color-heading);
  font-weight: 850;
}

.information-list dd {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.before-panel {
  background: var(--about-dark);
  padding-block: clamp(2.5rem, 7vw, 5rem);
  color: #e9f2ee;
}

.before-panel__layout {
  display: grid;
  gap: clamp(2rem, 6vw, 4rem);
}

.before-panel .eyebrow {
  color: var(--about-accent);
}

.before-panel h2,
.travel-checks p {
  color: #fff;
}

.before-panel__layout > div > p:last-child {
  max-width: 36rem;
  margin: 1rem 0 0;
  color: #c7d7d1;
  line-height: 1.7;
}

.travel-checks li {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: 0.85rem;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  padding-block: 0.9rem;
}

.travel-checks li:first-child {
  border-top: 0;
  padding-top: 0;
}

.travel-checks span {
  color: var(--about-accent);
  font-size: 0.85rem;
  font-weight: 850;
}

.travel-checks p {
  margin-bottom: 0;
  line-height: 1.55;
}

.prototype-section {
  background: var(--about-accent-soft);
}

.boundary-grid {
  display: grid;
  gap: 1rem;
}

.boundary-card {
  border: 1px solid color-mix(in srgb, var(--color-brand) 24%, var(--color-border));
  border-radius: var(--radius-medium);
  background: rgba(255, 255, 255, 0.72);
  padding: clamp(1.15rem, 3vw, 1.65rem);
}

.boundary-card h3 {
  margin: 0 0 1rem;
  font-size: 1.35rem;
}

.boundary-card ul {
  display: grid;
  gap: 0.7rem;
  padding-left: 1.2rem;
  list-style: disc;
}

.boundary-card li {
  padding-left: 0.25rem;
  line-height: 1.55;
}

.faq-grid {
  display: grid;
  gap: 0.75rem;
}

.faq-grid details {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
}

.faq-grid details[open] {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-low);
}

.faq-grid summary {
  position: relative;
  min-height: 3.5rem;
  padding: 1rem 3.25rem 1rem 1rem;
  color: var(--color-heading);
  font-weight: 800;
  line-height: 1.4;
  cursor: pointer;
  list-style: none;
}

.faq-grid summary::-webkit-details-marker {
  display: none;
}

.faq-grid summary::after {
  position: absolute;
  top: 50%;
  right: 1rem;
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  transform: translateY(-50%);
  place-items: center;
  border-radius: 50%;
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
  content: '+';
  font-size: 1.2rem;
}

.faq-grid details[open] summary::after {
  content: '−';
}

.faq-grid details > div {
  border-top: 1px solid var(--color-border);
  padding: 1rem;
  color: var(--color-text-muted);
}

.faq-grid details > div p {
  margin-bottom: 0;
  line-height: 1.7;
}

.faq-grid details > div a {
  display: inline-block;
  margin-top: 0.8rem;
  font-weight: 750;
}

.about-cta {
  padding-block: clamp(2rem, 6vw, 4rem);
  border-top: 1px solid var(--color-border);
  background:
    linear-gradient(105deg, var(--color-brand-soft), transparent 72%), var(--color-surface);
}

.about-cta__inner {
  display: grid;
  gap: 1rem;
}

.about-cta h2 {
  font-size: clamp(2rem, 5vw, 3.4rem);
}

.about-cta p:last-child {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
}

.about-cta__actions {
  margin-top: 0;
}

@media (min-width: 576px) {
  .boundary-grid,
  .faq-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

@media (min-width: 768px) {
  .about-hero__layout {
    grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.65fr);
    align-items: end;
  }

  .editorial-grid,
  .before-panel__layout {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .information-list > div {
    grid-template-columns: minmax(9rem, 0.35fr) minmax(0, 1fr);
    gap: 1.25rem;
  }

  .about-cta__inner {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
}

@media (min-width: 900px) {
  .section-heading {
    grid-template-columns: minmax(0, 1.15fr) minmax(20rem, 0.65fr);
    align-items: end;
  }

  .pathway-list,
  .search-steps ol {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .search-steps ol {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
