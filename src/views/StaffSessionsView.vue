<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import {
  sessionCancelLabel,
  useRecordStatus,
} from '@/features/staff/composables/useRecordStatus.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import {
  SESSION_COLUMNS,
  SESSION_DEFAULT_SORT,
  hasBookingCounts,
  hasWaitlistCount,
  sessionWhen,
  summariseActivities,
  toSessionRows,
} from '@/features/staff/domain/registerColumns.js'
import ActionsMenu from '@/shared/components/ActionsMenu.vue'
import DataTable from '@/shared/components/DataTable.vue'
import ExportButtons from '@/shared/components/ExportButtons.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import StatusTag from '@/shared/components/StatusTag.vue'
import { useTableState } from '@/shared/composables/useTableState.js'

/**
 * The Sessions register: every session in any status with its joined activity title, in the URL
 * like the Service Register, and the small Activities section that ends the page (there is no
 * Activities table). A row answers which activity and session it is, when and where it runs, how
 * it is booked and what can be done with it now: the day over the time range, the venue over the
 * suburb, the booking counts (muted where the platform holds none), the registration mode and the
 * status as a tag; each two-line cell reads and copies as its export text. View (a public session
 * of a published activity that has not ended) and Edit stay in the row; Participants and Email
 * participants (TurnAgain sessions, completed ones included), Cancel session or, for a provider or
 * drop-in session, Mark cancelled (open sessions) and Mark completed (open sessions that have
 * ended) sit in its More actions menu. An archived activity's entry offers no New session, since
 * its sessions would stay off the public pages.
 */
const PUBLIC_STATUSES = Object.freeze(['scheduled', 'full', 'cancelled'])
// The tone of a session status's tag; the tag's words carry the meaning, the tone only echoes it.
const STATUS_TONES = Object.freeze({
  scheduled: 'brand',
  full: 'warning',
  cancelled: 'danger',
  completed: 'neutral',
})

const catalogue = useStaffCatalogue()
const rows = computed(() => toSessionRows(catalogue.sessions.value, catalogue.activities.value))
const { state, result, totalCount, setFilter, clearFilters, setSort, setPage } = useTableState(
  SESSION_COLUMNS,
  { defaultSort: SESSION_DEFAULT_SORT, rows },
)
// Whatever compares with the time follows the clock on a page left open: the time is read again
// each minute and after every catalogue refresh.
const now = ref(new Date())
const readClock = () => {
  now.value = new Date()
}
watch(() => catalogue.sessions.value, readClock)
let clock = null
onMounted(() => {
  clock = window.setInterval(readClock, 60000)
})
onBeforeUnmount(() => window.clearInterval(clock))
const truncated = computed(
  () => catalogue.truncated.value.sessions || catalogue.truncated.value.activities,
)
const waiting = computed(() => ['idle', 'loading'].includes(catalogue.status.value))
const refreshNotice = computed(() =>
  catalogue.error.value
    ? `Showing the sessions loaded earlier. ${catalogue.errorMessage.value}`
    : '',
)
const activitySummaries = computed(() =>
  summariseActivities(catalogue.activities.value, catalogue.sessions.value, now.value),
)
const isOpen = (row) => row.status === 'scheduled' || row.status === 'full'
const hasEnded = (row) => Date.parse(row.endsAt) < now.value.getTime()
// View opens the activity's public page on this session, and that page lists only sessions that
// have not ended: a public session of a published activity, until its end time.
const isViewable = (row) =>
  PUBLIC_STATUSES.includes(row.status) &&
  Date.parse(row.endsAt) > now.value.getTime() &&
  catalogue.activitiesById.value.get(row.activityId)?.status === 'published'
// The accessible name of a row action: the activity and the session time, never the id.
const dateColumn = SESSION_COLUMNS.find((column) => column.key === 'date')
const rowName = (row) => `${row.activityTitle}, ${dateColumn.text(row)}`
// Cancel session (Mark cancelled for a provider or drop-in session) and Mark completed: the result
// goes to a mounted status line that takes focus once the change settles (the menu has handed
// focus back to its button by then, and the row may have left the filtered rows).
const statusLine = ref(null)
const {
  pendingId,
  message: statusMessage,
  setStatus,
} = useRecordStatus({ focusTarget: statusLine })
// The row's More actions, in a fixed order: the participant pages of a TurnAgain session, then
// the status changes an open session allows, keyed by the status they set and unavailable while
// that row's change is in flight.
const moreActions = (row) => {
  const items = []
  if (row.registrationType === 'turnagain') {
    items.push(
      { key: 'participants', label: 'Participants', to: `/staff/sessions/${row.id}` },
      {
        key: 'email',
        label: 'Email participants',
        to: `/staff/sessions/${row.id}#session-email`,
      },
    )
  }
  if (isOpen(row)) {
    const busy = pendingId.value === row.id
    // A TurnAgain session is cancelled; a provider or drop-in one is only marked so in the listing.
    items.push({ key: 'cancelled', label: sessionCancelLabel(row), disabled: busy })
    if (hasEnded(row)) items.push({ key: 'completed', label: 'Mark completed', disabled: busy })
  }
  return items
}
// Try again leaves with its error panel once the reload starts, so focus moves first to the heading
// that stays mounted over the loading state.
const heading = ref(null)
const retry = () => {
  heading.value?.focus()
  return catalogue.reload()
}
const upcomingText = (count) => {
  if (count === 0) return 'No upcoming sessions'
  return count === 1 ? '1 upcoming session' : `${count} upcoming sessions`
}
</script>

