<script setup>
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { useBackNavigation } from '../composables/useBackNavigation.js'
import { useActivityCatalogue } from '../features/activities/composables/useActivityCatalogue.js'
import {
  buildActivityCatalogue,
  formatActivityType,
  formatSessionAvailability,
  formatSessionDate,
  formatSessionStatus,
  formatSessionTime,
} from '../features/activities/domain/activityCatalogue.js'
import { formatCheckedDate } from '../features/discovery/domain/servicePresentation.js'

const route = useRoute()
const { goBack } = useBackNavigation({ name: 'activities' })
const { status, activities, sessions, now, errorMessage, retry } = useActivityCatalogue()

const requestedId = computed(() => {
  const value = Array.isArray(route.params.activityId)
    ? route.params.activityId[0]
    : route.params.activityId
  return typeof value === 'string' ? value : ''
})

const entry = computed(() =>
  buildActivityCatalogue(activities.value, sessions.value, {}, now.value).find(
    ({ activity }) => activity.id === requestedId.value,
  ),
)

watch(entry, (value) => {
  if (value) {
    document.title = `${value.activity.title} | TurnAgain`
  }
})
</script>

<template>
  <section class="page-section">
    <div class="shell activity-detail">
      <button class="text-button back-link" type="button" @click="goBack">← Back</button>

      <div v-if="status === 'loading' || status === 'idle'" class="state-panel" role="status">
        <div>
          <h1>Loading activity details</h1>
          <p>Reading the current activity and session catalogue…</p>
        </div>
      </div>

      <div v-else-if="status === 'error'" class="state-panel" role="alert">
        <div>
          <h1>Activity details are unavailable</h1>
          <p>{{ errorMessage }}</p>
          <button class="button button--primary" type="button" @click="retry">Try again</button>
        </div>
      </div>

      <article v-else-if="entry" class="activity-detail__card">
        <header v-motion="entry.activity.id" class="activity-detail__header">
          <p class="activity-detail__type">{{ formatActivityType(entry.activity.activityType) }}</p>
          <h1>{{ entry.activity.title }}</h1>
          <p>{{ entry.activity.summary }}</p>
        </header>

        <div class="activity-detail__body">
          <div class="activity-detail__content">
            <section aria-labelledby="suitability-heading">
              <h2 id="suitability-heading">Suitability</h2>
              <h3>Suitable items</h3>
              <ul>
                <li v-for="item in entry.activity.suitableItems" :key="item">{{ item }}</li>
              </ul>

              <h3>Accepted conditions</h3>
              <ul>
                <li v-for="condition in entry.activity.acceptedConditions" :key="condition">
                  {{ condition }}
                </li>
              </ul>

              <h3>Excluded conditions</h3>
              <ul>
                <li v-for="condition in entry.activity.excludedConditions" :key="condition">
                  {{ condition }}
                </li>
              </ul>
            </section>

            <section aria-labelledby="prepare-heading">
              <h2 id="prepare-heading">Before you attend</h2>
              <dl class="activity-detail__facts">
                <div>
                  <dt>Cost</dt>
                  <dd>{{ entry.activity.costLabel }}</dd>
                </div>
                <div>
                  <dt>What to bring</dt>
                  <dd>
                    <ul>
                      <li v-for="item in entry.activity.whatToBring" :key="item">{{ item }}</li>
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>Accessibility</dt>
                  <dd>{{ entry.activity.accessibilityLabel }}</dd>
                </div>
                <div>
                  <dt>Cancellation</dt>
                  <dd>{{ entry.activity.cancellationLabel }}</dd>
                </div>
              </dl>
            </section>
          </div>

          <aside
            class="source-panel activity-detail__source"
            aria-labelledby="activity-source-heading"
          >
            <h2 id="activity-source-heading">Check the provider source</h2>
            <p>
              Activity conditions and availability can change. Confirm details before travelling.
            </p>
            <p>
              Source:
              <a :href="entry.activity.providerUrl" target="_blank" rel="noopener noreferrer">
                {{ entry.activity.providerName }}
              </a>
            </p>
            <p>Source checked {{ formatCheckedDate(entry.activity.sourceCheckedAt) }}</p>
          </aside>
        </div>

        <section class="activity-detail__sessions" aria-labelledby="sessions-heading">
          <header>
            <h2 id="sessions-heading">Sessions</h2>
          </header>

          <ul v-if="entry.sessions.length" class="activity-detail__session-list">
            <li v-for="session in entry.sessions" :key="session.id">
              <div>
                <p class="activity-detail__session-date">
                  {{ formatSessionDate(session.startsAt) }}
                </p>
                <p>{{ formatSessionTime(session.startsAt, session.endsAt) }}</p>
                <p>
                  {{ session.venueName }} · {{ session.address }}, {{ session.suburb }}
                  {{ session.postcode }}
                </p>
                <p v-if="session.participantNotice" class="activity-detail__notice">
                  {{ session.participantNotice }}
                </p>
              </div>

              <div class="activity-detail__availability">
                <p>
                  <strong>{{ formatSessionStatus(session.status) }}</strong>
                </p>
                <p v-if="formatSessionAvailability(session)">
                  {{ formatSessionAvailability(session) }}
                </p>

                <p v-if="session.status === 'cancelled'">
                  This session is cancelled. Check the provider source for schedule updates.
                </p>
                <p v-else-if="session.status === 'full'">
                  No places are currently available. The provider may offer a waitlist.
                </p>
                <p
                  v-else-if="
                    session.status === 'scheduled' && session.registrationType === 'drop-in'
                  "
                >
                  Recheck the provider source before travelling.
                </p>
                <p
                  v-else-if="
                    session.status === 'scheduled' && session.registrationType === 'turnagain'
                  "
                >
                  TurnAgain booking is not available in this release.
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
                  {{
                    session.status === 'full' ? 'Check provider waitlist' : 'Continue at provider'
                  }}
                </a>
              </div>
            </li>
          </ul>

          <div v-else class="state-panel">
            <div>
              <h3>No future session is currently published</h3>
              <p>Use the provider source above to check the latest schedule.</p>
            </div>
          </div>
        </section>
      </article>

      <div v-else class="state-panel">
        <div>
          <h1>We could not find that activity.</h1>
          <p>It may have been removed from the catalogue or the link may be incomplete.</p>
          <RouterLink class="button button--primary" :to="{ name: 'activities' }">
            Browse activities
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.activity-detail {
  max-width: 72rem;
}

