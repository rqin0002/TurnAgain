<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'

import { RATING_SCALE } from '../domain/ratingPresentation.js'
import { validateRatingInput } from '../domain/ratingValidation.js'

const props = defineProps({
  rating: { type: Object, default: null },
  pending: { type: Boolean, default: false },
  saveRating: { type: Function, required: true },
})
const emit = defineEmits(['saved', 'cancel'])
const form = ref(null)
const isSubmitting = ref(false)
const summaryError = ref('')
const noteOpen = ref(false)
const fields = reactive({ score: null, reviewText: '' })
const errors = reactive({ score: '', reviewText: '' })
const isPending = computed(() => props.pending || isSubmitting.value)
const selectedOption = computed(() => RATING_SCALE.find((option) => option.score === fields.score))
const validation = computed(() => validateRatingInput({ ...fields }))
const reviewCount = computed(() => Array.from(fields.reviewText).length)
const formattedReviewCount = computed(() =>
  new Intl.NumberFormat('en-AU').format(reviewCount.value),
)
const hasChanges = computed(
  () =>
    !props.rating ||
    !validation.value.isValid ||
    validation.value.values.score !== props.rating.score ||
    validation.value.values.reviewText !== (props.rating.reviewText ?? null),
)
const reviewDescription = computed(() =>
  ['rating-note-privacy', 'rating-review-count', errors.reviewText && 'rating-review-error']
    .filter(Boolean)
    .join(' '),
)
const reviewErrorMessage = computed(() => errors.reviewText.replace(/^Review/u, 'Note'))

watch(
  () => props.rating,
  (rating) => {
    fields.score = rating?.score ?? null
    fields.reviewText = rating?.reviewText ?? ''
    noteOpen.value = Boolean(rating?.reviewText)
    errors.score = ''
    errors.reviewText = rating?.reviewError
      ? 'Your saved note contains unsupported characters. Replace or clear it before saving.'
      : ''
    summaryError.value = ''
  },
  { immediate: true },
)

const updateScore = (score) => {
  fields.score = score
  errors.score = ''
  summaryError.value = ''
}
const updateReview = (event) => {
  fields.reviewText = event.target.value
  errors.reviewText = ''
  summaryError.value = ''
}
const focusFirstInvalid = async () => {
  if (errors.reviewText) noteOpen.value = true
  await nextTick()
  form.value
    ?.querySelector(errors.score ? 'input[name="score"]' : 'textarea[name="reviewText"]')
    ?.focus()
}
const submit = async () => {
  if (isPending.value || (props.rating && !hasChanges.value)) return
  summaryError.value = ''
  const result = validation.value
  Object.assign(errors, result.errors)
  if (!result.isValid) {
    summaryError.value = 'Check the highlighted fields and try again.'
    await focusFirstInvalid()
    return
  }
  isSubmitting.value = true
  try {
    const saved = await props.saveRating(result.values)
    if (saved) emit('saved')
  } catch {
    summaryError.value = 'We could not save your rating. Your changes are still here. Try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form ref="form" class="rating-form" novalidate :aria-busy="isPending" @submit.prevent="submit">
    <p v-if="summaryError" class="rating-form__alert" role="alert">{{ summaryError }}</p>
    <fieldset
      class="rating-form__score"
      :disabled="isPending"
      :aria-invalid="errors.score ? 'true' : undefined"
      :aria-describedby="
        errors.score ? 'rating-score-error rating-scale-help' : 'rating-scale-help'
      "
    >
      <legend>How was your experience?</legend>
      <p id="rating-scale-help" class="rating-form__hint">
        Choose a score from 1 (very poor) to 5 (excellent).
      </p>
      <div class="rating-form__choices">
        <label
          v-for="option in RATING_SCALE"
          :key="option.score"
          class="rating-form__choice"
          :class="{ 'rating-form__choice--selected': fields.score === option.score }"
        >
          <input
            :id="`rating-score-${option.score}`"
            v-model="fields.score"
            name="score"
            type="radio"
            :value="option.score"
            required
            :aria-label="`${option.score} out of 5 — ${option.label}`"
            :aria-invalid="errors.score ? 'true' : undefined"
            :aria-describedby="errors.score ? 'rating-score-error' : undefined"
            @change="updateScore(option.score)"
          />
          <span aria-hidden="true">{{ option.score }}</span>
        </label>
      </div>
      <div class="rating-form__meaning" role="status" aria-live="polite" aria-atomic="true">
        <template v-if="selectedOption">
          <strong>{{ selectedOption.label }}</strong>
          <span>{{ selectedOption.description }}</span>
        </template>
        <span v-else>Your own experience helps someone else weigh their options.</span>
      </div>
      <p v-if="errors.score" id="rating-score-error" class="rating-form__error">
        {{ errors.score }}
      </p>
    </fieldset>

    <details class="rating-form__note" :open="noteOpen" @toggle="noteOpen = $event.target.open">
      <summary>Private note <span>Optional</span></summary>
      <div class="rating-form__review">
        <label for="rating-review">What would you like to remember?</label>
        <p id="rating-note-privacy" class="rating-form__hint">
          Only you can read this note. It is not a public review.
        </p>
        <textarea
          id="rating-review"
          class="form-control"
          name="reviewText"
          rows="3"
          placeholder="For example, the item you brought, any fees, or something to check next time."
          :value="fields.reviewText"
          :disabled="isPending"
          :aria-invalid="errors.reviewText ? 'true' : undefined"
          :aria-describedby="reviewDescription"
          @input="updateReview"
        ></textarea>
        <p id="rating-review-count" class="rating-form__count">
          {{ formattedReviewCount }} / 1,000 characters
        </p>
        <p v-if="errors.reviewText" id="rating-review-error" class="rating-form__error">
          {{ reviewErrorMessage }}
        </p>
      </div>
    </details>

    <div class="rating-form__footer">
      <p class="rating-form__hint">
        Your score is included in the public average. You can change it later.
      </p>
      <div class="rating-form__actions">
        <button
          class="button button--primary"
          type="submit"
          :disabled="isPending || (Boolean(rating) && !hasChanges)"
        >
          {{ isPending ? 'Saving…' : rating ? 'Save changes' : 'Share rating' }}
        </button>
        <button
          v-if="rating"
          class="text-button"
          type="button"
          :disabled="isPending"
          @click="emit('cancel')"
        >
          Cancel changes
        </button>
      </div>
      <p v-if="isPending" class="rating-form__hint" role="status">Saving your rating…</p>
      <p v-else-if="rating && hasChanges" class="rating-form__hint">You have unsaved changes.</p>
    </div>
  </form>
</template>

<style scoped>
.rating-form {
  display: grid;
  gap: 1.25rem;
}

.rating-form__alert,
.rating-form__error {
  color: var(--color-danger);
}

.rating-form__alert {
  margin: 0;
  border-radius: var(--radius-small);
  background: var(--color-danger-soft);
  padding: 0.875rem 1rem;
}

.rating-form__score {
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}

.rating-form legend {
  padding: 0;
  color: var(--color-heading);
  font-size: 1rem;
  font-weight: 600;
}

.rating-form__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  line-height: 1.6;
}

.rating-form__score > .rating-form__hint {
  margin-top: 0.375rem;
}

.rating-form__choices {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.375rem;
  margin-top: 1rem;
}

.rating-form__choice {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 3.5rem;
  place-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-small);
  background: var(--color-surface);
  cursor: pointer;
  transition:
    border-color var(--duration-fast),
    background-color var(--duration-fast);
}

