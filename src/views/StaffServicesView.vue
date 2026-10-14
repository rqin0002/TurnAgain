<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { useItemCategories } from '@/features/discovery/composables/useItemCategories.js'
import { useRecordStatus } from '@/features/staff/composables/useRecordStatus.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import {
  SERVICE_DEFAULT_SORT,
  daysSinceChecked,
  isStaleSource,
  serviceColumnsFor,
  staleSourceLabel,
} from '@/features/staff/domain/registerColumns.js'
import ActionsMenu from '@/shared/components/ActionsMenu.vue'
import DataTable from '@/shared/components/DataTable.vue'
import ExportButtons from '@/shared/components/ExportButtons.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import StatusTag from '@/shared/components/StatusTag.vue'
import { useTableState } from '@/shared/composables/useTableState.js'

/**
 * The Service Register: every service in any status from the staff catalogue, filtered, sorted
 * and paged in the URL (`useTableState`), exported as the rows on screen. The name search and the
 * status filter stay in view; the other filters sit under More filters. Each row offers View
 * (published services) and Edit, and puts Archive or Restore in its More actions menu; the status
 * and a stale source read as words in tags. A failed refresh keeps the register this session
 * loaded and says so.
 */
const catalogue = useStaffCatalogue()
const itemCategories = useItemCategories()
// The Items filter also finds a row by the names of its categories, added ones included.
const columns = computed(() => serviceColumnsFor(itemCategories.index.value))
const { state, result, totalCount, setFilter, clearFilters, setSort, setPage } = useTableState(
  columns,
  { defaultSort: SERVICE_DEFAULT_SORT, rows: () => catalogue.services.value },
)
const truncated = computed(() => catalogue.truncated.value.services)
const waiting = computed(() => ['idle', 'loading'].includes(catalogue.status.value))
const refreshNotice = computed(() =>
  catalogue.error.value
    ? `Showing the register loaded earlier. ${catalogue.errorMessage.value}`
    : '',
)
// The stale badges follow the clock on a page left open: the time is read again each minute and
// after every catalogue refresh.
const now = ref(new Date())
const readClock = () => {
  now.value = new Date()
}
watch(() => catalogue.services.value, readClock)
let clock = null
onMounted(() => {
  clock = window.setInterval(readClock, 60000)
})
onBeforeUnmount(() => window.clearInterval(clock))
const staleDays = (row) =>
  isStaleSource(row, now.value) ? daysSinceChecked(row.source.checkedAt, now.value) : null
// Archive and Restore: one row at a time from the row's More actions menu, the result in a
// mounted status line that takes focus once the change settles (the menu has handed focus back to
// its button by then, and the row may have left the filtered rows).
const statusLine = ref(null)
const {
  pendingId,
  message: statusMessage,
  setStatus,
} = useRecordStatus({ focusTarget: statusLine })
// The row's status change, keyed by the status it sets: Archive a published service, Restore an
// archived one; unavailable while that row's change is in flight.
const statusItems = (row) => [
  row.status === 'published'
    ? { key: 'archived', label: 'Archive', disabled: pendingId.value === row.id }
    : { key: 'published', label: 'Restore', disabled: pendingId.value === row.id },
]
// Try again leaves with its error panel once the reload starts, so focus moves first to the heading
// that stays mounted over the loading state.
const heading = ref(null)
const retry = () => {
  heading.value?.focus()
  return catalogue.reload()
}
</script>

<template>
  <section class="staff-section" aria-labelledby="staff-services-heading">
    <h2 id="staff-services-heading" ref="heading" class="section-title" tabindex="-1">
      Service register
    </h2>
    <p class="staff-section__lead">
      <RouterLink class="button button--primary" to="/staff/services/new">New service</RouterLink>
    </p>

    <StatePanel v-if="waiting" variant="loading" message="Loading the service register…" />
    <StatePanel
      v-else-if="catalogue.status.value === 'error'"
      variant="error"
      title="The service register could not be loaded"
      :error="catalogue.error.value"
      @retry="retry"
    />
    <template v-else>
      <p class="staff-section__notice" role="status">{{ refreshNotice }}</p>
      <p ref="statusLine" class="staff-section__notice" role="status" tabindex="-1">
        {{ statusMessage }}
      </p>
      <DataTable
        :columns="columns"
        :result="result"
        :state="state"
        :total-count="totalCount"
        caption="Services, all statuses"
        :truncated="truncated"
        @filter="setFilter"
        @clear-filters="clearFilters"
        @sort="setSort"
        @page="setPage"
      >
        <template #toolbar>
          <ExportButtons
            :columns="columns"
            :rows="result.allRows"
            dataset="services"
            :filters="state.filters"
            :truncated="truncated"
          />
        </template>
        <template #cell-checked="{ row, text }">
          <span class="staff-checked">
            {{ text }}
            <StatusTag v-if="staleDays(row) !== null" tone="warning">
              {{ staleSourceLabel(staleDays(row)) }}
            </StatusTag>
          </span>
        </template>
        <template #cell-status="{ row, text }">
          <StatusTag :tone="row.status === 'published' ? 'success' : 'neutral'">{{
            text
          }}</StatusTag>
        </template>
        <template #actions="{ row }">
          <div class="staff-row-actions">
            <RouterLink
              v-if="row.status === 'published'"
              :to="{ name: 'service-detail', params: { serviceId: row.id } }"
            >
              View <span class="visually-hidden">{{ row.name }}</span>
            </RouterLink>
            <RouterLink :to="`/staff/services/${row.id}/edit`">
              Edit <span class="visually-hidden">{{ row.name }}</span>
            </RouterLink>
            <ActionsMenu
              :items="statusItems(row)"
              :name="row.name"
              @select="(status) => setStatus('services', row, status)"
            />
          </div>
        </template>
      </DataTable>
    </template>
  </section>
</template>

<style scoped>
.staff-section {
  display: grid;
  gap: 1.25rem;
  margin-top: 2rem;
}

.staff-section__lead,
.staff-section__notice {
  margin: 0;
}

.staff-checked {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
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
</style>
