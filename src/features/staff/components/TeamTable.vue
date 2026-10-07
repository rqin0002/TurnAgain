<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import DataTable from '@/shared/components/DataTable.vue'

import { ROLE_LABELS, STATUS_LABELS, TEAM_MESSAGES, accessLine, isRowBusy } from '../domain/team.js'

/**
 * The Team table (spec 8.7 L1009): DataTable over the profiles, with each row's actions from its
 * TeamRow (team.js). The caller's own row reads "That's you" and has no control. Disable asks
 * first in a native <dialog>; Cancel returns focus to the Disable button that opened it; the
 * confirm follows the pending row's busy state (the automatic Check may reach that row while the
 * dialog is open, and useTeam drops an action on a busy row), so a busy row keeps the dialog open
 * with its status line saying why. Each row's status lines are mounted with the row and only their
 * text changes (M6-D22). A row action disables its own control while the row is busy (and Disable
 * and Enable swap), so the action moves focus to that row's status lines (tabindex -1), never
 * leaving it on <body>. When the outcome takes the acted row off the rendered page, out of the
 * filtered rows (a Disable under status=active, a role change under a role filter) or onto another
 * page (a Disable or role change under a status or role sort), the row leaves with its status lines
 * and the focus: the notice above the table, mounted always, then carries the outcome, says which
 * of the two happened and takes the focus; the admin's own filter, sort or page change clears it
 * (a row they moved away from themselves is no outcome to announce).
 */
const props = defineProps({
  columns: { type: Array, required: true },
  result: { type: Object, required: true },
  state: { type: Object, required: true },
  totalCount: { type: Number, required: true },
  truncated: { type: Boolean, default: false },
  rowsByUid: { type: Object, required: true },
})

const emit = defineEmits([
  'filter',
  'clear-filters',
  'sort',
  'page',
  'check',
  'apply-role',
  'set-status',
  'retry',
])

const ROLE_OPTIONS = Object.freeze(Object.entries(ROLE_LABELS))

const roleDrafts = reactive({})
const roleDraft = (user) => roleDrafts[user.uid] ?? user.role
const teamRow = (user) => props.rowsByUid[user.uid] ?? null
const busy = (user) => isRowBusy(teamRow(user))

const statusLines = new Map()
const setStatusLines = (uid, element) => {
  if (element) statusLines.set(uid, element)
  else statusLines.delete(uid)
}
/** The row the last action touched: the notice follows it out of the filtered rows. */
const lastActedUid = ref(null)
/** Emits a row action, then keeps focus on that row's status lines (M6-D22). */
const act = (uid, name, ...args) => {
  lastActedUid.value = uid
  emit(name, uid, ...args)
  statusLines.get(uid)?.focus()
}
/** The admin's own move through the table: the last action's row is no longer theirs to follow. */
const navigate = (name, ...args) => {
  lastActedUid.value = null
  emit(name, ...args)
}

const notice = ref(null)
const isListed = (rows, uid) => rows.some((user) => user.uid === uid)
const hiddenRow = computed(() => {
  const uid = lastActedUid.value
  if (!uid || isListed(props.result.rows, uid)) return null
  return props.rowsByUid[uid] ?? null
})
const hiddenName = computed(() => hiddenRow.value?.user.displayName ?? '')
const hiddenText = computed(() => {
  const row = hiddenRow.value
  if (!row) return ''
  const { role, status } = row.user
  const where = isListed(props.result.allRows, row.user.uid)
    ? TEAM_MESSAGES.otherPage
    : TEAM_MESSAGES.outsideFilters
  const parts = [
    ` is now ${ROLE_LABELS[role] ?? role}, ${STATUS_LABELS[status] ?? status} and ${where}`,
  ]
  if (row.access) parts.push(accessLine(row.access))
  if (row.message) parts.push(row.message)
  return `${parts.join('. ')}.`
})
watch(
  hiddenRow,
  (row, previous) => {
    // The acted row left with the focus on its status lines: the notice takes it (M6-D22).
    if (row && !previous) notice.value?.focus()
  },
  { flush: 'post' },
)

const dialog = ref(null)
const dialogStatus = ref(null)
const pending = ref(null)
let invoker = null
let confirmedUid = null
const pendingName = computed(() => pending.value?.displayName ?? '')
const pendingBusy = computed(() => (pending.value ? busy(pending.value) : false))
watch(pendingBusy, (busyNow) => {
  // The confirm turns disabled under the focus: the dialog's status line takes it (M6-D22).
  if (busyNow && dialog.value?.open) dialogStatus.value?.focus()
})

const askDisable = (user, event) => {
  invoker = event.currentTarget
  pending.value = user
  void nextTick(() => dialog.value?.showModal())
}
const closeDialog = () => {
  if (dialog.value?.open) dialog.value.close()
}
const onDialogClose = () => {
  pending.value = null
  const target = confirmedUid === null ? invoker : statusLines.get(confirmedUid)
  invoker = null
  confirmedUid = null
  target?.focus()
}
const confirmDisable = () => {
  const user = pending.value
  // useTeam takes no action on a busy row: the dialog stays open and says so, nothing is sent.
  if (user && busy(user)) return
  if (user) {
    confirmedUid = user.uid
    lastActedUid.value = user.uid
    emit('set-status', user.uid, 'disabled')
  }
  closeDialog()
}
</script>