.activity-detail h1 {
  max-width: 23ch;
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(2.25rem, 5vw, 4rem);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.activity-detail__card {
  min-width: 0;
}

.activity-detail__type {
  margin: 0 0 1rem;
  color: var(--color-brand);
  font-size: 0.9375rem;
  font-weight: 600;
}

.activity-detail__header {
  padding-bottom: clamp(1.75rem, 4vw, 3rem);
}

.activity-detail__header > p:last-child {
  max-width: 65ch;
  margin: 1.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 1.125rem;
  line-height: 1.65;
}

.activity-detail__body {
  display: grid;
  gap: 2rem;
  padding-block: 1rem clamp(2rem, 4vw, 3rem);
}

.activity-detail__content {
  display: grid;
  gap: 2.5rem;
}

.activity-detail h2,
.activity-detail h3 {
  color: var(--color-heading);
}

.activity-detail h2 {
  margin: 0 0 1rem;
  font-size: 1.625rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.activity-detail h3 {
  margin: 1.5rem 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.activity-detail ul {
  margin: 0;
  padding-left: 1.1rem;
}

.activity-detail__content li + li {
  margin-top: 0.35rem;
}

.activity-detail__content li::marker {
  color: var(--color-text-muted);
}

.activity-detail__source h2 {
  font-size: 1.25rem;
}

.activity-detail__facts {
  display: grid;
  margin: 0;
}

.activity-detail__facts > div {
  border-top: 1px solid var(--color-border);
  padding-block: 1rem;
}

.activity-detail__facts dt {
  color: var(--color-heading);
  font-weight: 600;
}

.activity-detail__facts dd {
  margin: 0.5rem 0 0;
  line-height: 1.65;
}

.activity-detail__sessions {
  border-top: 1px solid var(--color-border);
  padding-top: clamp(2rem, 4vw, 3rem);
}

.activity-detail .activity-detail__session-list {
  display: grid;
  gap: 1rem;
  margin-top: 1.5rem;
  padding: 0;
  list-style: none;
}

.activity-detail__session-list > li {
  display: grid;
  min-width: 0;
  gap: 1.5rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.activity-detail__session-list p {
  margin: 0.4rem 0 0;
}

.activity-detail__session-date {
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.activity-detail__notice {
  padding-top: 0.5rem;
  color: var(--color-text-muted);
}

.activity-detail__availability {
  align-self: start;
  font-size: 0.9375rem;
}

.activity-detail__availability strong {
  color: var(--color-heading);
  font-weight: 600;
}

.activity-detail__availability .button {
  margin-top: 1rem;
}

@media (min-width: 768px) {
  .activity-detail__body {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.42fr);
    gap: clamp(3rem, 6vw, 5rem);
  }

  .activity-detail__session-list > li {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.42fr);
    gap: 2rem;
  }
}
</style>
