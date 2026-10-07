<script setup>
import { RouterLink, useRouter } from 'vue-router'

import GuidanceTopicCard from '@/features/guidance/components/GuidanceTopicCard.vue'
import { formatCheckedDate } from '@/features/guidance/domain/guidancePresentation.js'
import { GUIDANCE_TOPICS, WASTE_TERMS_ID } from '@/features/guidance/domain/guidanceTopics.js'

const router = useRouter()
const guides = GUIDANCE_TOPICS.filter((topic) => topic.id !== WASTE_TERMS_ID)
const glossary = GUIDANCE_TOPICS.find((topic) => topic.id === WASTE_TERMS_ID)

const goToTopic = async (event, hash) => {
  // Keep modified clicks and opening a topic in a new tab native.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const topic = document.getElementById(hash.slice(1))
  if (!topic) return

  event.preventDefault()
  await router.push({ name: 'guides', hash })
  if (router.currentRoute.value.name !== 'guides' || router.currentRoute.value.hash !== hash) return

  // Match About's section navigation without interrupting the smooth scroll. A card's heading is
  // an h3; the glossary section's is an h2.
  const heading = topic.querySelector('h2, h3')
  if (heading) {
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }
}
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
          <a
            v-for="topic in GUIDANCE_TOPICS"
            :key="topic.id"
            :href="`#${topic.id}`"
            @click="goToTopic($event, `#${topic.id}`)"
          >
            {{ topic.title }}
          </a>
        </nav>

        <div class="guides-grid">
          <GuidanceTopicCard v-for="topic in guides" :key="topic.id" :topic="topic" />
        </div>
      </div>
    </section>

    <section
      :id="glossary.id"
      class="page-section guides-glossary"
      aria-labelledby="waste-terms-title"
    >
      <div class="shell">
        <div class="guides-heading">
          <div>
            <p class="eyebrow">{{ glossary.scope }}</p>
            <h2 id="waste-terms-title">{{ glossary.title }}</h2>
            <p class="guides-glossary__summary">{{ glossary.summary }}</p>
          </div>
        </div>

        <dl class="guides-glossary__terms">
          <div v-for="entry in glossary.terms" :key="entry.term">
            <dt>{{ entry.term }}</dt>
            <dd>{{ entry.definition }}</dd>
          </div>
        </dl>

        <div class="guides-glossary__sources">
          <p>Official sources</p>
          <ul>
            <li v-for="source in glossary.sources" :key="source.url">
              <a :href="source.url">{{ source.title }} — {{ source.organisation }}</a>
              <span>
                Checked
                <time :datetime="source.checkedAt">{{ formatCheckedDate(source.checkedAt) }}</time>
              </span>
            </li>
          </ul>
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

.guides-page section[id] {
  scroll-margin-top: 2rem;
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

.guides-glossary {
  background: var(--color-surface-muted);
}

.guides-glossary__summary {
  max-width: 43rem;
  margin: 1rem auto 0;
  color: var(--color-text-muted);
  line-height: 1.75;
}

.guides-glossary__terms {
  display: grid;
  max-width: 60rem;
  gap: 1rem;
  margin: 0 auto;
}

.guides-glossary__terms > div {
  display: grid;
  gap: 0.35rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: 1.25rem 1.5rem;
}

.guides-glossary__terms dt {
  color: var(--color-heading);
  font-weight: 600;
}

.guides-glossary__terms dd {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.guides-glossary__sources {
  display: grid;
  max-width: 60rem;
  gap: 0.75rem;
  margin: 2rem auto 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.guides-glossary__sources > p {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.guides-glossary__sources ul {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.guides-glossary__sources li {
  display: grid;
  gap: 0.25rem;
  line-height: 1.7;
}

.guides-glossary__sources a {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  min-height: 2.75rem;
  align-items: center;
  color: var(--color-brand);
  overflow-wrap: anywhere;
  text-underline-offset: 0.2em;
}

.guides-glossary__sources span {
  font-size: 0.8125rem;
}

@media (min-width: 768px) {
  .guides-glossary__terms {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
