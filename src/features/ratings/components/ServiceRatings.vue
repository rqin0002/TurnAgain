<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import StatePanel from '@/shared/components/StatePanel.vue'

import { useServiceRatings } from '../composables/useServiceRatings.js'
import { RATING_SCALE } from '../domain/ratingPresentation.js'
import RatingForm from './RatingForm.vue'
import RatingSummary from './RatingSummary.vue'

const props = defineProps({
  serviceId: { type: String, required: true },
  sourceUrl: { type: String, default: '' },
})
const router = useRouter()
const {
  formKey,
  isSaving,
  myRating,
  privateError,
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
const myRatingLabel = computed(
  () => RATING_SCALE.find((option) => option.score === myRating.value?.score)?.label,
)
const myRatingCopy = computed(() =>
  myRating.value
    ? `Your rating: ${myRating.value.score} ${myRating.value.score === 1 ? 'star' : 'stars'}`
    : '',
)
const headingId = computed(() => `service-ratings-${props.serviceId}`)
// A read or a write that failed for want of a connection renders the offline panel with Retry;
// every other failure keeps the inline alert. Only these two codes mean "offline".
const CONNECTION_CODES = Object.freeze(['offline', 'network'])
const privateConnectionError = computed(() =>
  privateError.value && CONNECTION_CODES.includes(privateError.value.code)
    ? privateError.value
    : null,
)
// A failed read (privateStatus 'error') and a failed save (back to 'ready') share the panel.
const privatePanelTitle = computed(() =>
  privateStatus.value === 'error' ? 'Your rating could not be loaded' : 'Your rating was not saved',
)
let lastSaveInput = null
const editorId = computed(() => `rating-editor-${props.serviceId}`)
// Service content arrives after the router's initial hash scroll. Complete an
// explicit rating intent here, once the target actually exists.
onMounted(() => {
  if (router.currentRoute.value.hash === `#${headingId.value}`) {
    ratingsHeading.value?.scrollIntoView({ block: 'start' })
    ratingsHeading.value?.focus({ preventScroll: true })
  }
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

// A save that finds no summary unmounts the editor under the person's focus (the submit button,
// or the body once the pending button was disabled); the heading takes it rather than the body.
// Focus the person moved elsewhere meanwhile stays where it is.
watch(summaryStatus, async (status, previous) => {
  if (status !== 'unrateable' || previous !== 'ready') return
  const focused = document.activeElement
  const focusWasInEditor =
    focused === null || focused === document.body || editor.value?.contains(focused) === true
  if (!focusWasInEditor) return
  await nextTick()
  ratingsHeading.value?.focus({ preventScroll: true })
})

// An open editor belongs to one service and one signed-in identity.
watch(formKey, () => {
  isEditing.value = false
})
const saveDraft = (input) => {
  // Keep a first-time editor mounted until its saved event restores focus.
  // The composable publishes myRating before the form's await resumes.
  isEditing.value = true
  lastSaveInput = input
  return saveRating(input)
}
const startEditing = async () => {
  privateError.value = null
  privateErrorMessage.value = ''
  successMessage.value = ''
  isEditing.value = true
  await nextTick()
  editor.value?.querySelector('input[name="score"]:checked')?.focus({ preventScroll: true })
}
const finishEditing = async () => {
  isEditing.value = false
  await nextTick()
  editButton.value?.focus({ preventScroll: true })
}
const cancelEditing = () => {
  privateError.value = null
  privateErrorMessage.value = ''
  successMessage.value = ''
  return finishEditing()
}
// An edit after a save failed offline makes the kept draft stale: the panel, its message and its
// Retry go, so the next save sends what the form now holds. The message goes too,
// or the inline alert would take the panel's place. A failed read keeps its panel.
const onDraftEdited = () => {
  if (!privateConnectionError.value || privateStatus.value !== 'ready') return
  privateError.value = null
  privateErrorMessage.value = ''
  lastSaveInput = null
}
// Retry on the offline panel re-submits the draft that failed (a failed read reloads instead);
// a save that succeeds here closes the editor the way the form's own saved event does.
const retryPrivate = async () => {
  if (privateStatus.value !== 'ready' || lastSaveInput === null) return reloadMyRating()
  const result = await saveRating(lastSaveInput)
  if (result) await finishEditing()
  return result
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
        <p v-if="summaryStatus === 'loading'" class="visually-hidden" role="status">
          Loading community ratings…
        </p>
        <div class="rating-summary-frame" :aria-busy="summaryStatus === 'loading'">
          <div>
            <div v-if="summaryStatus === 'loading'" class="rating-summary__loading">
              <div class="rating-skeleton rating-skeleton__summary" aria-hidden="true">
                <div class="rating-skeleton__overall">
                  <span class="rating-skeleton__score"></span>
                  <span class="rating-skeleton__count"></span>
                </div>
                <div class="rating-skeleton__bars">
                  <span v-for="score in 5" :key="score"></span>
                </div>
              </div>
              <div class="rating-skeleton rating-skeleton__context" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
            </div>
            <div v-else-if="summaryStatus === 'unrateable'" class="service-ratings__public-error">
              <p class="service-ratings__unrateable" role="status" data-testid="rating-unrateable">
                This listing can't be rated yet.
              </p>
            </div>
            <div v-else-if="summaryStatus === 'error'" class="service-ratings__public-error">
              <p class="service-ratings__error" role="alert">{{ summaryErrorMessage }}</p>
              <button class="text-button" type="button" @click="reloadSummary">
                Retry ratings
              </button>
            </div>
            <RatingSummary v-else-if="summaryStatus === 'ready'" :summary="summary" />
          </div>
        </div>

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

      <section
        v-if="summaryStatus !== 'unrateable'"
        ref="editor"
        class="service-ratings__editor"
        :aria-labelledby="editorId"
      >
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
        <div class="service-ratings__editor-content">
          <p
            v-if="privateStatus === 'waiting-for-auth'"
            class="service-ratings__muted"
            role="status"
          >
            Checking your sign-in before loading your rating…
          </p>
          <div v-else-if="privateStatus === 'loading'" class="rating-editor-loading">
            <p class="service-ratings__muted" role="status">Loading your rating…</p>
            <div class="rating-skeleton rating-skeleton__editor" aria-hidden="true">
              <span></span>
              <div class="rating-skeleton__choices">
                <span v-for="score in 5" :key="score"></span>
              </div>
              <span></span><span></span>
              <span class="rating-skeleton__button"></span>
            </div>
          </div>
          <div v-else-if="privateStatus === 'anonymous'" class="rating-sign-in">
            <p>Used this service? Share a score to help others compare their options.</p>
            <RouterLink
              class="button button--primary"
              data-testid="rating-sign-in"
              :to="signInTarget"
              >Sign in to rate</RouterLink
            >
            <p class="service-ratings__muted">
              You can browse all rating summaries without an account.
            </p>
          </div>
          <template v-else>
            <StatePanel
              v-if="privateConnectionError"
              variant="offline"
              :title="privatePanelTitle"
              :error="privateConnectionError"
              :assertive="privateStatus === 'ready'"
              @retry="retryPrivate"
            />
            <div v-else-if="privateErrorMessage" class="service-ratings__private-error">
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
                <p data-testid="your-review" dir="auto">{{ myRating.reviewText }}</p>
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
              @edit="onDraftEdited"
            />
          </template>
        </div>
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

.service-ratings__unrateable {
  margin: 0;
  color: var(--color-text-muted);
}

.rating-summary-frame {
  position: relative;
  overflow: clip;
  overflow-clip-margin: 0.375rem;
  overflow-anchor: none;
}

/* The skeleton mirrors RatingSummary's layout without borrowing its scoped classes. */
.rating-summary__loading {
  container: rating-skeleton / inline-size;
}

.rating-skeleton {
  animation: rating-loading-pulse 1.4s ease-in-out infinite alternate;
}

.rating-skeleton__summary {
  display: grid;
  gap: 1.5rem;
}

.rating-skeleton span {
  display: block;
  height: 0.75rem;
  border-radius: 0.25rem;
  background: var(--color-border);
}

.rating-skeleton__overall .rating-skeleton__score {
  width: 5.5rem;
  height: 3.5rem;
}

.rating-skeleton__overall .rating-skeleton__count {
  width: 3.5rem;
  margin-top: 0.75rem;
}

.rating-skeleton__bars {
  display: grid;
  align-content: center;
  gap: 0.625rem;
}

.rating-skeleton__bars > span {
  height: 1.25rem;
}

.rating-skeleton__context {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.5rem;
  border-top: 1px solid var(--color-border);
  padding-block: 1.25rem 0.75rem;
}

.rating-skeleton__context > span:first-child {
  width: 70%;
}
.rating-skeleton__context > span:last-child {
  width: 85%;
}

.rating-skeleton__editor {
  display: grid;
  align-content: start;
  gap: 1.5rem;
  min-height: 18rem;
  padding-top: 1.25rem;
}

.rating-skeleton__choices {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.375rem;
}

.rating-skeleton__choices > span {
  height: 3.5rem;
  border-radius: var(--radius-small);
}

.rating-skeleton__editor .rating-skeleton__button {
  width: 8rem;
  height: 2.75rem;
  border-radius: var(--radius-small);
}

@keyframes rating-loading-pulse {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 0.85;
  }
}

.service-ratings__editor-heading p {
  margin: 0.5rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
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
  position: relative;
  display: grid;
  align-content: start;
  overflow: clip;
  overflow-anchor: none;
  min-width: 0;
  gap: 1.25rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.service-ratings__editor-content {
  display: grid;
  gap: 1.25rem;
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

@container rating-skeleton (min-width: 24rem) {
  .rating-skeleton__summary {
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

@media (prefers-reduced-motion: reduce) {
  .rating-skeleton {
    animation: none;
    transition: none;
  }
}
</style>
