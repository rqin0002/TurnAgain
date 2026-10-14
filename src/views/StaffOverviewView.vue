<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { useRatingSummaries } from '@/features/ratings/composables/useRatingSummaries.js'
import AttentionList from '@/features/staff/components/AttentionList.vue'
import BookingsChart from '@/features/staff/components/BookingsChart.vue'
import OverviewPanel from '@/features/staff/components/OverviewPanel.vue'
import RatingsChart from '@/features/staff/components/RatingsChart.vue'
import RoleCounts from '@/features/staff/components/RoleCounts.vue'
import { useRecordStatus } from '@/features/staff/composables/useRecordStatus.js'
import { useRoleCounts } from '@/features/staff/composables/useRoleCounts.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import { buildAttentionList, overviewTiles } from '@/features/staff/domain/attention.js'
import { aggregateRatingSummaries } from '@/features/staff/domain/chartData.js'
import StatePanel from '@/shared/components/StatePanel.vue'

// The staff Overview page, in the order a staff member works through it: three counts, then the
// daily work ("Needs attention" and the places on the next TurnAgain sessions), then the
// service ratings, which staff and administrators only read, and, for administrators, the
// accounts by role. Every section is the same card (OverviewPanel). Below 992px the cards stack
// in that order; from 992px they form one grid of two rows, the daily work in the wide left
// column and the rest in the right one, and the two cards of a row stretch to one height. Its
// records come from the staff catalogue the staff layout loads. The page itself loads
// only two things: the rating summaries of the published services, whenever that list changes
// (and hands them down, since a staff component never imports a ratings composable), and the
// role counts, on mount and after an identity change. Every figure built from a list the
// catalogue cut at 1,000 records says so beside it.
const authStore = useAuthStore()
const catalogue = useStaffCatalogue()
const { services, activities, sessions, corrections, emailLogs, activitiesById } = catalogue
const { status: catalogueStatus, error: catalogueError, truncated } = catalogue
const recordStatus = useRecordStatus()
const { pendingId, message: statusMessage } = recordStatus
const roleCounts = useRoleCounts()
const { counts, status: countsStatus } = roleCounts

const isAdmin = computed(() => authStore.canAccess(['admin']))
// Whatever compares with the time follows the clock on a page left open: the time is read again
// each minute and after every catalogue refresh.
const now = ref(new Date())
const readClock = () => {
  now.value = new Date()
}
watch([services, sessions, corrections, emailLogs], readClock)
let clock = null
onMounted(() => {
  clock = window.setInterval(readClock, 60000)
})
onBeforeUnmount(() => window.clearInterval(clock))

const publishedServices = computed(() =>
  services.value.filter((service) => service.status === 'published'),
)
const ratings = useRatingSummaries({ services: publishedServices })
const { summariesById, status: ratingsStatus, failedIds: ratingFailedIds } = ratings
watch(
  publishedServices,
  (list) => {
    if (list.length > 0) void ratings.load()
  },
  { immediate: true },
)

// A failed refresh keeps the lists loaded earlier with status 'ready'; this line says so.
const refreshNotice = computed(() =>
  catalogueError.value
    ? `Showing the overview loaded earlier. ${catalogue.errorMessage.value}`
    : '',
)
const anyTruncated = computed(() => Object.values(truncated.value).some(Boolean))
const INCOMPLETE = 'Incomplete: first 1,000 records'
// The catalogue lists each figure is built from, so a list cut at 1,000 records is named beside
// the figures it affects and nowhere else. The role counts are their own count queries.
const incomplete = computed(() => {
  const cut = truncated.value
  return {
    corrections: Boolean(cut.corrections),
    sessions: Boolean(cut.sessions),
    emailLogs: Boolean(cut.emailLogs),
    bookings: Boolean(cut.sessions || cut.activities),
    ratings: Boolean(cut.services),
  }
})
const groups = computed(() =>
  buildAttentionList({
    services: services.value,
    activities: activities.value,
    sessions: sessions.value,
    corrections: corrections.value,
    emailLogs: emailLogs.value,
    now: now.value,
  }),
)
const tiles = computed(() =>
  overviewTiles({
    corrections: corrections.value,
    sessions: sessions.value,
    emailLogs: emailLogs.value,
    now: now.value,
  }),
)
const number = (value) => new Intl.NumberFormat('en-AU').format(value)
// Each count with the one line that says what it counts.
const countTiles = computed(() => [
  {
    key: 'corrections',
    label: 'Open corrections',
    value: tiles.value.openCorrections,
    note: 'Reported on service pages and still open',
    incomplete: incomplete.value.corrections,
  },
  {
    key: 'sessions',
    label: 'Upcoming TurnAgain sessions',
    value: tiles.value.upcomingSessions,
    note: 'Booked through TurnAgain, scheduled or full, not yet started',
    incomplete: incomplete.value.sessions,
  },
  {
    key: 'emails',
    label: 'Session emails sent, last 30 days',
    value: tiles.value.emailsLast30Days,
    note: 'Counted once per send from a session page, not per recipient. Delivery is not confirmed.',
    incomplete: incomplete.value.emailLogs,
  },
])

