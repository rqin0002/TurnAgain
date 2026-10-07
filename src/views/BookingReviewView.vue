<script setup>
import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { invalidateActivityCatalogue } from '@/features/activities/composables/useActivityCatalogue.js'
import BookingReviewForm from '@/features/bookings/components/BookingReviewForm.vue'
import { useBookingHandoff } from '@/features/bookings/composables/useBookingHandoff.js'
import { useBookingReview } from '@/features/bookings/composables/useBookingReview.js'
import { BOOKING_MESSAGES } from '@/features/bookings/domain/bookingMessages.js'
import AppButton from '@/shared/components/AppButton.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { isConnectionError } from '@/shared/domain/errorCopy.js'

// The booking review page: the URL is the selection, the composable
// owns the states, this view owns the navigation that follows a commit. One status region,
// mounted with the page, announces every outcome that replaces the form, so those panels carry
// no live role of their own. Focus moves to the name field after "Book anyway", and to the page
// heading when an outcome removes the form, never to <body>.
const route = useRoute()
const router = useRouter()

const param = (value) => (typeof value === 'string' ? value : '')
const activityId = computed(() => param(route.params.activityId))
const sessionId = computed(() => param(route.params.sessionId))

const review = useBookingReview({ activityId, sessionId })
const { setHandoff } = useBookingHandoff()

const pageHeading = ref(null)
const form = ref(null)
const formStates = new Set(['ready', 'submitting', 'session-filled', 'failed'])
const showsForm = computed(
  () => formStates.has(review.state.value) && review.session.value !== null,
)
const showsOffline = computed(() => isConnectionError(review.error.value))
const closedMessage = computed(
  () => BOOKING_MESSAGES.closed[review.reason.value] ?? BOOKING_MESSAGES.sessionNotFound,
)
const outcomeAnnouncement = computed(() => {
  const announcements = {
    'not-found': BOOKING_MESSAGES.sessionNotFound,
    closed: closedMessage.value,
    duplicate: BOOKING_MESSAGES.duplicate,
    overlap: BOOKING_MESSAGES.overlap,
    booked: BOOKING_MESSAGES.bookedNotOpened,
  }
  return announcements[review.state.value] ?? ''
})

const focusHeading = async () => {
  await nextTick()
  pageHeading.value?.focus()
}

// Whether the booking page opened: a guard can refuse the navigation, or it can throw.
const toDetail = async (bookingId) => {
  try {
    return !(await router.replace({
      name: 'booking-detail',
      params: { bookingId },
      query: { new: '1' },
    }))
  } catch {
    return false
  }
}

const onSubmit = async (values) => {
  const result = await review.submit(values)
  if (result) {
    invalidateActivityCatalogue()
    setHandoff({
      bookingId: result.bookingId,
      position: result.position,
      kind: result.outcome,
      placeOpened: result.placeOpened,
    })
    if (!(await toDetail(result.bookingId))) {
      review.markBooked(result.bookingId)
      await focusHeading()
    }
    return
  }
  // A refused duplicate is the lost-response case; the booking page asks for its email once.
  if (review.state.value === 'duplicate' && review.existingBooking.value?.id) {
    await toDetail(review.existingBooking.value.id)
  }
  // After the duplicate's booking page opens this view is gone and the heading ref is null.
  if (!showsForm.value) await focusHeading()
}

// The failed panel's "Try again" submits what the form holds now, the member's edits included.
const resubmit = () => (form.value ? form.value.submit() : review.retry())

// "Book anyway" unmounts the panel that holds it, so focus goes on to the form's first field.
const bookAnyway = async () => {
  review.acceptOverlap()
  await nextTick()
  document.getElementById('booking-contact-name')?.focus()
}

// While the route moves on to the booking page this view may render once more without params.
const backToActivity = computed(() =>
  activityId.value
    ? { name: 'activity-detail', params: { activityId: activityId.value } }
    : { name: 'activities' },
)
</script>

<template>
  <section class="page-section">
    <div class="shell booking-review">
      <header class="booking-review__header">
        <RouterLink class="back-link" :to="backToActivity">← Back to the activity</RouterLink>
        <h1 ref="pageHeading" class="page-title" tabindex="-1">Review your booking</h1>
        <p class="visually-hidden" role="status" data-review-outcome>{{ outcomeAnnouncement }}</p>
      </header>

      <StatePanel
        v-if="review.state.value === 'loading'"
        variant="loading"
        title="Loading the session"
      />

      <StatePanel
        v-else-if="review.state.value === 'not-found'"
        variant="notice"
        :live="false"
        :message="BOOKING_MESSAGES.sessionNotFound"
      >
        <RouterLink class="button button--secondary" :to="{ name: 'activities' }">
          Browse activities
        </RouterLink>
      </StatePanel>

      <StatePanel
        v-else-if="review.state.value === 'closed'"
        variant="notice"
        :live="false"
        :message="closedMessage"
      >
        <RouterLink class="button button--secondary" :to="backToActivity">
          Back to the activity
        </RouterLink>
      </StatePanel>

      <StatePanel
        v-else-if="review.state.value === 'duplicate'"
        variant="notice"
        :live="false"
        :message="BOOKING_MESSAGES.duplicate"
      >
        <RouterLink
          v-if="review.existingBooking.value"
          class="button button--primary"
          :to="{ name: 'booking-detail', params: { bookingId: review.existingBooking.value.id } }"
        >
          View your booking
        </RouterLink>
      </StatePanel>

      <StatePanel
        v-else-if="review.state.value === 'overlap'"
        variant="notice"
        :live="false"
        :message="BOOKING_MESSAGES.overlap"
      >
        <p v-if="review.overlapping.value" dir="auto">
          {{ review.overlapping.value.activityTitle }}, {{ review.overlapping.value.reference }}
        </p>
        <AppButton variant="primary" @click="bookAnyway">
          {{ BOOKING_MESSAGES.bookAnyway }}
        </AppButton>
      </StatePanel>

      <StatePanel
        v-else-if="review.state.value === 'booked'"
        variant="notice"
        :live="false"
        :message="BOOKING_MESSAGES.bookedNotOpened"
      >
        <RouterLink
          class="button button--primary"
          :to="{ name: 'booking-detail', params: { bookingId: review.existingBooking.value.id } }"
        >
          View your booking
        </RouterLink>
        <RouterLink class="button button--secondary" :to="{ name: 'my-bookings' }">
          All your bookings
        </RouterLink>
      </StatePanel>

      <StatePanel
        v-else-if="review.state.value === 'failed' && review.session.value === null"
        :variant="showsOffline ? 'offline' : 'error'"
        :error="review.error.value"
        @retry="review.retry"
      />

      <template v-if="showsForm">
        <StatePanel
          v-if="review.state.value === 'session-filled'"
          variant="notice"
          assertive
          :title="BOOKING_MESSAGES.joinWaitlistInstead"
          :message="BOOKING_MESSAGES.sessionFilled"
        />
        <StatePanel
          v-else-if="review.state.value === 'failed'"
          :variant="showsOffline ? 'offline' : 'error'"
          assertive
          :error="review.error.value"
          @retry="resubmit"
        />
        <BookingReviewForm
          ref="form"
          :session="review.session.value"
          :activity="review.activity.value"
          :email="review.accountEmail.value"
          :initial-name="review.contactNameDefault.value"
          :intent="review.intent.value"
          :submitting="review.state.value === 'submitting'"
          @submit="onSubmit"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.booking-review {
  display: grid;
  max-width: 44rem;
  gap: 1.5rem;
}

.booking-review__header {
  display: grid;
  gap: 1rem;
}
</style>
