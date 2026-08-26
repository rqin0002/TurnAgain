<script setup>
import { computed } from 'vue'

const props = defineProps({
  summary: {
    type: Object,
    required: true,
  },
  myRating: {
    type: Object,
    default: null,
  },
})

const hasRatings = computed(() => props.summary.ratingCount > 0)
const formattedAverage = computed(() => props.summary.averageRating?.toFixed(1) ?? '')
const ratingCountCopy = computed(() =>
  props.summary.ratingCount === 1
    ? 'Based on 1 rating'
    : `Based on ${props.summary.ratingCount} ratings`,
)
const myRatingCopy = computed(() => {
  if (!props.myRating) {
    return ''
  }
  const unit = props.myRating.score === 1 ? 'star' : 'stars'
  return `Your rating: ${props.myRating.score} ${unit}`
})
</script>

<template>
  <div class="rating-summary">
    <div class="rating-summary__overall">
      <p v-if="hasRatings" data-testid="overall-rating">
        Overall rating: <strong>{{ formattedAverage }}</strong> out of 5 stars
      </p>
      <p v-else data-testid="overall-rating"><strong>No ratings yet</strong></p>
      <p data-testid="rating-count">
        {{ hasRatings ? ratingCountCopy : 'Be the first to rate this service' }}
      </p>
    </div>

    <div v-if="myRating" class="rating-summary__private">
      <p data-testid="your-rating">
        <strong>{{ myRatingCopy }}</strong>
      </p>
      <p v-if="myRating.reviewText" data-testid="your-review">
        Your review: {{ myRating.reviewText }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.rating-summary {
  display: grid;
  gap: 1rem;
}

.rating-summary__overall,
.rating-summary__private {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  padding: 1rem;
}

.rating-summary__overall {
  background: var(--color-brand-soft);
}

.rating-summary p {
  margin: 0;
}

.rating-summary p + p {
  margin-top: 0.35rem;
}

.rating-summary__private p:last-child {
  overflow-wrap: anywhere;
}

@media (min-width: 576px) {
  .rating-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rating-summary__overall:only-child {
    grid-column: 1 / -1;
  }
}
</style>