const allRated = computed(() => aggregateRatingSummaries(summariesById.value))
// One decimal, as the public pages show an average.
const averageText = computed(() => allRated.value?.averageRating.toFixed(1) ?? '')
const ratingCountText = computed(() => {
  const count = allRated.value?.ratingCount ?? 0
  return `${number(count)} ${count === 1 ? 'rating' : 'ratings'}`
})
// A summary the read could not return is a gap in the figures, never a service without ratings:
// the ratings section names the gap, and a failed read with nothing to show offers Try again.
const ratingsGap = computed(() => {
  const count = ratingFailedIds.value.length
  // A gap qualifies figures on screen; while a retry after a failed read runs, there are none.
  const showing = ratingsStatus.value === 'ready' || Object.keys(summariesById.value).length > 0
  if (count === 0 || !showing) return ''
  return count === 1
    ? '1 rating summary could not be retrieved or validated. It is not included here.'
    : `${count} rating summaries could not be retrieved or validated. They are not included here.`
})

// Each Try again below leaves with its error panel once the load starts again, so focus moves
// first to the heading that stays mounted over the reloading content, never to <body>.
const overviewHeading = ref(null)
const ratingsPanel = ref(null)
const retryCatalogue = () => {
  overviewHeading.value?.focus()
  catalogue.reload()
}
const retryRatings = () => {
  ratingsPanel.value?.focusHeading()
  void ratings.retry()
}

// The used Mark completed button turns busy and then leaves the list with its session, so focus
// moves to the mounted status line that announces the result, never to <body>.
const statusLine = ref(null)
const markCompleted = async (sessionId) => {
  const session = sessions.value.find((entry) => entry.id === sessionId)
  if (!session) return
  statusLine.value?.focus()
  await recordStatus.setStatus('sessions', session, 'completed')
}

onMounted(() => void roleCounts.load())
watch(
  () => authStore.identityEpoch,
  () => void roleCounts.load(),
)
</script>

