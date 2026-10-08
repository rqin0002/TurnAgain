<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import RatingSummary from '@/features/ratings/components/RatingSummary.vue'
import { useRatingSummaries } from '@/features/ratings/composables/useRatingSummaries.js'
import AttentionList from '@/features/staff/components/AttentionList.vue'
import BookingsChart from '@/features/staff/components/BookingsChart.vue'
import RatingsChart from '@/features/staff/components/RatingsChart.vue'
import RoleCounts from '@/features/staff/components/RoleCounts.vue'
import { useRecordStatus } from '@/features/staff/composables/useRecordStatus.js'
import { useRoleCounts } from '@/features/staff/composables/useRoleCounts.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import { buildAttentionList, overviewTiles } from '@/features/staff/domain/attention.js'
import { aggregateRatingSummaries } from '@/features/staff/domain/chartData.js'
import StatePanel from '@/shared/components/StatePanel.vue'

// The staff Overview page: the count tiles, the "Needs attention" list, the bookings and ratings
// charts and, for administrators, the role counts. Its records come from the staff catalogue the
// staff layout loads. The page itself loads only two things: the rating summaries of the
// published services, whenever that list changes (and hands them down, since a staff component
// never imports a ratings composable), and the role counts, on mount and after an identity
// change.
const authStore = useAuthStore()
const catalogue = useStaffCatalogue()
const { services, activities, sessions, corrections, emailLogs, activitiesById } = catalogue
const { status: catalogueStatus, error: catalogueError, truncated } = catalogue
const recordStatus = useRecordStatus()
const { pendingId, message: statusMessage } = recordStatus
const roleCounts = useRoleCounts()
const { counts, status: countsStatus } = roleCounts

const isAdmin = computed(() => authStore.canAccess(['admin']))
const now = ref(new Date())
watch([services, sessions, corrections, emailLogs], () => {
  now.value = new Date()
})

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
const allRated = computed(() => aggregateRatingSummaries(summariesById.value))
// A summary the read could not return is a gap in the figures, never a service without ratings:
// the tile and the chart name the gap, and a failed read with nothing to show offers Try again.
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
const ratingsHeading = ref(null)
const retryCatalogue = () => {
  overviewHeading.value?.focus()
  catalogue.reload()
}
const retryRatings = () => {
  ratingsHeading.value?.focus()
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
    <h2 id="staff-overview-heading" ref="overviewHeading" class="section-title" tabindex="-1">
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
      <!-- Mounted with the Overview; only its text changes. It sits outside the gapped grid below,
           so while it is empty it takes no space. -->
      <p class="staff-overview__notice" role="status">{{ refreshNotice }}</p>
      <div class="staff-overview">
        <dl class="staff-overview__tiles">
          <div class="staff-overview__tile">
            <dt>Open corrections</dt>
            <dd>{{ tiles.openCorrections }}</dd>
          </div>
          <div class="staff-overview__tile">
            <dt>Upcoming sessions</dt>
            <dd>{{ tiles.upcomingSessions }}</dd>
          </div>
          <div class="staff-overview__tile">
            <dt>Emails sent in 30 days</dt>
            <dd>{{ tiles.emailsLast30Days }}</dd>
          </div>
          <div class="staff-overview__tile staff-overview__tile--ratings">
            <dt>All rated services</dt>
            <dd>
              <RatingSummary v-if="allRated" :summary="allRated" />
              <span v-else-if="ratingsStatus === 'error'">The ratings could not be loaded</span>
              <span v-else-if="ratingsStatus === 'loading'">Loading the ratings…</span>
              <span v-else-if="ratingsGap">No ratings among the summaries that loaded</span>
              <span v-else>No ratings yet</span>
              <span v-if="ratingsGap" class="staff-overview__ratings-gap">{{ ratingsGap }}</span>
            </dd>
          </div>
        </dl>

        <!-- Mounted with the Overview; only its text changes. -->
        <p ref="statusLine" class="staff-overview__status" role="status" tabindex="-1">
          {{ statusMessage }}
        </p>
        <AttentionList
          :groups="groups"
          :truncated="anyTruncated"
          :pending-id="pendingId"
          @mark-completed="markCompleted"
        />

        <section class="staff-overview__chart" aria-labelledby="overview-bookings-heading">
          <h3 id="overview-bookings-heading">Bookings for the next TurnAgain sessions</h3>
          <BookingsChart :sessions="sessions" :activities-by-id="activitiesById" :now="now" />
        </section>
        <section class="staff-overview__chart" aria-labelledby="overview-ratings-heading">
          <h3 id="overview-ratings-heading" ref="ratingsHeading" tabindex="-1">
            Ratings by service
          </h3>
          <StatePanel
            v-if="ratingsStatus === 'error'"
            variant="error"
            message="The rating summaries could not be loaded."
            @retry="retryRatings"
          />
          <template v-else>
            <p v-if="ratingsGap" class="staff-overview__ratings-gap">{{ ratingsGap }}</p>
            <RatingsChart :services="publishedServices" :summaries-by-id="summariesById" />
          </template>
        </section>

        <RoleCounts
          :counts="counts"
          :status="countsStatus"
          :is-admin="isAdmin"
          @retry="roleCounts.load()"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.staff-overview {
  display: grid;
  gap: 1.5rem;
}

.staff-overview__tiles {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  margin: 0;
}

.staff-overview__tile {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  background: var(--color-surface);
  padding: 0.75rem 1rem;
}

.staff-overview__tile dt {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.staff-overview__tile dd {
  margin: 0.25rem 0 0;
  color: var(--color-heading);
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.staff-overview__tile--ratings dd {
  display: grid;
  gap: 0.25rem;
  font-size: 1rem;
  font-weight: 400;
}

.staff-overview__ratings-gap {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.staff-overview__notice,
.staff-overview__status {
  margin: 0;
}

/* The same space the grid's gap puts between its items, only while the notice has text. */
.staff-overview__notice:not(:empty) {
  margin-block-end: 1.5rem;
}

.staff-overview__chart {
  display: grid;
  gap: 0.75rem;
}

.staff-overview__chart h3 {
  margin: 0;
}

@media (min-width: 768px) {
  .staff-overview__tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .staff-overview__tile--ratings {
    grid-column: 1 / -1;
  }
}
</style>
