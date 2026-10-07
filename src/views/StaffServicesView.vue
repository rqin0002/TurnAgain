<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { useRecordStatus } from '@/features/staff/composables/useRecordStatus.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import {
  SERVICE_COLUMNS,
  SERVICE_DEFAULT_SORT,
  daysSinceChecked,
  isStaleSource,
  staleSourceLabel,
} from '@/features/staff/domain/registerColumns.js'
import AppButton from '@/shared/components/AppButton.vue'
import DataTable from '@/shared/components/DataTable.vue'
import ExportButtons from '@/shared/components/ExportButtons.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { useTableState } from '@/shared/composables/useTableState.js'

/**
 * The Service Register: every service in any status from the staff
 * catalogue, filtered, sorted and paged in the URL (`useTableState`), exported as the rows on
 * screen. A failed refresh keeps the register this session loaded and says so.
 */
const catalogue = useStaffCatalogue()
const { state, result, totalCount, setFilter, clearFilters, setSort, setPage } = useTableState(
  SERVICE_COLUMNS,
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
// Archive and Restore: one row at a time, the result in a mounted status line that
// takes focus once the change settles (the row's button is swapped by then).
const statusLine = ref(null)
const {
  pendingId,
  message: statusMessage,
  setStatus,
} = useRecordStatus({ focusTarget: statusLine })
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
        :columns="SERVICE_COLUMNS"
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
            :columns="SERVICE_COLUMNS"
            :rows="result.allRows"
            dataset="services"
            :filters="state.filters"
            :truncated="truncated"
          />
        </template>
        <template #cell-checked="{ row, text }">
          {{ text }}
          <span v-if="staleDays(row) !== null" class="staff-badge">
            {{ staleSourceLabel(staleDays(row)) }}
          </span>
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
            <AppButton
              v-if="row.status === 'published'"
              variant="text"
              :disabled="pendingId === row.id"
              @click="setStatus('services', row, 'archived')"
            >
              Archive <span class="visually-hidden">{{ row.name }}</span>
            </AppButton>
            <AppButton
              v-else
              variant="text"
              :disabled="pendingId === row.id"
              @click="setStatus('services', row, 'published')"
            >
              Restore <span class="visually-hidden">{{ row.name }}</span>
            </AppButton>
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

.staff-badge {
  display: inline-block;
  margin-top: 0.25rem;
  border: 1px solid var(--color-warning);
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  background: var(--color-warning-soft);
  color: var(--color-heading);
  font-size: 0.8125rem;
  font-weight: 600;
}

.staff-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}
</style>
