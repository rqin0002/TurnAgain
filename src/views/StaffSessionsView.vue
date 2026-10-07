<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { useRecordStatus } from '@/features/staff/composables/useRecordStatus.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import {
  SESSION_COLUMNS,
  SESSION_DEFAULT_SORT,
  summariseActivities,
  toSessionRows,
} from '@/features/staff/domain/registerColumns.js'
import AppButton from '@/shared/components/AppButton.vue'
import DataTable from '@/shared/components/DataTable.vue'
import ExportButtons from '@/shared/components/ExportButtons.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { useTableState } from '@/shared/composables/useTableState.js'

/**
 * The Sessions register: every session in any status with its joined activity
 * title, in the URL like the Service Register, and the small Activities section that ends
 * the page (there is no Activities table). Participants and Email belong to TurnAgain sessions;
 * View opens the public page of a public session whose activity is published.
 */
const PUBLIC_STATUSES = Object.freeze(['scheduled', 'full', 'cancelled'])

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
const isViewable = (row) =>
  PUBLIC_STATUSES.includes(row.status) &&
  catalogue.activitiesById.value.get(row.activityId)?.status === 'published'
// The accessible name of a row action: the activity and the session time, never the id.
const dateColumn = SESSION_COLUMNS.find((column) => column.key === 'date')
const rowName = (row) => `${row.activityTitle}, ${dateColumn.text(row)}`
// Cancel session and Mark completed: open sessions only, Mark completed once ended.
// The result goes to a mounted status line that takes focus once the change settles (the row's
// buttons are gone or disabled by then).
const statusLine = ref(null)
const {
  pendingId,
  message: statusMessage,
  setStatus,
} = useRecordStatus({ focusTarget: statusLine })
const isOpen = (row) => row.status === 'scheduled' || row.status === 'full'
const hasEnded = (row) => Date.parse(row.endsAt) < now.value.getTime()
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
            <template v-if="row.registrationType === 'turnagain'">
              <RouterLink :to="`/staff/sessions/${row.id}`">
                Participants <span class="visually-hidden">{{ rowName(row) }}</span>
              </RouterLink>
              <RouterLink :to="`/staff/sessions/${row.id}#session-email`">
                Email <span class="visually-hidden">{{ rowName(row) }}</span>
              </RouterLink>
            </template>
            <template v-if="isOpen(row)">
              <AppButton
                variant="text"
                :disabled="pendingId === row.id"
                @click="setStatus('sessions', row, 'cancelled')"
              >
                Cancel session <span class="visually-hidden">{{ rowName(row) }}</span>
              </AppButton>
              <AppButton
                v-if="hasEnded(row)"
                variant="text"
                :disabled="pendingId === row.id"
                @click="setStatus('sessions', row, 'completed')"
              >
                Mark completed <span class="visually-hidden">{{ rowName(row) }}</span>
              </AppButton>
            </template>
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
              <RouterLink :to="`/staff/sessions/new?activity=${activity.id}`">
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

.staff-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
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
