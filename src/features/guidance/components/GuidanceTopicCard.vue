<script setup>
import { RouterLink } from 'vue-router'

defineProps({
  topic: {
    type: Object,
    required: true,
  },
})

const checkedDateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Australia/Melbourne',
})

/**
 * Formats an editorial calendar date without allowing the viewer's timezone to
 * move it into the previous or next day.
 *
 * @param {string} value ISO date in YYYY-MM-DD form.
 * @returns {string} A reader-friendly Australian date.
 */
const formatCheckedDate = (value) => checkedDateFormatter.format(new Date(`${value}T12:00:00Z`))
</script>

<template>
  <article :id="topic.id" class="guidance-card">
    <div class="guidance-card__body">
      <div>
        <p class="guidance-card__scope">{{ topic.scope }}</p>
        <h3>{{ topic.title }}</h3>
        <p class="guidance-card__summary">{{ topic.summary }}</p>

        <ul class="guidance-card__steps">
          <li v-for="step in topic.steps" :key="step">{{ step }}</li>
        </ul>
      </div>
    </div>

    <footer class="guidance-card__footer">
      <div class="guidance-card__sources">
        <p>Official sources</p>
        <ul>
          <li v-for="source in topic.sources" :key="source.url">
            <a :href="source.url">{{ source.title }} — {{ source.organisation }}</a>
            <span>
              Checked
              <time :datetime="source.checkedAt">{{ formatCheckedDate(source.checkedAt) }}</time>
            </span>
          </li>
        </ul>
      </div>

      <RouterLink v-if="topic.action" class="guidance-card__action" :to="topic.action.to">
        {{ topic.action.label }}
      </RouterLink>
    </footer>
  </article>
</template>

<style scoped>
.guidance-card {
  display: grid;
  min-width: 0;
  gap: 2rem;
  scroll-margin-top: 2rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.5rem, 4vw, 3rem);
}

.guidance-card__scope {
  margin: 0 0 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.6;
}

.guidance-card h3 {
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(1.625rem, 3vw, 2.25rem);
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1.15;
  text-wrap: balance;
}

.guidance-card__summary {
  max-width: 48rem;
  margin: 1.25rem 0 0;
  line-height: 1.8;
}

.guidance-card__steps {
  display: grid;
  gap: 0.75rem;
  margin: 1.25rem 0 0;
  padding-left: 1.15rem;
}

.guidance-card__steps li {
  padding-left: 0.25rem;
  color: var(--color-text-muted);
  line-height: 1.75;
}

.guidance-card__footer {
  display: grid;
  gap: 1.25rem;
  border-top: 1px solid var(--color-border);
  padding-top: 1.5rem;
}

.guidance-card__sources {
  display: grid;
  min-width: 0;
  gap: 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.guidance-card__sources > p {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.guidance-card__sources ul {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.guidance-card__sources li {
  display: grid;
  gap: 0.25rem;
  line-height: 1.7;
}

.guidance-card__sources a {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  min-height: 2.75rem;
  align-items: center;
  color: var(--color-brand);
  overflow-wrap: anywhere;
  text-underline-offset: 0.2em;
}

.guidance-card__sources span {
  font-size: 0.8125rem;
}

.guidance-card__action {
  display: inline-flex;
  width: fit-content;
  min-height: 2.75rem;
  align-items: center;
  color: var(--color-brand);
  font-weight: 600;
  text-underline-offset: 0.2em;
}
</style>
