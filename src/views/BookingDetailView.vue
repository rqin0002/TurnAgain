<script setup>
import { formatSessionWhen } from '@shared/melbourneTime.js'
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { invalidateActivityCatalogue } from '@/features/activities/composables/useActivityCatalogue.js'
import { formatSessionStatus } from '@/features/activities/domain/activityCatalogue.js'
import BookingEmailStatus from '@/features/bookings/components/BookingEmailStatus.vue'
import BookingStatusBadge from '@/features/bookings/components/BookingStatusBadge.vue'
import CancelBookingDialog from '@/features/bookings/components/CancelBookingDialog.vue'
import {
  ICS_UNAVAILABLE_MESSAGE,
  downloadBookingIcs,
} from '@/features/bookings/composables/bookingIcsDownload.js'
import { useBookingDetail } from '@/features/bookings/composables/useBookingDetail.js'
import { useBookingHandoff } from '@/features/bookings/composables/useBookingHandoff.js'
import { useCancelBooking } from '@/features/bookings/composables/useCancelBooking.js'
import { BOOKING_MESSAGES } from '@/features/bookings/domain/bookingMessages.js'
import { canCancel, isCancelClosedByStart } from '@/features/bookings/domain/bookingRules.js'
import AppButton from '@/shared/components/AppButton.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { isConnectionError } from '@/shared/domain/errorCopy.js'
import { animateBookingReference } from '@/shared/motion/index.js'

// The booking page (spec 7.6-7.7, D5): refresh-safe (the owner reads the booking by id), with the
// one-shot hand-off from the review for the heading, the email line, Copy, Add to calendar and
// Cancel. Nothing here writes the waitlist position anywhere.
const route = useRoute()
const router = useRouter()

const bookingId = computed(() =>
  typeof route.params.bookingId === 'string' ? route.params.bookingId : '',
)
const detail = useBookingDetail({ bookingId })
const { status, error, booking, session, sessionState } = detail
const { consumeHandoff } = useBookingHandoff()
const handoff = ref(consumeHandoff(bookingId.value))
// One-shot: the email line asks on mount only on the visit the review opened with `new=1`.
const requestOnMount = ref(route.query.new === '1')
const cancelling = useCancelBooking()

const heading = ref(null)
const startedLine = ref(null)
const reference = ref(null)
const copyNotice = ref('')
const icsNotice = ref('')
const dialogOpen = ref(false)
const now = ref(new Date())
let revealed = false
let refreshAfterClose = false

const title = computed(() => {
  const current = booking.value
  if (!current) return ''
  if (current.status === 'cancelled') return BOOKING_MESSAGES.cancelledHeading
  if (current.status === 'waitlisted') {
    return Number.isInteger(handoff.value?.position)
      ? BOOKING_MESSAGES.waitlistPositionHeading.replace('{n}', String(handoff.value.position))
      : BOOKING_MESSAGES.waitlistHeading
  }
  return BOOKING_MESSAGES.confirmedHeading
})
const showsPlaceOpened = computed(
  () => booking.value?.status === 'confirmed' && handoff.value?.placeOpened === true,
)
const showsBooking = computed(() => status.value === 'ready' && booking.value !== null)
// A promoted booking's confirmation was sent by staff (M5-D6): no email line for it without a
// hand-off. The member's own cancellation email always has its line.
const showsEmail = computed(
  () =>
    booking.value !== null &&
    (booking.value.status === 'cancelled' ||
      booking.value.promotedAt == null ||
      handoff.value !== null),
)
const emailKind = computed(() =>
  booking.value?.status === 'cancelled'
    ? 'cancelled'
    : (handoff.value?.kind ?? booking.value?.status),
)
const sessionKnown = computed(() => sessionState.value !== 'unconfirmed')
const cancellable = computed(
  () =>
    booking.value !== null &&
    sessionKnown.value &&
    canCancel(booking.value, session.value, now.value),
)
const startedForCancel = computed(
  () => sessionKnown.value && isCancelClosedByStart(booking.value, session.value, now.value),
)
const timeChanged = computed(
  () =>
    session.value !== null &&
    booking.value !== null &&
    (session.value.startsAt !== booking.value.startsAt ||
      session.value.endsAt !== booking.value.endsAt),
)
const showsOffline = computed(() => isConnectionError(error.value))

