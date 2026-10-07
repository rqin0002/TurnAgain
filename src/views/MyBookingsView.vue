<script setup>
import { formatSessionWhen } from '@shared/melbourneTime.js'
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { invalidateActivityCatalogue } from '@/features/activities/composables/useActivityCatalogue.js'
import BookingStatusBadge from '@/features/bookings/components/BookingStatusBadge.vue'
import CancelBookingDialog from '@/features/bookings/components/CancelBookingDialog.vue'
import {
  ICS_UNAVAILABLE_MESSAGE,
  downloadBookingIcs,
} from '@/features/bookings/composables/bookingIcsDownload.js'
import { useCancelBooking } from '@/features/bookings/composables/useCancelBooking.js'
import { useMyBookings } from '@/features/bookings/composables/useMyBookings.js'
import { BOOKING_MESSAGES } from '@/features/bookings/domain/bookingMessages.js'
import { canCancel, isCancelClosedByStart } from '@/features/bookings/domain/bookingRules.js'
import AppButton from '@/shared/components/AppButton.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { isConnectionError } from '@/shared/domain/errorCopy.js'

// My Bookings (spec 7.7 L956, D6): every booking renders from its snapshot at once; the current
// sessions follow, and an entry whose session did not load is "not confirmed", never cancelled,
// with Cancel and Add to calendar held back until a refresh confirms it.
const mine = useMyBookings()
const { status, error, split, sessionsLoading, now, truncated } = mine
const cancelling = useCancelBooking()
const target = ref(null)
const page = ref(null)
// One status line for the page, mounted empty: a failed calendar file, or a finished cancel.
const notice = ref('')
const showsOffline = computed(() => isConnectionError(error.value))
let refreshAfterClose = false

const sections = computed(() => [
  { id: 'upcoming', title: 'Upcoming', entries: split.value.upcoming, actions: true },
  { id: 'past', title: 'Past and cancelled', entries: split.value.past, actions: false },
])

const openCancelDialog = (booking) => {
  cancelling.clearError()
  target.value = booking
}

// Spec 7.9 (ruling C4): after a cancel refused because the session started, `now` moves only
// once the dialog has closed and the browser has returned focus to Cancel. If the entry then
// loses its Cancel, focus goes to its started line (or its title link when the session has
// also ended and the entry moved to Past), never to <body>.
const closeCancelDialog = async () => {
  const id = target.value?.id ?? null
  const refresh = refreshAfterClose && id !== null
  refreshAfterClose = false
  cancelling.clearError()
  target.value = null
  if (!refresh) return
  await nextTick()
  now.value = new Date()
  await nextTick()
  if (page.value?.querySelector(`[data-cancel-for="${id}"]`)) return
  const next =
    page.value?.querySelector(`[data-cancel-started="${id}"]`) ??
    page.value?.querySelector(`[data-booking-link="${id}"]`)
  next?.focus()
}

const addToCalendar = (booking, session) => {
  notice.value = downloadBookingIcs(booking, session) ? '' : ICS_UNAVAILABLE_MESSAGE
}

// The cancelled entry moves to "Past and cancelled" and its Cancel button is gone, so focus
// follows the entry's title link instead of falling to <body>, and the status line says why. The
// line empties before the reload, so a second cancel in the same visit is announced again.
const confirmCancel = async (bookingId) => {
  const cancelled = await cancelling.cancel(bookingId)
  refreshAfterClose = !cancelled && cancelling.error.value?.details?.reason === 'started'
  if (!cancelled) return
  target.value = null
  invalidateActivityCatalogue()
  notice.value = ''
  await mine.load()
  await nextTick()
  notice.value = BOOKING_MESSAGES.cancelledHeading
  page.value?.querySelector(`[data-booking-link="${bookingId}"]`)?.focus()
}
</script>

