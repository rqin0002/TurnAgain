<script setup>
import { computed, ref } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import CapabilityNotice from '@/shared/components/CapabilityNotice.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { useTableState } from '@/shared/composables/useTableState.js'

import { useTeam } from '../composables/useTeam.js'
import { ACCOUNT_SECTIONS, TEAM_DEFAULT_SORT, TEAM_MESSAGES, skippedText } from '../domain/team.js'

import TeamTable from './TeamTable.vue'

/**
 * One admin account page, Team or Members (both routes carry allowedRoles ['admin']; the rules
 * and adminSetUserAccess are the real boundary): the heading, CapabilityNotice when the build has
 * no Cloud Functions, otherwise the page's introduction, the line that reports a check run, the
 * count of profiles the read could not use, and the account table. Team checks its accounts when
 * it loads; Members offers "Check sign-in for this page" instead (the page's accounts, one at a
 * time). Filters, sort and page live in each page's own URL. No export: these are personal
 * records.
 */
const props = defineProps({
  section: {
    type: String,
    required: true,
    validator: (value) => Object.hasOwn(ACCOUNT_SECTIONS, value),
  },
})

const page = ACCOUNT_SECTIONS[props.section]
const team = useTeam({ section: props.section })
const { enabled, rows, status, error, truncated, skippedCount, moved, sweeping, sweepNotice } = team

const users = computed(() => rows.value.map((row) => row.user))
const rowsByUid = computed(() => Object.fromEntries(rows.value.map((row) => [row.uid, row])))
const table = useTableState(page.columns, { defaultSort: TEAM_DEFAULT_SORT, rows: users })
const { state, result, totalCount } = table
// An empty page and a search that matches nothing are different answers.
const emptyMessage = computed(() => (totalCount.value === 0 ? page.empty : TEAM_MESSAGES.noMatch))
const sweepText = computed(
  () => sweepNotice.value || (sweeping.value ? 'Checking sign-in states…' : ''),
)
const headingId = `staff-${props.section}-heading`

// Try again leaves with its error panel once the list loads again, so focus moves first to the
// heading that stays mounted over the loading state.
const heading = ref(null)
const retryList = () => {
  heading.value?.focus()
  return team.load()
}

const sweepLine = ref(null)
const accountsOf = (list, { uncheckedOnly = false } = {}) =>
  list
    .map((user) => rowsByUid.value[user.uid])
    .filter((row) => row && !row.self && (!uncheckedOnly || row.access === null))
    .map((row) => row.uid)
/** Members: the accounts on the page being shown. The button stays and says it is busy. */
const checkPage = () => team.checkMany(accountsOf(result.value.rows))
/**
 * After a stopped run: the accounts still without a sign-in state (Team: all of them, in the
 * list's order; Members: those on the page being shown). Check again leaves with the notice, so
 * the focus moves first to the line that reports the run.
 */
const checkAgain = () => {
  sweepLine.value?.focus()
  const list = page.checksOnLoad ? users.value : result.value.rows
  return team.checkMany(accountsOf(list, { uncheckedOnly: true }))
}
</script>

<template>
  <section class="accounts" :aria-labelledby="headingId">
    <h2 :id="headingId" ref="heading" class="section-title" tabindex="-1">{{ page.title }}</h2>
    <CapabilityNotice v-if="!enabled" :enabled="false" :feature="section" />
    <template v-else>
      <p class="accounts__intro">{{ page.intro }}</p>
      <StatePanel v-if="status === 'loading'" variant="loading" :message="page.loading" />
      <StatePanel
        v-else-if="status === 'error'"
        variant="error"
        :error="error"
        @retry="retryList"
      />
      <template v-else-if="status === 'ready'">
        <div class="accounts__checks">
          <AppButton
            v-if="!page.checksOnLoad && result.rows.length > 0"
            variant="secondary"
            :busy="sweeping"
            @click="checkPage"
            >Check sign-in for this page</AppButton
          >
          <p ref="sweepLine" class="accounts__sweep" role="status" tabindex="-1">
            {{ sweepText }}
          </p>
          <AppButton v-if="sweepNotice" variant="text" @click="checkAgain">Check again</AppButton>
        </div>
        <p v-if="skippedCount > 0" class="accounts__skipped">{{ skippedText(skippedCount) }}</p>
        <TeamTable
          :section="section"
          :columns="page.columns"
          :result="result"
          :state="state"
          :total-count="totalCount"
          :truncated="truncated"
          :rows-by-uid="rowsByUid"
          :moved="moved"
          :empty-message="emptyMessage"
          @filter="table.setFilter"
          @clear-filters="table.clearFilters"
          @sort="table.setSort"
          @page="table.setPage"
          @check="team.check"
          @apply-role="team.applyRole"
          @set-status="team.setStatus"
          @retry="team.retry"
        />
      </template>
    </template>
  </section>
</template>

<style scoped>
.accounts {
  display: grid;
  gap: 1rem;
}

.accounts__intro {
  max-width: 48rem;
  margin: 0;
  color: var(--color-text-muted);
}

.accounts__checks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.accounts__sweep,
.accounts__skipped {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
