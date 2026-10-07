<script setup>
import { computed, ref } from 'vue'

import TeamTable from '@/features/staff/components/TeamTable.vue'
import { useTeam } from '@/features/staff/composables/useTeam.js'
import { TEAM_COLUMNS, TEAM_DEFAULT_SORT } from '@/features/staff/domain/team.js'
import CapabilityNotice from '@/shared/components/CapabilityNotice.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { useTableState } from '@/shared/composables/useTableState.js'

// The Team tab (route meta allowedRoles ['admin']): configuration decides it
// (CapabilityNotice when the build has no Cloud Functions); otherwise the table of every
// profile with the per-row access actions. No export: these are personal records.
const { enabled, rows, status, error, truncated, load, check, applyRole, setStatus, retry } =
  useTeam()

const users = computed(() => rows.value.map((row) => row.user))
const rowsByUid = computed(() => Object.fromEntries(rows.value.map((row) => [row.uid, row])))
const table = useTableState(TEAM_COLUMNS, { defaultSort: TEAM_DEFAULT_SORT, rows: users })
const { state, result, totalCount } = table
// Try again leaves with its error panel once the list loads again, so focus moves first to the
// heading that stays mounted over the loading state. `retry` is already the row Retry of TeamTable.
const heading = ref(null)
const retryList = () => {
  heading.value?.focus()
  return load()
}
</script>

<template>
  <section class="staff-section" aria-labelledby="staff-team-heading">
    <h2 id="staff-team-heading" ref="heading" class="section-title" tabindex="-1">Team</h2>
    <CapabilityNotice v-if="!enabled" :enabled="false" feature="team" />
    <template v-else>
      <p class="staff-team__intro">
        Each row shows the profile status and whether the account can sign in.
      </p>
      <StatePanel v-if="status === 'loading'" variant="loading" message="Loading the team…" />
      <StatePanel
        v-else-if="status === 'error'"
        variant="error"
        :error="error"
        @retry="retryList"
      />
      <TeamTable
        v-else-if="status === 'ready'"
        :columns="TEAM_COLUMNS"
        :result="result"
        :state="state"
        :total-count="totalCount"
        :truncated="truncated"
        :rows-by-uid="rowsByUid"
        @filter="table.setFilter"
        @clear-filters="table.clearFilters"
        @sort="table.setSort"
        @page="table.setPage"
        @check="check"
        @apply-role="applyRole"
        @set-status="setStatus"
        @retry="retry"
      />
    </template>
  </section>
</template>

<style scoped>
.staff-team__intro {
  margin: 0 0 1rem;
  color: var(--color-text-muted);
}
</style>