<template>
  <section class="page-section">
    <div ref="page" class="shell my-bookings">
      <header>
        <h1 class="page-title">My bookings</h1>
        <p>
          <RouterLink :to="{ name: 'account' }">Your account</RouterLink>
        </p>
        <p class="my-bookings__notice" role="status">{{ notice }}</p>
      </header>

      <StatePanel
        v-if="status === 'loading' || status === 'idle'"
        variant="loading"
        title="Loading your bookings"
      />
      <StatePanel
        v-else-if="status === 'error'"
        :variant="showsOffline ? 'offline' : 'error'"
        :error="error"
        @retry="mine.retry"
      />

      <template v-else>
        <!-- Present when the list renders, so a plain paragraph, not a live region (M5-D17). -->
        <p v-if="truncated">Results incomplete: showing the first 1,000 records.</p>
        <section
          v-for="section in sections"
          :key="section.id"
          class="my-bookings__section"
          :aria-labelledby="`my-bookings-${section.id}`"
        >
          <h2 :id="`my-bookings-${section.id}`">{{ section.title }}</h2>
          <p v-if="section.entries.length === 0" class="my-bookings__empty">
            {{ section.id === 'upcoming' ? 'No upcoming bookings.' : 'Nothing here yet.' }}
          </p>
          <ul v-else class="my-bookings__list">
            <li v-for="{ booking, session, sessionState } in section.entries" :key="booking.id">
              <h3>
                <RouterLink
                  :to="{ name: 'booking-detail', params: { bookingId: booking.id } }"
                  :data-booking-link="booking.id"
                >
                  {{ booking.activityTitle }}
                </RouterLink>
              </h3>
              <p>{{ formatSessionWhen(booking.startsAt, booking.endsAt) }}</p>
              <p>{{ booking.venueName }}, {{ booking.suburb }} {{ booking.postcode }}</p>
              <p>Reference {{ booking.reference }}</p>
              <BookingStatusBadge
                :status="booking.status"
                :session-state="sessionsLoading ? 'current' : sessionState"
              />
              <div v-if="section.actions" class="my-bookings__actions">
                <AppButton
                  v-if="booking.status === 'confirmed'"
                  variant="secondary"
                  :disabled="sessionState !== 'current'"
                  @click="addToCalendar(booking, session)"
                >
                  Add to calendar (.ics)
                </AppButton>
                <p
                  v-if="isCancelClosedByStart(booking, session, now)"
                  class="my-bookings__started"
                  :data-cancel-started="booking.id"
                  tabindex="-1"
                >
                  {{ BOOKING_MESSAGES.cancelStarted }}
                  <RouterLink to="/about#contact">{{
                    BOOKING_MESSAGES.contactUsIfAbsent
                  }}</RouterLink>
                </p>
                <AppButton
                  v-else
                  variant="secondary"
                  :disabled="sessionState !== 'current' || !canCancel(booking, session, now)"
                  :data-cancel-for="booking.id"
                  @click="openCancelDialog(booking)"
                >
                  Cancel<span class="visually-hidden"> {{ booking.activityTitle }}</span>
                </AppButton>
                <p v-if="!sessionsLoading && sessionState === 'unconfirmed'">
                  {{ BOOKING_MESSAGES.refreshToConfirm }}
                </p>
              </div>
            </li>
          </ul>
        </section>
      </template>

      <CancelBookingDialog
        :booking="target"
        :open="target !== null"
        :busy="cancelling.cancelling.value !== null"
        :error="cancelling.error.value"
        @confirm="confirmCancel"
        @close="closeCancelDialog"
      />
    </div>
  </section>
</template>

<style scoped>
.my-bookings {
  display: grid;
  max-width: 48rem;
  gap: 1.75rem;
}

.my-bookings h2 {
  margin: 0 0 1rem;
  color: var(--color-heading);
  font-size: 1.375rem;
}

.my-bookings h3 {
  margin: 0;
  font-size: 1.125rem;
}

.my-bookings__list {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-bookings__list > li {
  display: grid;
  gap: 0.4rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: 1.25rem;
}

.my-bookings__list p,
.my-bookings__empty,
.my-bookings__notice {
  margin: 0;
}

.my-bookings__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
</style>
