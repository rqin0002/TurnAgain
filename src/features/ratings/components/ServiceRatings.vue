<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { useServiceRatings } from '../composables/useServiceRatings.js'
import { describeRatingSummary, RATING_SCALE } from '../domain/ratingPresentation.js'
import RatingForm from './RatingForm.vue'

const props = defineProps({
  serviceId: { type: String, required: true },
  sourceUrl: { type: String, default: '' },
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
const isEditing = ref(false)
const editButton = ref(null)
const editor = ref(null)
const ratingsHeading = ref(null)
const insights = computed(() => describeRatingSummary(summary.value))
const number = (value) => new Intl.NumberFormat('en-AU').format(value)
const hasRatings = computed(() => (insights.value?.count ?? 0) > 0)
const myRatingLabel = computed(
  () => RATING_SCALE.find((option) => option.score === myRating.value?.score)?.label,
)
const myRatingCopy = computed(() =>
  myRating.value
    ? `Your rating: ${myRating.value.score} ${myRating.value.score === 1 ? 'star' : 'stars'}`
    : '',
)
const headingId = computed(() => `service-ratings-${props.serviceId}`)
const editorId = computed(() => `rating-editor-${props.serviceId}`)
// Service content arrives after the router's initial hash scroll. Complete an
// explicit rating intent here, once the target actually exists.
onMounted(() => {
  if (router.currentRoute.value.hash === `#${headingId.value}`) {
    ratingsHeading.value?.scrollIntoView({ block: 'start' })
    ratingsHeading.value?.focus({ preventScroll: true })
  }
})
const sampleCopy = computed(() => {
  const count = insights.value?.count ?? 0
  if (count === 1)
    return 'One rating is one perspective. Compare it with the provider’s information before deciding.'
  if (count < 5)
    return `Only ${number(count)} ratings so far. A few experiences may not reflect what you will experience.`
  return 'The average is one part of the picture. Check the spread of scores and whether the service accepts your item.'
})
const signInTarget = computed(() => ({
  name: 'login',
  query: {
    redirect: router.resolve({
      name: 'service-detail',
      params: { serviceId: props.serviceId },
      hash: `#${headingId.value}`,
    }).fullPath,
  },
}))

// An open editor belongs to one service and one signed-in identity.
watch(formKey, () => {
  isEditing.value = false
})
const saveDraft = (input) => {
  // Keep a first-time editor mounted until its saved event restores focus.
  // The composable publishes myRating before the form's await resumes.
  isEditing.value = true
  return saveRating(input)
}
const startEditing = async () => {
  privateErrorMessage.value = ''
  successMessage.value = ''
  isEditing.value = true
  await nextTick()
  editor.value?.querySelector('input[name="score"]:checked')?.focus()
}
const finishEditing = async () => {
  isEditing.value = false
  await nextTick()
  editButton.value?.focus()
}
const cancelEditing = () => {
  privateErrorMessage.value = ''
  successMessage.value = ''
  return finishEditing()
}
</script>

<template>
  <section class="service-ratings" :aria-labelledby="headingId">
    <header class="service-ratings__heading">
      <h2 :id="headingId" ref="ratingsHeading" tabindex="-1">Community ratings</h2>
      <p>Experiences shared by people using TurnAgain.</p>
    </header>

    <div class="service-ratings__layout">
      <div class="service-ratings__evidence">
        <p v-if="summaryStatus === 'loading'" class="rating-summary__loading" role="status">
          Loading community ratings…
        </p>
        <div
          v-else-if="summaryErrorMessage || (summaryStatus === 'ready' && !insights)"
          class="service-ratings__public-error"
        >
          <p class="service-ratings__error" role="alert">
            {{ summaryErrorMessage || 'The rating summary is unavailable. Please try again.' }}
          </p>
          <button class="text-button" type="button" @click="reloadSummary">Retry ratings</button>
        </div>
        <template v-else-if="insights">
          <div v-if="hasRatings" class="rating-summary" data-testid="rating-summary">
            <div class="rating-summary__overall">
              <p class="rating-summary__score" data-testid="overall-rating">
                <span class="visually-hidden">Overall rating: </span>
                <strong>{{ insights.average }}</strong
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
                <span class="rating-distribution__label"
                  >{{ row.score }} {{ row.score === 1 ? 'star' : 'stars' }}</span
                >
                <span class="rating-distribution__track" aria-hidden="true">
                  <span :style="{ width: `${row.percentage}%` }"></span>
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
            <p>
              A missing rating does not mean a poor service. Start with the provider’s information.
            </p>
          </div>
          <div v-if="hasRatings" class="rating-context">
            <p class="rating-context__fact" data-testid="rating-high-count">
              {{ number(insights.highCount) }} of {{ number(insights.count) }}
              {{ insights.count === 1 ? 'rating is' : 'ratings are' }} 4 or 5 stars.
            </p>
            <p>{{ sampleCopy }}</p>
          </div>
        </template>

        <a
          v-if="sourceUrl"
          class="rating-provider-link"
          :href="sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Check provider details<span class="visually-hidden"> (opens in a new tab)</span>
        </a>

        <details class="rating-explainer">
          <summary>What these ratings can tell you</summary>
          <ul>
            <li>
              Each account has one score per service. Updating it replaces the previous score.
            </li>
            <li>
              The average includes all submitted scores. The distribution shows where experiences
              differ. Percentages are rounded.
            </li>
            <li>
              Visits are not independently verified. Ratings do not confirm eligibility, opening
              hours or whether an item will be accepted.
            </li>
            <li>
              Written notes are private to their author and are not part of this public summary.
            </li>
          </ul>
          <p>Check the linked provider source before travelling.</p>
        </details>
      </div>

      <section ref="editor" class="service-ratings__editor" :aria-labelledby="editorId">
        <header class="service-ratings__editor-heading">
          <h3 :id="editorId">
            {{
              myRating
                ? isEditing
                  ? 'Update your rating'
                  : 'Your experience'
                : 'Share your experience'
            }}
          </h3>
          <p v-if="!myRating && privateStatus !== 'anonymous'">
            Rate a service you have used. A score is all you need to share.
          </p>
        </header>
        <p v-if="privateStatus === 'waiting-for-auth'" class="service-ratings__muted" role="status">
          Checking your sign-in before loading your rating…
        </p>
        <p v-else-if="privateStatus === 'loading'" class="service-ratings__muted" role="status">
          Loading your rating…
        </p>
        <div v-else-if="privateStatus === 'anonymous'" class="rating-sign-in">
          <p>Used this service? Share a score to help others compare their options.</p>
          <RouterLink class="button button--primary" data-testid="rating-sign-in" :to="signInTarget"
            >Sign in to rate</RouterLink
          >
          <p class="service-ratings__muted">
            You can browse all rating summaries without an account.
          </p>
        </div>
        <template v-else>
          <div v-if="privateErrorMessage" class="service-ratings__private-error">
            <p class="service-ratings__error" role="alert">{{ privateErrorMessage }}</p>
            <p v-if="privateStatus === 'ready'" class="service-ratings__muted">
              Your changes are still here. Try saving again.
            </p>
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
            v-if="successMessage && !isEditing"
            class="service-ratings__success"
            data-testid="rating-success"
            role="status"
          >
            {{ successMessage }}
          </p>

          <div v-if="myRating && !isEditing && privateStatus === 'ready'" class="rating-saved">
            <p class="rating-saved__score" data-testid="your-rating">
              <strong>{{ myRatingCopy }}</strong
              ><span>{{ myRatingLabel }}</span>
            </p>
            <p class="service-ratings__muted">Your score is included in the community rating.</p>
            <details v-if="myRating.reviewText" class="rating-saved__note">
              <summary>Your private note</summary>
              <p data-testid="your-review">{{ myRating.reviewText }}</p>
              <span class="service-ratings__muted">Only you can read this note.</span>
            </details>
            <button
              ref="editButton"
              class="button button--secondary"
              type="button"
              @click="startEditing"
            >
              Edit your rating
            </button>
          </div>
          <RatingForm
            v-else-if="privateStatus === 'ready' || privateStatus === 'saving'"
            :key="formKey"
            :rating="myRating"
            :pending="isSaving"
            :save-rating="saveDraft"
            @saved="finishEditing"
            @cancel="cancelEditing"
          />
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped>
.service-ratings {
  display: grid;
  gap: 2rem;
  border-top: 1px solid var(--color-border);
  padding-block: clamp(2rem, 4vw, 3rem);
}

.service-ratings h2,
.service-ratings h3 {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.service-ratings h2 {
  font-size: clamp(1.5rem, 3vw, 1.875rem);
}

.service-ratings h3 {
  font-size: 1.25rem;
}

.service-ratings__heading p {
  margin: 0.625rem 0 0;
  color: var(--color-text-muted);
}

.service-ratings__public-error {
  display: grid;
  justify-items: start;
  gap: 0.5rem;
}

.service-ratings__layout {
  display: grid;
  align-items: start;
  gap: 2rem;
}

.service-ratings__evidence {
  min-width: 0;
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
  grid-template-columns: 3rem minmax(2rem, 1fr) 6.5rem;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.rating-distribution__label {
  white-space: nowrap;
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
.rating-empty p,
.service-ratings__editor-heading p {
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

.rating-explainer {
  margin-top: 1rem;
  font-size: 0.8125rem;
}

.rating-provider-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
}

.rating-explainer > summary,
.rating-saved__note > summary {
  min-height: 2.75rem;
  padding-block: 0.625rem;
  color: var(--color-link);
  cursor: pointer;
}

.rating-explainer ul {
  display: grid;
  gap: 0.5rem;
  margin: 0.5rem 0;
  padding-left: 1.1rem;
  color: var(--color-text-muted);
}

.rating-explainer p {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
}

.service-ratings__editor {
  display: grid;
  min-width: 0;
  gap: 1.25rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.service-ratings__muted,
.service-ratings__error,
.service-ratings__success,
.service-ratings__private-error p {
  margin: 0;
}

.service-ratings__muted {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

.service-ratings__error {
  color: var(--color-danger);
}

.service-ratings__success {
  border-radius: var(--radius-small);
  background: var(--color-brand-soft);
  padding: 0.75rem 0.875rem;
  color: var(--color-brand-strong);
  font-size: 0.875rem;
}

.service-ratings__private-error,
.rating-sign-in {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
}

.rating-sign-in > p {
  margin: 0;
}

.rating-saved {
  display: grid;
  justify-items: start;
  gap: 1rem;
}

.rating-saved__score {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem 0.75rem;
  margin: 0;
}

.rating-saved__score > strong {
  color: var(--color-heading);
  font-size: 1.0625rem;
  font-weight: 600;
}

.rating-saved__score > span {
  color: var(--color-brand-strong);
  font-size: 0.875rem;
}

.rating-saved__note {
  width: 100%;
  border-block: 1px solid var(--color-border);
}

.rating-saved__note > p {
  margin: 0.25rem 0 0.5rem;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.rating-saved__note > span {
  display: block;
  padding-bottom: 0.75rem;
}

@media (min-width: 576px) {
  .rating-summary {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2rem;
  }
}

@media (min-width: 960px) {
  .service-ratings__layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: clamp(2rem, 4vw, 3.5rem);
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