// The route can move to another booking without remounting this view: everything one-shot or
// tied to the previous booking starts again.
watch(bookingId, (id, previous) => {
  if (id === previous) return
  handoff.value = consumeHandoff(id)
  requestOnMount.value = route.query.new === '1'
  revealed = false
  refreshAfterClose = false
  dialogOpen.value = false
  copyNotice.value = ''
  icsNotice.value = ''
})

watch(status, async (value) => {
  if (value !== 'ready' || revealed) return
  revealed = true
  now.value = new Date()
  // After the router's #main-content focus (contract section 3.4): a tick, then a task.
  await nextTick()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  heading.value?.focus()
  void animateBookingReference(reference.value)
})

// N7: once the first email status has rendered, `new` leaves the URL so history never re-sends.
const stripNew = () => {
  requestOnMount.value = false
  if (route.query.new === undefined) return
  const query = { ...route.query }
  delete query.new
  void router.replace({ query })
}

const copyReference = async () => {
  try {
    await navigator.clipboard.writeText(booking.value.reference)
    copyNotice.value = 'Reference copied'
  } catch {
    copyNotice.value = 'Copy is not available here; select the reference instead.'
  }
}

const addToCalendar = () => {
  icsNotice.value = downloadBookingIcs(booking.value, session.value) ? '' : ICS_UNAVAILABLE_MESSAGE
}

const openCancelDialog = () => {
  cancelling.clearError()
  dialogOpen.value = true
}

// Spec 7.9 (ruling C4): after a cancel refused because the session started, the clock moves
// only once the dialog has closed and the browser has returned focus to Cancel. If the page
// then removes Cancel, focus goes to the started line (or the heading when the session has
// also ended), never to <body>.
const closeCancelDialog = async () => {
  const refresh = refreshAfterClose
  refreshAfterClose = false
  cancelling.clearError()
  dialogOpen.value = false
  if (!refresh) return
  await nextTick()
  now.value = new Date()
  await nextTick()
  if (cancellable.value) return
  const target = startedLine.value ?? heading.value
  target?.focus()
}

const confirmCancel = async (id) => {
  const cancelled = await cancelling.cancel(id)
  refreshAfterClose = !cancelled && cancelling.error.value?.details?.reason === 'started'
  if (!cancelled) return
  dialogOpen.value = false
  handoff.value = null
  requestOnMount.value = false
  invalidateActivityCatalogue()
  await detail.load()
  await nextTick()
  heading.value?.focus()
}
</script>

