<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { describeRatingSummary } from '../domain/ratingPresentation.js'
import { animateRatingSummary } from '@/shared/motion/index.js'

/**
 * The public rating summary of one service: the overall score, the distribution and
 * the sample note on Service Detail; the one-line form on cards and the Top-5 list (`compact`).
 * A summary that does not describe reads "Rating unavailable"; a zero summary reads as unrated.
 */
const props = defineProps({
  summary: { type: Object, default: null },
  compact: { type: Boolean, default: false },
})

const insights = computed(() => describeRatingSummary(props.summary))
const number = (value) => new Intl.NumberFormat('en-AU').format(value)
const hasRatings = computed(() => (insights.value?.count ?? 0) > 0)
const compactCopy = computed(() => {
  if (!insights.value) return 'Rating unavailable'
  if (!hasRatings.value) return 'Unrated'
  const count = insights.value.count
  return `${insights.value.average} / 5 · ${number(count)} ${count === 1 ? 'rating' : 'ratings'}`
})
const sampleCopy = computed(() => {
  const count = insights.value?.count ?? 0
  if (count === 1)
    return 'One rating is one perspective. Compare it with the provider’s information before deciding.'
  if (count < 5)
    return `Only ${number(count)} ratings so far. A few experiences may not reflect what you will experience.`
  return 'The average is one part of the picture. Check the spread of scores and whether the service accepts your item.'
})

// Explicit effect: bars grow and the average counts up when a summary appears or
// changes. The target values are the component's own (never read back from the DOM), a change
// while the count runs cancels the previous run, and the function no-ops under reduced motion.
const root = ref(null)
const reveal = () =>
  void nextTick(() =>
    animateRatingSummary(root.value, {
      average: insights.value?.average,
      count: insights.value?.count ?? 0,
    }),
  )
onMounted(reveal)
watch(() => props.summary, reveal)
</script>

<template>
  <p v-if="compact" class="rating-summary--compact">{{ compactCopy }}</p>
  <div v-else-if="insights" ref="root" class="rating-summary-panel">
    <div v-if="hasRatings" class="rating-summary" data-testid="rating-summary">
      <div class="rating-summary__overall">
        <p class="rating-summary__score" data-testid="overall-rating">
          <span class="visually-hidden">Overall rating: </span>
          <strong data-rating-average>{{ insights.average }}</strong
          ><span aria-hidden="true">/ 5</span>
          <span class="visually-hidden">out of 5 stars</span>
        </p>
        <p class="rating-summary__count" data-testid="rating-count">
          {{ number(insights.count) }} {{ insights.count === 1 ? 'rating' : 'ratings' }}
        </p>
      </div>
      <ol class="rating-distribution" aria-label="Rating distribution">
        <li
          v-for="row in insights.rows"
          :key="row.score"
          :data-testid="`rating-bucket-${row.score}`"
        >
          <span
            class="rating-distribution__label"
            role="img"
            :aria-label="`${row.score} ${row.score === 1 ? 'star' : 'stars'}`"
          >
            <svg
              v-for="star in 5"
              :key="star"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              :class="{ 'rating-distribution__star--filled': star <= row.score }"
            >
              <path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 3 1.1-6.3L3 9.6l6.2-.9Z" />
            </svg>
          </span>
          <span class="rating-distribution__track" aria-hidden="true">
            <span data-rating-bar :style="{ width: `${row.percentage}%` }"></span>
          </span>
          <span class="rating-distribution__value">
            <strong>{{ number(row.count) }}</strong>
            <span>({{ row.percentageLabel }})</span>
          </span>
        </li>
      </ol>
    </div>
    <div v-else class="rating-empty">
      <h3 data-testid="overall-rating">No ratings yet</h3>
      <p data-testid="rating-count">There is no community score for this service yet.</p>
      <p>A missing rating does not mean a poor service. Start with the provider’s information.</p>
    </div>
    <div v-if="hasRatings" class="rating-context">
      <p class="rating-context__fact" data-testid="rating-high-count">
        {{ number(insights.highCount) }} of {{ number(insights.count) }}
        {{ insights.count === 1 ? 'rating is' : 'ratings are' }} 4 or 5 stars.
      </p>
      <p>{{ sampleCopy }}</p>
    </div>
  </div>
  <p v-else class="rating-summary--compact">Rating unavailable</p>
</template>

<style scoped>
.rating-summary--compact {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.rating-summary-panel {
  container: rating-evidence / inline-size;
}

.rating-summary {
  display: grid;
  gap: 1.5rem;
}

.rating-summary__score {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.rating-summary__score strong {
  color: var(--color-heading);
  font-size: 4rem;
  font-weight: 600;
  letter-spacing: -0.055em;
}

.rating-summary__count {
  margin: 0.625rem 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.rating-distribution {
  display: grid;
  align-content: center;
  gap: 0.625rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rating-distribution li {
  display: grid;
  grid-template-columns: 4.75rem minmax(2rem, 1fr) 6.5rem;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.rating-distribution__label {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  color: var(--color-brand);
}

.rating-distribution__label svg {
  width: 0.75rem;
  height: 0.75rem;
  flex: none;
  fill: none;
  stroke: var(--color-border-strong);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.rating-distribution__label .rating-distribution__star--filled {
  fill: currentColor;
  stroke: currentColor;
}

.rating-distribution__track {
  height: 0.375rem;
  overflow: hidden;
  border-radius: 1rem;
  background: var(--color-border);
}

.rating-distribution__track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-brand);
  transform-origin: left center;
  transition: width 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.rating-distribution__value {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: 0.3rem;
  min-width: 4.25rem;
  color: var(--color-text-muted);
}

.rating-distribution__value strong {
  color: var(--color-heading);
  font-weight: 500;
}

.rating-context {
  margin-top: 1.5rem;
  border-top: 1px solid var(--color-border);
  padding-top: 1.25rem;
}

.rating-context p,
.rating-empty p {
  margin: 0.5rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.rating-context .rating-context__fact {
  margin-top: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.rating-empty {
  padding-block: 0.5rem 0.75rem;
}

.rating-empty h3 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

@container rating-evidence (min-width: 24rem) {
  .rating-summary {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2rem;
  }
}

/* Enlarged text still needs room for every star and the literal vote count. */
@container rating-evidence (max-width: 16rem) {
  .rating-distribution li {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.375rem;
  }

  .rating-distribution__value {
    justify-content: start;
  }
}

@media (forced-colors: active) {
  .rating-distribution__track {
    border: 1px solid CanvasText;
  }
  .rating-distribution__track > span {
    background: Highlight;
    forced-color-adjust: none;
  }
}
</style>
