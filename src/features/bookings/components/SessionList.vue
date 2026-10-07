<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import {
  formatSessionAvailability,
  formatSessionDate,
  formatSessionStatus,
  formatSessionTime,
} from '@/features/activities/domain/activityCatalogue.js'

import { describeSessionAvailability, isLiveBooking } from '../domain/bookingRules.js'

import SessionAvailabilityBadge from './SessionAvailabilityBadge.vue'

// The sessions of one activity. Each row is focusable by id (`session-<id>`) and offers one
// action from describeSessionAvailability; provider and drop-in sessions keep the copy and
// provider link Activity Detail already showed.
const props = defineProps({
  sessions: { type: Array, required: true },
  activity: { type: Object, required: true },
  now: { type: Date, required: true },
  myBookings: { type: Array, default: () => [] },
  truncated: { type: Boolean, default: false },
})

const rows = computed(() =>
  props.sessions.map((session) => {
    const myBooking =
      props.myBookings.find(
        (booking) => booking.sessionId === session.id && isLiveBooking(booking),
      ) ?? null
    return {
      session,
      myBooking,
      availability: describeSessionAvailability(session, props.now, { myBooking }),
    }
  }),
)

// The badge names a state; the "Book this session" and "Join waitlist" links name the action.
const showsBadge = ({ availability }) =>
  availability.label !== '' && (availability.action === 'none' || availability.tone === 'limited')
</script>

<template>
  <div class="session-list">
    <!-- Present when the list renders, so a plain paragraph, not a live region. -->
    <p v-if="truncated" class="session-list__truncated">
      Results incomplete: showing the first 1,000 records.
    </p>
    <ul class="session-list__items">
      <li
        v-for="{ session, myBooking, availability } in rows"
        :id="`session-${session.id}`"
        :key="session.id"
        class="session-list__row"
        tabindex="-1"
      >
        <div>
          <p class="session-list__date">{{ formatSessionDate(session.startsAt) }}</p>
          <p>{{ formatSessionTime(session.startsAt, session.endsAt) }} (Melbourne time)</p>
          <p>
            {{ session.venueName }} · {{ session.address }}, {{ session.suburb }}
            {{ session.postcode }}
          </p>
          <p v-if="session.participantNotice" class="session-list__notice" dir="auto">
            {{ session.participantNotice }}
          </p>
        </div>

        <div class="session-list__availability">
          <p>
            <strong>{{ formatSessionStatus(session.status) }}</strong>
          </p>
          <p v-if="showsBadge({ availability })">
            <SessionAvailabilityBadge :tone="availability.tone" :label="availability.label" />
          </p>

          <RouterLink
            v-if="availability.action === 'book' || availability.action === 'waitlist'"
            class="button button--primary"
            :to="{
              name: 'booking-review',
              params: { activityId: activity.id, sessionId: session.id },
            }"
          >
            {{ availability.action === 'book' ? 'Book this session' : availability.label }}
          </RouterLink>
          <RouterLink
            v-else-if="availability.action === 'booked'"
            class="button button--secondary"
            :to="{ name: 'booking-detail', params: { bookingId: myBooking.id } }"
          >
            {{ availability.label }}
          </RouterLink>

          <template v-if="session.registrationType !== 'turnagain'">
            <p v-if="formatSessionAvailability(session)">
              {{ formatSessionAvailability(session) }}
            </p>
            <p v-if="session.status === 'cancelled'">
              This session is cancelled. Check the provider source for schedule updates.
            </p>
            <p v-else-if="session.status === 'full'">
              No places are currently available. The provider may offer a waitlist.
            </p>
            <p v-else-if="session.status === 'scheduled' && session.registrationType === 'drop-in'">
              Recheck the provider source before travelling.
            </p>
            <a
              v-if="
                session.status !== 'cancelled' &&
                session.registrationType === 'provider' &&
                session.registrationUrl
              "
              class="button button--primary"
              :href="session.registrationUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ session.status === 'full' ? 'Check provider waitlist' : 'Continue at provider'
              }}<span class="visually-hidden"> (opens in a new tab)</span>
            </a>
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.session-list__items {
  display: grid;
  gap: 1rem;
  margin: 1.5rem 0 0;
  padding: 0;
  list-style: none;
}

.session-list__row {
  display: grid;
  min-width: 0;
  gap: 1.5rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.session-list__row:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.session-list__row p {
  margin: 0.4rem 0 0;
}

.session-list__date {
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.session-list__notice {
  padding-top: 0.5rem;
  color: var(--color-text-muted);
}

.session-list__availability {
  align-self: start;
  font-size: 0.9375rem;
}

.session-list__availability strong {
  color: var(--color-heading);
  font-weight: 600;
}

.session-list__availability .button {
  margin-top: 1rem;
}

@media (min-width: 768px) {
  .session-list__row {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.42fr);
    gap: 2rem;
  }
}
</style>