<template>
  <div class="team-table">
    <div
      ref="notice"
      class="team-table__notice"
      :class="{ 'team-table__notice--filled': hiddenRow }"
      tabindex="-1"
    >
      <p role="status">
        <span dir="auto">{{ hiddenName }}</span
        >{{ hiddenText }}
      </p>
    </div>
    <DataTable
      :columns="columns"
      :result="result"
      :state="state"
      :total-count="totalCount"
      :truncated="truncated"
      :row-key="(user) => user.uid"
      caption="Accounts and their access"
      empty-message="No accounts match these filters."
      @filter="(key, value) => navigate('filter', key, value)"
      @clear-filters="navigate('clear-filters')"
      @sort="(key, direction) => navigate('sort', key, direction)"
      @page="(page) => navigate('page', page)"
    >
      <template #cell-name="{ text }"
        ><span dir="auto">{{ text }}</span></template
      >
      <template #cell-email="{ text }"
        ><span dir="auto">{{ text }}</span></template
      >
      <template #actions="{ row: user }">
        <p v-if="teamRow(user)?.self" class="team-table__self">{{ TEAM_MESSAGES.self }}</p>
        <div v-else class="team-table__actions" :aria-busy="busy(user) ? 'true' : undefined">
          <div class="team-table__role">
            <label class="visually-hidden" :for="`team-role-${user.uid}`"
              >Role for {{ user.displayName }}</label
            >
            <select
              :id="`team-role-${user.uid}`"
              :value="roleDraft(user)"
              :disabled="busy(user)"
              @change="roleDrafts[user.uid] = $event.target.value"
            >
              <option v-for="[value, label] in ROLE_OPTIONS" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
            <AppButton
              variant="secondary"
              :disabled="busy(user) || roleDraft(user) === user.role"
              @click="act(user.uid, 'apply-role', roleDraft(user))"
            >
              Apply<span class="visually-hidden"> the role for {{ user.displayName }}</span>
            </AppButton>
          </div>
          <AppButton
            v-if="user.status === 'active'"
            variant="secondary"
            :disabled="busy(user)"
            @click="askDisable(user, $event)"
          >
            Disable <span class="visually-hidden">{{ user.displayName }}</span>
          </AppButton>
          <AppButton
            v-else
            variant="secondary"
            :disabled="busy(user)"
            @click="act(user.uid, 'set-status', 'active')"
          >
            Enable <span class="visually-hidden">{{ user.displayName }}</span>
          </AppButton>
          <AppButton variant="text" :disabled="busy(user)" @click="act(user.uid, 'check')">
            Check <span class="visually-hidden">{{ user.displayName }}</span>
          </AppButton>
          <AppButton
            v-if="teamRow(user)?.state === 'failed'"
            variant="text"
            @click="act(user.uid, 'retry')"
          >
            Retry<span class="visually-hidden"> for {{ user.displayName }}</span>
          </AppButton>
          <div
            :ref="(element) => setStatusLines(user.uid, element)"
            class="team-table__status"
            tabindex="-1"
          >
            <p v-if="teamRow(user)?.access" class="team-table__access">
              {{ accessLine(teamRow(user).access) }}
            </p>
            <p class="team-table__message" role="status">{{ teamRow(user)?.message ?? '' }}</p>
          </div>
        </div>
      </template>
    </DataTable>

    <dialog
      ref="dialog"
      class="team-dialog"
      aria-labelledby="team-dialog-title"
      @close="onDialogClose"
    >
      <h3 id="team-dialog-title">
        Disable <span dir="auto">{{ pendingName }}</span
        >?
      </h3>
      <p>
        They are signed out within the hour and cannot sign in again until an admin enables the
        account.
      </p>
      <div
        ref="dialogStatus"
        class="team-dialog__status"
        :class="{ 'team-dialog__status--filled': pendingBusy }"
        tabindex="-1"
      >
        <p role="status">{{ pendingBusy ? TEAM_MESSAGES.checkingWait : '' }}</p>
      </div>
      <div class="team-dialog__actions">
        <AppButton variant="primary" :disabled="pendingBusy" @click="confirmDisable"
          >Disable account</AppButton
        >
        <AppButton variant="secondary" @click="closeDialog">Cancel</AppButton>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.team-table__actions,
.team-table__role {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.team-table__role select {
  min-height: 2.5rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-small);
  background: var(--color-surface);
  padding: 0.35rem 0.6rem;
  color: var(--color-text);
}

.team-table__status {
  flex-basis: 100%;
}

.team-table__notice p,
.team-dialog__status p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.team-table__notice--filled {
  margin-bottom: 0.75rem;
}

.team-dialog__status--filled {
  margin-top: 0.75rem;
}

.team-table__self,
.team-table__access,
.team-table__message {
  margin: 0;
  font-size: 0.9375rem;
}

.team-table__self {
  flex-basis: 100%;
}

.team-table__access,
.team-table__self {
  color: var(--color-text-muted);
}

.team-dialog {
  max-width: min(32rem, calc(100vw - 2rem));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: 1.5rem;
  color: var(--color-text);
}

.team-dialog::backdrop {
  background: color-mix(in srgb, var(--color-heading) 40%, transparent);
}

.team-dialog h3 {
  margin: 0 0 0.75rem;
  color: var(--color-heading);
  font-size: 1.25rem;
}

.team-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.25rem;
}
</style>
