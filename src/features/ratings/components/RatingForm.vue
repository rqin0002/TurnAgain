<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'

import { validateRatingInput } from '../domain/ratingValidation.js'

const props = defineProps({
  rating: {
    type: Object,
    default: null,
  },
  pending: {
    type: Boolean,
    default: false,
  },
  saveRating: {
    type: Function,
    required: true,
  },
})

const form = ref(null)
const isSubmitting = ref(false)
const summaryError = ref('')
const fields = reactive({ score: null, reviewText: '' })
const errors = reactive({ score: '', reviewText: '' })
const scoreOptions = Object.freeze([1, 2, 3, 4, 5])
const isPending = computed(() => props.pending || isSubmitting.value)
const reviewCount = computed(() => Array.from(fields.reviewText).length)
const formattedReviewCount = computed(() =>
  new Intl.NumberFormat('en-AU').format(reviewCount.value),
)
const reviewDescription = computed(() =>
  errors.reviewText ? 'rating-review-count rating-review-error' : 'rating-review-count',
)

watch(
  () => props.rating,
  (rating) => {
    fields.score = rating?.score ?? null
    fields.reviewText = rating?.reviewText ?? ''
    errors.score = ''
    errors.reviewText = ''
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
  const selector = errors.score
    ? 'input[name="score"]'
    : errors.reviewText
      ? 'textarea[name="reviewText"]'
      : null
  if (!selector) {
    return
  }

  await nextTick()
  form.value?.querySelector(selector)?.focus()
}

const submit = async () => {
  if (isPending.value) {
    return
  }

  summaryError.value = ''
  const validation = validateRatingInput({
    score: fields.score,
    reviewText: fields.reviewText,
  })
  Object.assign(errors, validation.errors)

  if (!validation.isValid) {
    summaryError.value = 'Check the highlighted fields and try again.'
    await focusFirstInvalid()
    return
  }

  isSubmitting.value = true
  try {
    await props.saveRating(validation.values)
  } catch {
    summaryError.value = 'We could not save your rating. Try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form ref="form" class="rating-form" novalidate :aria-busy="isPending" @submit.prevent="submit">
    <p v-if="summaryError" class="rating-form__alert" role="alert" aria-live="assertive">
      {{ summaryError }}
    </p>

    <fieldset
      class="rating-form__score"
      :aria-invalid="errors.score ? 'true' : undefined"
      :aria-describedby="errors.score ? 'rating-score-error' : undefined"
      :disabled="isPending"
    >
      <legend>Your rating</legend>
      <div class="rating-form__choices">
        <span v-for="score in scoreOptions" :key="score" class="rating-form__choice">
          <input
            :id="`rating-score-${score}`"
            v-model="fields.score"
            name="score"
            type="radio"
            :value="score"
            required
            :aria-invalid="errors.score ? 'true' : undefined"
            :aria-describedby="errors.score ? 'rating-score-error' : undefined"
            @change="updateScore(score)"
          />
          <label :for="`rating-score-${score}`">
            {{ score }} {{ score === 1 ? 'star' : 'stars' }}
          </label>
        </span>
      </div>
      <p v-if="errors.score" id="rating-score-error" class="rating-form__error">
        {{ errors.score }}
      </p>
    </fieldset>

    <div class="rating-form__review">
      <label for="rating-review">Review <span>(optional)</span></label>
      <textarea
        id="rating-review"
        class="form-control"
        name="reviewText"
        rows="5"
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
        {{ errors.reviewText }}
      </p>
    </div>

    <p v-if="isPending" class="rating-form__status" role="status" aria-live="polite">
      Saving your rating…
    </p>
    <button class="button button--primary rating-form__submit" type="submit" :disabled="isPending">
      {{ isPending ? 'Saving…' : rating ? 'Update rating' : 'Submit rating' }}
    </button>
  </form>
</template>

<style scoped>
.rating-form {
  display: grid;
  gap: 1rem;
}

.rating-form__alert,
.rating-form__error {
  color: var(--color-danger);
}

.rating-form__alert {
  margin: 0;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-small);
  background: var(--color-danger-soft);
  padding: 0.75rem;
}

.rating-form__score {
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}

.rating-form legend,
.rating-form__review > label {
  color: var(--color-heading);
  font-weight: 800;
}

.rating-form__choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.65rem;
}

.rating-form__choice {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.rating-form__choice input {
  width: 1.15rem;
  height: 1.15rem;
  margin: 0;
  accent-color: var(--color-brand);
}

.rating-form__choice label {
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.rating-form__review {
  display: grid;
  gap: 0.4rem;
}

.rating-form__review label span,
.rating-form__count {
  color: var(--color-text-muted);
  font-weight: 400;
}

.rating-form__review textarea {
  resize: vertical;
}

.rating-form__count,
.rating-form__error,
.rating-form__status {
  margin: 0;
  font-size: 0.9rem;
}

.rating-form__submit {
  justify-self: start;
}
</style>
