<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { useBackNavigation } from '@/shared/composables/useBackNavigation.js'
import { formatRelativeTime } from '@/shared/domain/relativeTime.js'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { useActivityCatalogue } from '@/features/activities/composables/useActivityCatalogue.js'
import {
  buildActivityCatalogue,
  formatActivityType,
  normalizeActivityView,
} from '@/features/activities/domain/activityCatalogue.js'
import SessionCalendarLoader from '@/features/bookings/components/SessionCalendarLoader.vue'
import SessionList from '@/features/bookings/components/SessionList.vue'
import { useMyBookings } from '@/features/bookings/composables/useMyBookings.js'
import { BOOKING_MESSAGES } from '@/features/bookings/domain/bookingMessages.js'
import {
  initialCalendarDate,
  toCalendarEvents,
} from '@/features/bookings/domain/sessionCalendar.js'
import Chip from '@/shared/components/Chip.vue'
import { formatCheckedDate } from '@/features/discovery/domain/servicePresentation.js'

const route = useRoute()
const router = useRouter()
const { goBack } = useBackNavigation({ name: 'activities' })
// The staff-only Edit link (spec 8.1 L975); the route meta and the rules guard the form itself.
const authStore = useAuthStore()
const canEdit = computed(() => authStore.canAccess(['staff', 'admin']))
const {
  status,
  activities,
  sessions,
  truncated,
  now,
  freshness,
  savedAt,
  error,
  errorMessage,
  revalidating,
  retry,
} = useActivityCatalogue()
// "You're booked, TA-..." on a row (spec 7.3): the member's bookings, loaded only when signed in.
const { bookings: myBookings } = useMyBookings({ withSessions: false })

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

// A saved copy without this id proves nothing (the activity may be newer than the copy): keep
// loading while the copy is revalidated, and report a failed fetch rather than "not found".
const awaitingEntry = computed(
  () =>
    status.value === 'loading' || status.value === 'idle' || (!entry.value && revalidating.value),
)
const entryUnavailable = computed(() => !entry.value && error.value !== null)

watch(entry, (value) => {
  if (value) {
    document.title = `${value.activity.title} | TurnAgain`
  }
})

const view = computed(() => normalizeActivityView(route.query.view))
const listNotice = ref('')
const setView = (next) => {
  listNotice.value = ''
  return router.replace({
    query: { ...route.query, view: next === 'calendar' ? 'calendar' : undefined },
  })
}
const calendarEvents = computed(() =>
  entry.value
    ? toCalendarEvents(
        entry.value.sessions,
        new Map([[entry.value.activity.id, entry.value.activity]]),
        myBookings.value,
        now.value,
      )
    : [],
)
const calendarDate = computed(() => initialCalendarDate(calendarEvents.value, now.value))

const sessionsHeading = ref(null)
// The loader and its focused "Show the list" button unmount with the calendar, so focus moves to
// the list's heading instead of <body>.
const showList = async () => {
  await setView('list')
  await nextTick()
  sessionsHeading.value?.focus()
}

const focusSessionRow = (sessionId) => {
  const row = document.getElementById(`session-${sessionId}`)
  if (!row) {
    listNotice.value = BOOKING_MESSAGES.sessionNotInList
    return
  }
  listNotice.value = ''
  row.scrollIntoView({ block: 'center' })
  row.focus({ preventScroll: true })
}

// D8 (spec 7.3 L936): an event opens its row in the list; a row that is not there is said so.
const onSelectSession = async ({ sessionId }) => {
  if (view.value === 'calendar') {
    await setView('list')
    await nextTick()
  }
  focusSessionRow(sessionId)
}

