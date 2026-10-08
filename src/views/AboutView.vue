<script setup>
import { RouterLink, useRouter } from 'vue-router'

import { ABOUT_CONTENT } from '@/features/guidance/domain/aboutContent.js'

const router = useRouter()
const content = ABOUT_CONTENT
const privacyGroups = [content.privacy.stored, content.privacy.never, content.privacy.handling]

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
</script>

<template>
  <article class="about-page">
    <header class="about-hero page-section">
      <div class="shell about-hero__layout">
        <div class="about-hero__content">
          <p class="eyebrow">{{ content.hero.eyebrow }}</p>
          <h1>{{ content.hero.title }}</h1>
          <p class="about-hero__lead">{{ content.hero.lead }}</p>

          <ul class="about-hero__promises">
            <li v-for="promise in content.hero.promises" :key="promise">{{ promise }}</li>
          </ul>
        </div>

        <nav class="about-nav" :aria-label="content.navigation.ariaLabel">
          <p class="eyebrow">On this page</p>
          <ul>
            <li v-for="item in content.navigation.items" :key="item.href">
              <a :href="item.href" @click="goToSection($event, item.href)">{{ item.label }}</a>
            </li>
          </ul>
        </nav>
      </div>
    </header>

    <section :id="content.about.id" class="page-section" :aria-labelledby="content.about.titleId">
      <div class="shell content-layout">
        <div class="section-intro">
          <p class="eyebrow">{{ content.about.eyebrow }}</p>
          <h2 :id="content.about.titleId">{{ content.about.title }}</h2>
        </div>

        <div class="prose-column">
          <p
            v-for="(paragraph, index) in content.about.paragraphs"
            :key="paragraph"
            :class="{ 'prose-column__lead': index === 0 }"
          >
            {{ paragraph }}
          </p>
        </div>
      </div>
    </section>

    <section
      :id="content.howItWorks.id"
      class="page-section pathway-section"
      :aria-labelledby="content.howItWorks.titleId"
    >
      <div class="shell">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ content.howItWorks.eyebrow }}</p>
            <h2 :id="content.howItWorks.titleId">{{ content.howItWorks.title }}</h2>
          </div>
        </div>

        <ol class="pathway-list">
          <li
            v-for="pathway in content.howItWorks.pathways"
            :key="pathway.number"
            class="pathway-card"
          >
            <h3>{{ pathway.title }}</h3>
            <p>{{ pathway.copy }}</p>
            <p class="pathway-card__note">{{ pathway.note }}</p>
          </li>
        </ol>

        <section class="search-steps" :aria-labelledby="content.howItWorks.steps.titleId">
          <h3 :id="content.howItWorks.steps.titleId">
            {{ content.howItWorks.steps.title }}
          </h3>
          <ol>
            <li v-for="step in content.howItWorks.steps.items" :key="step.number">
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
      :id="content.checked.id"
      class="page-section"
      :aria-labelledby="content.checked.titleId"
    >
      <div class="shell content-layout">
        <div class="section-intro">
          <p class="eyebrow">{{ content.checked.eyebrow }}</p>
          <h2 :id="content.checked.titleId">{{ content.checked.title }}</h2>
          <p>{{ content.checked.intro }}</p>
        </div>

        <dl class="information-list">
          <div v-for="item in content.checked.items" :key="item.term">
            <dt>{{ item.term }}</dt>
            <dd>{{ item.description }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <section
      :id="content.beforeTravel.id"
      class="before-panel"
      :aria-labelledby="content.beforeTravel.titleId"
    >
      <div class="shell before-panel__layout">
        <div>
          <p class="eyebrow">{{ content.beforeTravel.eyebrow }}</p>
          <h2 :id="content.beforeTravel.titleId">{{ content.beforeTravel.title }}</h2>
          <p>{{ content.beforeTravel.intro }}</p>
        </div>
        <ol class="travel-checks">
          <li v-for="check in content.beforeTravel.checks" :key="check.number">
            <p>{{ check.body }}</p>
          </li>
        </ol>
      </div>
    </section>

    <section
      :id="content.using.id"
      class="page-section using-section"
      :aria-labelledby="content.using.titleId"
    >
      <div class="shell">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ content.using.eyebrow }}</p>
            <h2 :id="content.using.titleId">{{ content.using.title }}</h2>
          </div>
        </div>

        <div class="boundary-grid">
          <section
            v-for="group in content.using.groups"
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
      :id="content.help.id"
      class="page-section help-section"
      :aria-labelledby="content.help.titleId"
    >
      <div class="shell">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ content.help.eyebrow }}</p>
            <h2 :id="content.help.titleId">{{ content.help.title }}</h2>
          </div>
        </div>

        <div class="faq-grid">
          <details v-for="item in content.help.items" :key="item.question">
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

    <section
      :id="content.contact.id"
      class="page-section"
      :aria-labelledby="content.contact.titleId"
    >
      <div class="shell content-layout">
        <div class="section-intro">
          <p class="eyebrow">{{ content.contact.eyebrow }}</p>
          <h2 :id="content.contact.titleId">{{ content.contact.title }}</h2>
        </div>

        <div class="prose-column">
          <p v-for="paragraph in content.contact.paragraphs" :key="paragraph">{{ paragraph }}</p>
          <a class="button button--secondary" :href="content.contact.link.href">
            {{ content.contact.link.label }}
          </a>
        </div>
      </div>
    </section>

    <section
      :id="content.privacy.id"
      class="page-section privacy-section"
      :aria-labelledby="content.privacy.titleId"
    >
      <div class="shell">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ content.privacy.eyebrow }}</p>
            <h2 :id="content.privacy.titleId">{{ content.privacy.title }}</h2>
          </div>
        </div>

        <div class="boundary-grid boundary-grid--three">
          <section
            v-for="group in privacyGroups"
            :key="group.title"
            class="boundary-card"
            :aria-label="group.title"
          >
            <h3>{{ group.title }}</h3>
            <ul>
              <li v-for="item in group.items" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>
      </div>
    </section>

    <section :id="content.api.id" class="page-section" :aria-labelledby="content.api.titleId">
      <div class="shell content-layout">
        <div class="section-intro">
          <p class="eyebrow">{{ content.api.eyebrow }}</p>
          <h2 :id="content.api.titleId">{{ content.api.title }}</h2>
          <p>{{ content.api.intro }}</p>
        </div>

        <div class="prose-column about-api">
          <p>
            <strong>{{ content.api.baseUrlLabel }}:</strong>
            <code class="about-api__base">{{ content.api.baseUrl }}</code>
          </p>
          <pre
            class="about-api__example"
            tabindex="0"
            role="region"
            aria-label="Example request"
          ><code>{{ content.api.curl }}</code></pre>
          <p>
            <a :href="content.api.docs.href">{{ content.api.docs.label }}</a>
          </p>
        </div>
      </div>
    </section>

    <section class="about-cta" :aria-labelledby="content.callToAction.titleId">
      <div class="shell about-cta__inner">
        <div>
          <p class="eyebrow">{{ content.callToAction.eyebrow }}</p>
          <h2 :id="content.callToAction.titleId">{{ content.callToAction.title }}</h2>
        </div>
        <RouterLink class="button button--primary" :to="{ name: 'home' }">
          {{ content.callToAction.action }}
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

/* One shrinkable column below 992 px: an implicit auto column would grow to its widest content
   (the curl example) and widen the page. */
.content-layout,
.before-panel__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
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

.prose-column .button {
  margin-top: 0.5rem;
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

.privacy-section {
  background: var(--color-surface);
}

.about-api code {
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 0.1em 0.35em;
  font-size: 0.9375em;
  overflow-wrap: anywhere;
}

.about-api__example {
  margin: 0 0 1.25rem;
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 1rem 1.25rem;
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.6;
}

.about-api__example code {
  background: transparent;
  padding: 0;
}

.about-api h3 {
  margin: 1.5rem 0 0.75rem;
  font-size: 1.25rem;
  letter-spacing: -0.02em;
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

@media (min-width: 768px) {
  .boundary-grid,
  .search-steps ol {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 992px) {
  .content-layout,
  .before-panel__layout {
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    align-items: start;
    gap: clamp(2rem, 6vw, 5rem);
  }

  .pathway-list,
  .boundary-grid--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1200px) {
  .search-steps ol {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
