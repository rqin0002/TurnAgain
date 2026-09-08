<script setup>
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { useServiceRatings } from '../composables/useServiceRatings.js'
import RatingForm from './RatingForm.vue'

const props = defineProps({
  serviceId: {
    type: String,
    required: true,
  },
})

const router = useRouter()
const {
  formKey,
  isSaving,
  myRating,
  privateErrorMessage,
  privateStatus,
  reloadMyRating,
  reloadSummary,
  saveRating,
  successMessage,
  summary,
  summaryErrorMessage,
  summaryStatus,
} = useServiceRatings({ serviceId: () => props.serviceId })

const hasRatings = computed(() => (summary.value?.ratingCount ?? 0) > 0)
const formattedAverage = computed(() => summary.value?.averageRating?.toFixed(1) ?? '')
const ratingCountCopy = computed(() =>
  summary.value?.ratingCount === 1
    ? 'Based on 1 rating'
    : `Based on ${summary.value?.ratingCount ?? 0} ratings`,
)
const myRatingCopy = computed(() => {
  if (!myRating.value) {
    return ''
  }
  const unit = myRating.value.score === 1 ? 'star' : 'stars'
  return `Your rating: ${myRating.value.score} ${unit}`
})

const headingId = computed(() => `service-ratings-${props.serviceId}`)
const signInTarget = computed(() => {
  const serviceIntent = router.resolve({
    name: 'service-detail',
    params: { serviceId: props.serviceId },
  }).fullPath
  return { name: 'login', query: { redirect: serviceIntent } }
})
</script>

<template>
  <section class="service-ratings" :aria-labelledby="headingId">
    <div class="service-ratings__heading">
      <div>
        <p class="eyebrow service-ratings__eyebrow">Community feedback</p>
        <h2 :id="headingId">Community ratings</h2>
      </div>
      <button
        v-if="summaryStatus === 'error'"
        class="text-button"
        type="button"
        @click="reloadSummary"
      >
        Retry ratings
      </button>
    </div>

    <p v-if="summaryStatus === 'loading'" role="status" aria-live="polite">
      Loading community rating…
    </p>
    <p v-else-if="summaryErrorMessage" class="service-ratings__error" role="alert">
      {{ summaryErrorMessage }}
    </p>
    <div v-else-if="summary" class="rating-summary">
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

    <div class="service-ratings__editor">
      <h3>Rate this service</h3>

      <p
        v-if="privateStatus === 'waiting-for-auth'"
        class="service-ratings__muted"
        role="status"
        aria-live="polite"
      >
        Checking your sign-in before loading your rating…
      </p>
      <p
        v-else-if="privateStatus === 'loading'"
        class="service-ratings__muted"
        role="status"
        aria-live="polite"
      >
        Loading your rating…
      </p>
      <p v-else-if="privateStatus === 'anonymous'" class="service-ratings__muted">
        <RouterLink data-testid="rating-sign-in" :to="signInTarget">Sign in</RouterLink>
        to add or update your rating.
      </p>

      <template v-else>
        <div v-if="privateErrorMessage" class="service-ratings__private-error">
          <p class="service-ratings__error" role="alert">{{ privateErrorMessage }}</p>
          <button
            v-if="privateStatus === 'error'"
            class="text-button"
            type="button"
            @click="reloadMyRating"
          >
            Try loading your rating again
          </button>
        </div>

        <p
          v-if="successMessage"
          class="service-ratings__success"
          data-testid="rating-success"
          role="status"
          aria-live="polite"
        >
          {{ successMessage }}
        </p>

        <RatingForm
          v-if="privateStatus === 'ready' || privateStatus === 'saving'"
          :key="formKey"
          :rating="myRating"
          :pending="isSaving"
          :save-rating="saveRating"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.service-ratings {
  display: grid;
  gap: 1rem;
  border-top: 1px solid var(--color-border);
  padding: clamp(1.1rem, 4vw, 2rem);
}

.service-ratings__heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.service-ratings__eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.78rem;
}

.service-ratings h2,
.service-ratings h3 {
  margin: 0;
  color: var(--color-heading);
}

.service-ratings h2 {
  font-size: 1.35rem;
}

.service-ratings h3 {
  font-size: 1.1rem;
}

.service-ratings__editor {
  display: grid;
  gap: 0.8rem;
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 1rem;
}

.service-ratings__muted,
.service-ratings__error,
.service-ratings__success,
.service-ratings__private-error p {
  margin: 0;
}

.service-ratings__muted {
  color: var(--color-text-muted);
}

.service-ratings__error {
  color: var(--color-danger);
}

.service-ratings__success {
  border-left: 4px solid var(--color-brand);
  background: var(--color-brand-soft);
  padding: 0.75rem;
  color: var(--color-brand-strong);
}

.service-ratings__private-error {
  display: grid;
  justify-items: start;
  gap: 0.4rem;
}

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