<template>
  <section class="staff-section" aria-labelledby="staff-sessions-heading">
    <h2 id="staff-sessions-heading" ref="heading" class="section-title" tabindex="-1">Sessions</h2>
    <p class="staff-section__lead">
      <RouterLink class="button button--primary" to="/staff/sessions/new">New session</RouterLink>
    </p>

    <StatePanel v-if="waiting" variant="loading" message="Loading the sessions…" />
    <StatePanel
      v-else-if="catalogue.status.value === 'error'"
      variant="error"
      title="The sessions could not be loaded"
      :error="catalogue.error.value"
      @retry="retry"
    />
    <template v-else>
      <p class="staff-section__notice" role="status">{{ refreshNotice }}</p>
      <p ref="statusLine" class="staff-section__notice" role="status" tabindex="-1">
        {{ statusMessage }}
      </p>
      <DataTable
        :columns="SESSION_COLUMNS"
        :result="result"
        :state="state"
        :total-count="totalCount"
        caption="Sessions, all statuses"
        :truncated="truncated"
        @filter="setFilter"
        @clear-filters="clearFilters"
        @sort="setSort"
        @page="setPage"
      >
        <template #toolbar>
          <ExportButtons
            :columns="SESSION_COLUMNS"
            :rows="result.allRows"
            dataset="sessions"
            :filters="state.filters"
            :truncated="truncated"
          />
        </template>
        <template #cell-date="{ row }">
          <span class="staff-lines">
            <span class="staff-nowrap">{{ sessionWhen(row).day }}</span>
            <span class="visually-hidden">, </span>
            <span class="staff-muted staff-nowrap">{{ sessionWhen(row).time }}</span>
          </span>
        </template>
        <template #cell-location="{ row }">
          <span class="staff-lines">
            <span dir="auto">{{ row.venueName }}</span>
            <span class="visually-hidden">, </span>
            <span class="staff-muted" dir="auto">{{ row.suburb }}</span>
          </span>
        </template>
        <template #cell-booked="{ row, text }">
          <span :class="{ 'staff-muted': !hasBookingCounts(row) }">{{ text }}</span>
        </template>
        <template #cell-waitlist="{ row, text }">
          <span :class="{ 'staff-muted': !hasWaitlistCount(row) }">{{ text }}</span>
        </template>
        <template #cell-status="{ row, text }">
          <StatusTag :tone="STATUS_TONES[row.status] ?? 'neutral'">{{ text }}</StatusTag>
        </template>
        <template #actions="{ row }">
          <div class="staff-row-actions">
            <RouterLink
              v-if="isViewable(row)"
              :to="{
                name: 'activity-detail',
                params: { activityId: row.activityId },
                query: { session: row.id },
              }"
            >
              View <span class="visually-hidden">{{ rowName(row) }}</span>
            </RouterLink>
            <RouterLink :to="`/staff/sessions/${row.id}/edit`">
              Edit <span class="visually-hidden">{{ rowName(row) }}</span>
            </RouterLink>
            <ActionsMenu
              v-if="moreActions(row).length > 0"
              :items="moreActions(row)"
              :name="rowName(row)"
              @select="(status) => setStatus('sessions', row, status)"
            />
          </div>
        </template>
      </DataTable>

      <section class="staff-activities" aria-labelledby="staff-activities-heading">
        <header class="staff-section__header">
          <h3 id="staff-activities-heading">Activities</h3>
          <div class="staff-row-actions">
            <RouterLink to="/staff/activities/new">New activity</RouterLink>
            <RouterLink to="/staff/sessions/new">New session</RouterLink>
          </div>
        </header>
        <p class="staff-activities__lead">
          An activity is what TurnAgain lists, such as a repair café or a swap; a session is one
          date, time and place of it, with its own way to register. Add the activity first, then its
          sessions.
        </p>
        <p v-if="activitySummaries.length === 0">No activities yet.</p>
        <ul v-else class="staff-activities__list">
          <li v-for="activity in activitySummaries" :key="activity.id">
            <p class="staff-activities__title" dir="auto">{{ activity.title }}</p>
            <p class="staff-activities__meta">
              {{ activity.typeLabel }} · {{ activity.statusLabel }} ·
              {{ upcomingText(activity.upcomingCount) }}
            </p>
            <div class="staff-row-actions">
              <RouterLink :to="`/staff/activities/${activity.id}/edit`">
                Edit <span class="visually-hidden">{{ activity.title }}</span>
              </RouterLink>
              <RouterLink
                v-if="activity.status !== 'archived'"
                :to="`/staff/sessions/new?activity=${activity.id}`"
              >
                New session <span class="visually-hidden">for {{ activity.title }}</span>
              </RouterLink>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.staff-section {
  display: grid;
  gap: 1.25rem;
  margin-top: 2rem;
}

.staff-section__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
}

.staff-section__lead,
.staff-section__notice {
  margin: 0;
}

/* A cell's main line over its secondary line (the hidden comma between them takes no row). */
.staff-lines {
  display: grid;
  gap: 0.125rem;
}

.staff-nowrap {
  white-space: nowrap;
}

/* Secondary text, and the counts the platform does not hold. */
.staff-muted {
  color: var(--color-text-muted);
}

.staff-row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 1rem;
}

/* The row's links keep a 44 px target, level with the menu button. */
.staff-row-actions a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
}

.staff-activities {
  display: grid;
  gap: 1rem;
  border-top: 1px solid var(--color-border);
  padding-top: 1.5rem;
}

.staff-activities h3 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.25rem;
}

.staff-activities__lead {
  max-width: 48rem;
  margin: 0;
  color: var(--color-text-muted);
}

.staff-activities__list {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.staff-activities__list li {
  display: grid;
  gap: 0.375rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
}

.staff-activities__title {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.staff-activities__meta {
  margin: 0;
  color: var(--color-text-muted);
}

@media (min-width: 768px) {
  .staff-activities__list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