<template>
  <section class="staff-section" aria-labelledby="staff-overview-heading">
    <h2
      id="staff-overview-heading"
      ref="overviewHeading"
      class="section-title staff-overview__heading"
      tabindex="-1"
    >
      Overview
    </h2>
    <StatePanel
      v-if="catalogueStatus === 'loading' || catalogueStatus === 'idle'"
      variant="loading"
      message="Loading the staff records…"
    />
    <StatePanel
      v-else-if="catalogueStatus === 'error'"
      variant="error"
      :error="catalogueError"
      @retry="retryCatalogue"
    />
    <template v-else>
      <!-- Mounted with the Overview; only its text changes. While it is empty it takes no space. -->
      <p class="staff-overview__notice" role="status">{{ refreshNotice }}</p>
      <div class="staff-overview">
        <dl class="staff-overview__counts">
          <div v-for="tile in countTiles" :key="tile.key" class="staff-overview__count">
            <dt>{{ tile.label }}</dt>
            <dd class="staff-overview__figure">{{ number(tile.value) }}</dd>
            <dd class="staff-overview__note">{{ tile.note }}</dd>
            <dd v-if="tile.incomplete" class="staff-overview__incomplete">{{ INCOMPLETE }}</dd>
          </div>
        </dl>

        <div>
          <!-- Mounted with the Overview; only its text changes. While it is empty it takes no
               space. -->
          <p ref="statusLine" class="staff-overview__status" role="status" tabindex="-1">
            {{ statusMessage }}
          </p>
          <div class="staff-overview__grid">
            <AttentionList
              class="staff-overview__attention"
              :groups="groups"
              :truncated="anyTruncated"
              :pending-id="pendingId"
              @mark-completed="markCompleted"
            />

            <OverviewPanel class="staff-overview__bookings" heading-id="overview-bookings-heading">
              <template #title>Places on the next TurnAgain sessions</template>
              <p v-if="incomplete.bookings" class="staff-overview__incomplete">{{ INCOMPLETE }}</p>
              <BookingsChart :sessions="sessions" :activities-by-id="activitiesById" :now="now" />
            </OverviewPanel>

            <OverviewPanel
              ref="ratingsPanel"
              class="staff-overview__ratings"
              heading-id="overview-ratings-heading"
            >
              <template #title>Service ratings</template>
              <template #lead>
                Ratings come from members. Staff and administrators can read them here but not
                change them.
              </template>
              <p v-if="incomplete.ratings" class="staff-overview__incomplete">{{ INCOMPLETE }}</p>
              <StatePanel
                v-if="ratingsStatus === 'error'"
                variant="error"
                message="The rating summaries could not be loaded."
                @retry="retryRatings"
              />
              <template v-else>
                <div class="staff-overview__rating-summary">
                  <p class="staff-overview__rating-total" data-testid="rating-total">
                    <template v-if="allRated">
                      <strong class="staff-overview__average">{{ averageText }}</strong> / 5 average
                      from <span data-testid="rating-count">{{ ratingCountText }}</span>
                    </template>
                    <template v-else-if="ratingsStatus === 'loading'"
                      >Loading the ratings…</template
                    >
                    <template v-else-if="ratingsGap"
                      >No ratings among the summaries that loaded</template
                    >
                    <template v-else>No ratings yet</template>
                  </p>
                  <p v-if="allRated" class="staff-overview__note">
                    Every rating on the published services counts once.
                  </p>
                </div>
                <p v-if="ratingsGap" class="staff-overview__ratings-gap">{{ ratingsGap }}</p>
                <div v-if="allRated" class="staff-overview__chart">
                  <h4>Most-rated services</h4>
                  <p class="staff-overview__note">
                    Up to eight published services with the most ratings. Each bar is one service's
                    ratings by star level, so its length is its number of ratings.
                  </p>
                  <RatingsChart :services="publishedServices" :summaries-by-id="summariesById" />
                </div>
              </template>
            </OverviewPanel>

            <RoleCounts
              class="staff-overview__accounts"
              :counts="counts"
              :status="countsStatus"
              :is-admin="isAdmin"
              @retry="roleCounts.load()"
            />
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* One spacing scale for the whole page: 0.25, 0.5, 0.75, 1, 1.25 and 1.5rem. */
.staff-overview__heading {
  margin-block-end: 1.25rem;
}

.staff-overview {
  display: grid;
  gap: 1.5rem;
}

.staff-overview__counts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  margin: 0;
}

/* The only tinted blocks at the top of the page, so the eye lands on the counts first. */
.staff-overview__count {
  display: grid;
  align-content: start;
  gap: 0.25rem;
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 1rem 1.25rem;
}

.staff-overview__count dt {
  color: var(--color-heading);
  font-weight: 600;
}

.staff-overview__count dd {
  margin: 0;
}

.staff-overview__figure {
  color: var(--color-heading);
  font-size: 2rem;
  font-weight: 650;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.staff-overview__note,
.staff-overview__ratings-gap {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.staff-overview__incomplete {
  margin: 0;
  color: var(--color-warning);
  font-size: 0.9375rem;
  font-weight: 600;
}

.staff-overview__notice,
.staff-overview__status {
  margin: 0;
}

.staff-overview__notice:not(:empty) {
  margin-block-end: 1.25rem;
}

.staff-overview__status:not(:empty) {
  margin-block-end: 1rem;
}

/* One column below 992px: the cards in reading order, each the full width. */
.staff-overview__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
}

.staff-overview__rating-summary {
  display: grid;
  gap: 0.25rem;
}

.staff-overview__rating-total {
  margin: 0;
}

.staff-overview__average {
  color: var(--color-heading);
  font-size: 1.5rem;
  font-weight: 650;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.staff-overview__chart {
  display: grid;
  gap: 0.5rem;
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
}

.staff-overview__chart h4 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1rem;
  font-weight: 600;
}

@media (min-width: 768px) {
  .staff-overview__counts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* Two rows of two from 992px: the daily work on the wide left, the ratings and the accounts on
   the right. The grid stretches the two cards of a row to one height. The areas follow the
   reading order down each column, which is also the order of the cards in the page. */
@media (min-width: 992px) {
  .staff-overview__grid {
    grid-template-areas:
      'attention ratings'
      'bookings accounts';
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  }

  .staff-overview__attention {
    grid-area: attention;
  }

  .staff-overview__bookings {
    grid-area: bookings;
  }

  .staff-overview__ratings {
    grid-area: ratings;
  }

  .staff-overview__accounts {
    grid-area: accounts;
  }
}

@media (forced-colors: active) {
  .staff-overview__count {
    border: 1px solid CanvasText;
  }
}
</style>