// `?session=<id>` from the Activities calendar (M5-D9): once the entry has loaded, focus the row
// after the router's #main-content focus (contract section 3.4), then drop the one-shot key. The
// view drops the key itself, so the next link with a session is a new value even when the router
// reuses this instance for another activity.
const requestedSession = computed(() =>
  typeof route.query.session === 'string' ? route.query.session : '',
)
watch(requestedId, () => {
  listNotice.value = ''
})
let handlingSession = false
watch(
  [entry, requestedSession],
  async ([value, requested]) => {
    if (!value || !requested || handlingSession) return
    handlingSession = true
    try {
      await nextTick()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      const query = { ...route.query }
      delete query.session
      delete query.view
      await router.replace({ query })
      await nextTick()
      focusSessionRow(requested)
    } finally {
      handlingSession = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="page-section">
    <div class="shell activity-detail">
      <button class="text-button back-link" type="button" @click="goBack">← Back</button>

      <div v-if="awaitingEntry" class="state-panel" role="status">
        <div>
          <h1>Loading activity details</h1>
          <p>Reading the current activity and session catalogue…</p>
        </div>
      </div>

      <div v-else-if="entryUnavailable" class="state-panel" role="alert">
        <div>
          <h1>Activity details are unavailable</h1>
          <p>{{ errorMessage }}</p>
          <button class="button button--primary" type="button" @click="retry">Try again</button>
        </div>
      </div>

      <article v-else-if="entry" class="activity-detail__card">
        <p v-if="freshness === 'cached' && savedAt" class="catalogue-freshness" role="status">
          Showing results saved {{ formatRelativeTime(savedAt, { now }) }}
        </p>
        <header class="activity-detail__header">
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

            <p v-if="canEdit" class="staff-edit-link">
              <RouterLink
                :to="{
                  name: 'staff-record-edit',
                  params: { kind: 'activities', recordId: entry.activity.id },
                }"
              >
                Edit this activity
              </RouterLink>
            </p>
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
                {{ entry.activity.providerName
                }}<span class="visually-hidden"> (opens in a new tab)</span>
              </a>
            </p>
            <p>Source checked {{ formatCheckedDate(entry.activity.sourceCheckedAt) }}</p>
          </aside>
        </div>

        <section class="activity-detail__sessions" aria-labelledby="sessions-heading">
          <header class="activity-detail__sessions-header">
            <h2 id="sessions-heading" ref="sessionsHeading" tabindex="-1">Sessions</h2>
            <div class="activity-detail__views" role="group" aria-label="Show sessions as">
              <Chip label="List" :pressed="view === 'list'" @toggle="setView('list')" />
              <Chip label="Calendar" :pressed="view === 'calendar'" @toggle="setView('calendar')" />
            </div>
          </header>
          <p class="activity-detail__sessions-status" role="status">{{ listNotice }}</p>

          <template v-if="entry.sessions.length">
            <SessionCalendarLoader
              v-if="view === 'calendar'"
              :events="calendarEvents"
              :initial-date="calendarDate"
              skip-target="activity-sessions-end"
              :heading-level="3"
              @select-session="onSelectSession"
              @show-list="showList"
            />
            <SessionList
              v-else
              :sessions="entry.sessions"
              :activity="entry.activity"
              :now="now"
              :my-bookings="myBookings"
              :truncated="truncated"
            />
          </template>

          <div v-else class="state-panel">
            <div>
              <h3>No future session is currently published</h3>
              <p>Use the provider source above to check the latest schedule.</p>
              <!-- SessionList carries this notice when it renders; a truncated catalogue may have
                   cut this activity's sessions, so the empty state must not read as definitive. -->
              <p v-if="truncated">Results incomplete: showing the first 1,000 records.</p>
            </div>
          </div>
          <span id="activity-sessions-end" tabindex="-1"></span>
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

.staff-edit-link {
  margin: 0;
  font-weight: 600;
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

.activity-detail__sessions-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}

.activity-detail__views {
  display: flex;
  gap: 0.5rem;
}

.activity-detail__sessions-status {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
}

@media (min-width: 768px) {
  .activity-detail__body {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.42fr);
    gap: clamp(3rem, 6vw, 5rem);
  }
}
</style>