<template>
  <section class="page-section">
    <div class="shell booking-detail">
      <h1 v-if="!showsBooking" class="page-title">{{ BOOKING_MESSAGES.bookingPageHeading }}</h1>

      <StatePanel
        v-if="status === 'loading' || status === 'idle'"
        variant="loading"
        title="Loading your booking"
      />

      <StatePanel
        v-else-if="status === 'error' && error?.code === 'not-found'"
        variant="notice"
        message="We could not find this booking."
      >
        <RouterLink class="button button--secondary" :to="{ name: 'my-bookings' }">
          All your bookings
        </RouterLink>
      </StatePanel>

      <StatePanel
        v-else-if="status === 'error'"
        :variant="showsOffline ? 'offline' : 'error'"
        :error="error"
        @retry="detail.retry"
      />

      <article v-else-if="booking" class="booking-detail__card">
        <header class="booking-detail__header">
          <h1 ref="heading" tabindex="-1">{{ title }}</h1>
          <p v-if="showsPlaceOpened">{{ BOOKING_MESSAGES.placeOpened }}</p>
          <BookingStatusBadge :status="booking.status" :session-state="sessionState" />
        </header>

        <div class="booking-detail__reference">
          <p>Your reference</p>
          <output ref="reference" class="booking-detail__code">{{ booking.reference }}</output>
          <AppButton variant="secondary" @click="copyReference">
            Copy<span class="visually-hidden"> the reference</span>
          </AppButton>
          <p class="booking-detail__copy-notice" role="status">{{ copyNotice }}</p>
        </div>

        <BookingEmailStatus
          v-if="showsEmail"
          :key="emailKind"
          :booking-id="booking.id"
          :kind="emailKind"
          :request-on-mount="requestOnMount"
          @first-status="stripNew"
        />

        <dl class="booking-detail__facts">
          <div>
            <dt>Activity</dt>
            <dd>{{ booking.activityTitle }}</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd>{{ formatSessionWhen(booking.startsAt, booking.endsAt) }}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>
              {{ booking.venueName }}, {{ booking.address }}, {{ booking.suburb }}
              {{ booking.postcode }}
            </dd>
          </div>
          <div>
            <dt>Name for the register</dt>
            <dd dir="auto">{{ booking.contactName }}</dd>
          </div>
          <div v-if="booking.itemDescription">
            <dt>What you are bringing</dt>
            <dd class="booking-detail__item" dir="auto">{{ booking.itemDescription }}</dd>
          </div>
          <div>
            <dt>Confirmation email</dt>
            <dd>{{ booking.email }}</dd>
          </div>
          <div>
            <dt>Current session</dt>
            <dd v-if="sessionState === 'cancelled'">
              {{ BOOKING_MESSAGES.sessionCancelledByTurnAgain }}
            </dd>
            <dd v-else-if="sessionState === 'unconfirmed'">
              {{ BOOKING_MESSAGES.sessionUnconfirmed }}.
              {{ BOOKING_MESSAGES.refreshToConfirm }}
            </dd>
            <dd v-else>
              {{ formatSessionStatus(session.status) }}
              <template v-if="timeChanged">
                · now {{ formatSessionWhen(session.startsAt, session.endsAt) }}
              </template>
            </dd>
          </div>
        </dl>

        <div class="booking-detail__actions">
          <template v-if="booking.status === 'confirmed'">
            <AppButton
              variant="secondary"
              :disabled="sessionState !== 'current'"
              @click="addToCalendar"
            >
              Add to calendar (.ics)
            </AppButton>
            <p class="booking-detail__note">{{ BOOKING_MESSAGES.icsNote }}</p>
            <p class="booking-detail__note" role="status">{{ icsNotice }}</p>
          </template>
          <AppButton v-if="cancellable" variant="secondary" @click="openCancelDialog">
            Cancel booking
          </AppButton>
          <p
            v-if="startedForCancel"
            ref="startedLine"
            class="booking-detail__note"
            data-cancel-started
            tabindex="-1"
          >
            {{ BOOKING_MESSAGES.cancelStarted }}
            <RouterLink to="/about#contact">{{ BOOKING_MESSAGES.contactUsIfAbsent }}</RouterLink>
          </p>
          <RouterLink :to="{ name: 'my-bookings' }">All your bookings</RouterLink>
        </div>

        <CancelBookingDialog
          :booking="booking"
          :open="dialogOpen"
          :busy="cancelling.cancelling.value !== null"
          :error="cancelling.error.value"
          @confirm="confirmCancel"
          @close="closeCancelDialog"
        />
      </article>
    </div>
  </section>
</template>

<style scoped>
.booking-detail {
  display: grid;
  max-width: 44rem;
  gap: 1.5rem;
}

.booking-detail__card {
  display: grid;
  gap: 1.75rem;
}

.booking-detail__header {
  display: grid;
  gap: 0.75rem;
}

.booking-detail__header h1 {
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 650;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.booking-detail__header p,
.booking-detail__reference p {
  margin: 0;
}

.booking-detail__reference {
  display: grid;
  justify-items: start;
  gap: 0.6rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: 1.25rem;
}

.booking-detail__code {
  color: var(--color-heading);
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: clamp(1.75rem, 5vw, 2.5rem);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.booking-detail__copy-notice,
.booking-detail__note {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.booking-detail__facts {
  display: grid;
  margin: 0;
}

.booking-detail__facts > div {
  border-top: 1px solid var(--color-border);
  padding-block: 0.85rem;
}

.booking-detail__facts dt {
  color: var(--color-heading);
  font-weight: 600;
}

.booking-detail__facts dd {
  margin: 0.35rem 0 0;
}

.booking-detail__item {
  white-space: pre-line;
}

.booking-detail__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}

.booking-detail__note {
  flex-basis: 100%;
  margin: 0;
}
</style>