.rating-form__choice input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.rating-form__choice input:focus-visible {
  /* The enclosing choice supplies the full-size visible focus ring. */
  outline: none;
}

.rating-form__choice > span {
  color: var(--color-heading);
  font-size: 1.375rem;
  font-weight: 600;
  pointer-events: none;
}

.rating-form__choice:focus-within {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.rating-form__choice:hover {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}

.rating-form__choice--selected {
  border: 2px solid var(--color-brand);
  background: var(--color-brand-soft);
}

.rating-form__choice--selected > span {
  color: var(--color-brand-strong);
}

.rating-form__score:disabled .rating-form__choice {
  opacity: 0.6;
  cursor: wait;
}

.rating-form__meaning {
  display: grid;
  align-content: start;
  min-height: 4.75rem;
  gap: 0.2rem;
  padding-top: 0.75rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.rating-form__meaning strong {
  color: var(--color-heading);
  font-weight: 600;
}

.rating-form__note {
  border-block: 1px solid var(--color-border);
}

.rating-form__note > summary {
  padding-block: 0.875rem;
  color: var(--color-heading);
  cursor: pointer;
  font-size: 0.9375rem;
  font-weight: 600;
}

.rating-form__note > summary span {
  margin-left: 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  font-weight: 400;
}

.rating-form__review {
  display: grid;
  gap: 0.5rem;
  padding-bottom: 1rem;
}

.rating-form__review label {
  font-size: 0.875rem;
  font-weight: 600;
}

.rating-form__review textarea {
  min-height: 7rem;
  resize: vertical;
  font-size: 1rem;
}

.rating-form__count,
.rating-form__error {
  margin: 0;
  font-size: 0.8125rem;
}

.rating-form__count {
  text-align: right;
  color: var(--color-text-muted);
}

.rating-form__footer {
  display: grid;
  gap: 0.875rem;
}

.rating-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

@media (forced-colors: active) {
  .rating-form__choice--selected {
    outline: 2px solid Highlight;
    outline-offset: -4px;
  }
}
</style>
