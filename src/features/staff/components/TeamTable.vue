<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/shared/components/AppButton.vue'
import DataTable from '@/shared/components/DataTable.vue'
import StatusTag from '@/shared/components/StatusTag.vue'

import {
  ACCOUNT_SECTIONS,
  ROLE_LABELS,
  STATUS_LABELS,
  TEAM_MESSAGES,
  accessLine,
  isRowBusy,
  retryLabel,
  sectionOfRole,
  signInState,
} from '../domain/team.js'

/**
 * The account table of one admin page (Team or Members): DataTable over the page's profiles, with
 * the page's quick filters in view, no pinned column and an actions cell that may wrap. A row
 * shows the name with the full email under it; the profile status with the sign-in state and the
 * row's message (its status lines, mounted with the row, so only their text changes); and two
 * entries at most: Manage, and a Retry named after the failed action. The caller's own row reads
 * "That's you" and has no control.
 *
 * Manage opens a native <dialog> with the account's role, profile and sign-in state and its
 * actions: Change role to (enabled only for a different role; the line under the select says what
 * the role means and, for a role of the other page, that the account moves there once the change
 * is saved), Disable account (asks inside the dialog first; Cancel returns to Disable account),
 * Enable account and Check sign-in. The choice follows the account's confirmed role, so a change
 * made elsewhere never leaves a spent choice behind. While the account is busy every action is
 * disabled (the confirm too, with the reason in the dialog's status line), and a control disabled
 * under the focus hands it to that status line. Close or Escape returns focus to the row's Manage
 * button, or to the notice above the table when the row is no longer shown; an account that moved
 * to the other page closes its dialog.
 *
 * The notice above the table, mounted always, carries an outcome whose row is not on the page:
 * an account that moved to the other page (its new role, status and page, with a link there; it
 * stays through paging until the admin's next action), or the account the last action touched
 * when it left the filtered rows or sorted onto another page (the admin's own filter, sort or page
 * change clears that one, since a row they moved away from is no outcome to announce). It takes
 * the focus when the acted row leaves while no dialog is open.
 */
const props = defineProps({
  section: {
    type: String,
    required: true,
    validator: (value) => Object.hasOwn(ACCOUNT_SECTIONS, value),
  },
  columns: { type: Array, required: true },
  result: { type: Object, required: true },
  state: { type: Object, required: true },
  totalCount: { type: Number, required: true },
  truncated: { type: Boolean, default: false },
  rowsByUid: { type: Object, required: true },
  moved: { type: Object, default: null },
  emptyMessage: { type: String, required: true },
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
const page = computed(() => ACCOUNT_SECTIONS[props.section])
const teamRow = (user) => props.rowsByUid[user.uid] ?? null
const rowMessage = (user) => {
  const row = teamRow(user)
  return row && !row.self ? row.message : ''
}

const statusLines = new Map()
const setStatusLines = (uid, element) => {
  if (element) statusLines.set(uid, element)
  else statusLines.delete(uid)
}

/** The account the last action touched: the notice follows it out of the filtered rows. */
const lastActedUid = ref(null)
/** The moved account whose notice the admin has moved on from (by acting again). */
const dismissedMoveUid = ref(null)
const act = (uid, name, ...args) => {
  lastActedUid.value = uid
  dismissedMoveUid.value = props.moved?.uid ?? null
  emit(name, uid, ...args)
}
/** A row's Retry is gone once the row is busy: focus waits on that row's status lines. */
const actFromRow = (uid, name) => {
  act(uid, name)
  statusLines.get(uid)?.focus()
}
/** The admin's own move through the table: the last action's row is no longer theirs to follow. */
const navigate = (name, ...args) => {
  lastActedUid.value = null
  emit(name, ...args)
}

const notice = ref(null)
const manageDialog = ref(null)
const dialogStatus = ref(null)
const disableButton = ref(null)
const cancelButton = ref(null)
const manageOpen = ref(false)
const managedUid = ref(null)
const step = ref('manage')
const roleDraft = ref('')
let invoker = null

const isListed = (rows, uid) => rows.some((user) => user.uid === uid)
const hiddenRow = computed(() => {
  const uid = lastActedUid.value
  if (!uid || isListed(props.result.rows, uid)) return null
  return props.rowsByUid[uid] ?? null
})
const movedShown = computed(() =>
  props.moved && props.moved.uid !== dismissedMoveUid.value ? props.moved : null,
)
const movedPage = computed(() =>
  movedShown.value ? ACCOUNT_SECTIONS[movedShown.value.section] : null,
)
const noticeName = computed(
  () => movedShown.value?.displayName ?? hiddenRow.value?.user.displayName ?? '',
)
const noticeText = computed(() => {
  const moved = movedShown.value
  if (moved) {
    const role = ROLE_LABELS[moved.role] ?? moved.role
    const status = STATUS_LABELS[moved.status] ?? moved.status
    return ` is now ${role}, ${status} and is listed under ${movedPage.value.title}.`
  }
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
  if (row.message && row.message !== TEAM_MESSAGES.saved) parts.push(row.message)
  return `${parts.join('. ')}.`
})
// The acted row left with the focus on its status lines: the notice takes it. With a dialog
// open the focus is in the dialog, and the dialog's close hands it over instead.
watch(
  hiddenRow,
  (row, previous) => {
    if (row && !previous && !manageOpen.value) notice.value?.focus()
  },
  { flush: 'post' },
)
watch(
  () => movedShown.value?.uid,
  (uid) => {
    if (uid && uid === lastActedUid.value && !manageOpen.value) notice.value?.focus()
  },
  { flush: 'post' },
)

const managedRow = computed(() =>
  managedUid.value === null ? null : (props.rowsByUid[managedUid.value] ?? null),
)
const managedUser = computed(() => managedRow.value?.user ?? null)
const managedBusy = computed(() => isRowBusy(managedRow.value))
const dialogMessage = computed(() =>
  step.value === 'confirm' && managedBusy.value
    ? TEAM_MESSAGES.checkingWait
    : (managedRow.value?.message ?? ''),
)
const roleHint = computed(() => {
  const user = managedUser.value
  const target = roleDraft.value
  if (!user || target === user.role) return ''
  if (sectionOfRole(target) !== props.section) {
    if (target === 'member') {
      return "Member removes this account's access to the staff workspace. It moves to Members once the change is saved."
    }
    return target === 'admin'
      ? 'Admin gives this account access to the staff workspace and to account management. It moves to Team once the change is saved.'
      : 'Staff gives this account access to the staff workspace. It moves to Team once the change is saved.'
  }
  return target === 'admin'
    ? 'Admin can also manage accounts and roles.'
    : 'Staff cannot manage accounts or roles.'
})

// The choice follows the account's confirmed role: a change made elsewhere (another admin, a
// reload after a conflict) replaces a choice that no longer means anything.
watch(
  () => managedUser.value?.role,
  (role) => {
    if (role) roleDraft.value = role
  },
)
// An account that left the list (it moved to the other page) closes its dialog.
watch(managedRow, (row) => {
  if (row === null && manageOpen.value) closeManage()
})
// A control disabled under the focus would leave it on <body>: the status line takes it.
watch(
  managedBusy,
  (busyNow) => {
    if (!busyNow || !manageOpen.value) return
    const active = document.activeElement
    if (active === null || active === document.body || active.disabled === true) {
      dialogStatus.value?.focus()
    }
  },
  { flush: 'post' },
)

const openManage = (user, event) => {
  invoker = event.currentTarget
  managedUid.value = user.uid
  roleDraft.value = user.role
  step.value = 'manage'
  manageOpen.value = true
  void nextTick(() => manageDialog.value?.showModal())
}
function closeManage() {
  if (manageDialog.value?.open) manageDialog.value.close()
}
const onManageClose = () => {
  manageOpen.value = false
  managedUid.value = null
  step.value = 'manage'
  const target = invoker?.isConnected ? invoker : notice.value
  invoker = null
  target?.focus()
}
const changeRole = () => act(managedUid.value, 'apply-role', roleDraft.value)
const enableAccount = () => act(managedUid.value, 'set-status', 'active')
const checkAccount = () => act(managedUid.value, 'check')
const askDisable = () => {
  step.value = 'confirm'
  void nextTick(() => cancelButton.value?.$el?.focus())
}
const cancelDisable = () => {
  step.value = 'manage'
  void nextTick(() => disableButton.value?.$el?.focus())
}
const confirmDisable = () => {
  // useTeam takes no action on a busy row: the confirm stays disabled and the status line says why.
  if (managedUser.value === null || managedBusy.value) return
  act(managedUid.value, 'set-status', 'disabled')
  step.value = 'manage'
  void nextTick(() => dialogStatus.value?.focus())
}
</script>

<template>
  <div class="team-table">
    <div
      ref="notice"
      class="team-table__notice"
      :class="{ 'team-table__notice--filled': noticeName }"
      tabindex="-1"
    >
      <p role="status">
        <span dir="auto">{{ noticeName }}</span
        >{{ noticeText }}
      </p>
      <p v-if="movedPage" class="team-table__notice-link">
        <RouterLink :to="movedPage.path">Open {{ movedPage.title }}</RouterLink>
      </p>
    </div>
    <DataTable
      :columns="columns"
      :result="result"
      :state="state"
      :total-count="totalCount"
      :truncated="truncated"
      :row-key="(user) => user.uid"
      :caption="page.caption"
      :empty-message="emptyMessage"
      :pin-first-column="false"
      wrap-actions
      @filter="(key, value) => navigate('filter', key, value)"
      @clear-filters="navigate('clear-filters')"
      @sort="(key, direction) => navigate('sort', key, direction)"
      @page="(target) => navigate('page', target)"
    >
      <template #cell-name="{ row: user }">
        <span class="team-table__name" dir="auto">{{ user.displayName }}</span>
        <span class="team-table__email" dir="auto">{{ user.email }}</span>
      </template>
      <template #cell-status="{ row: user, text }">
        <div
          :ref="(element) => setStatusLines(user.uid, element)"
          class="team-table__status"
          tabindex="-1"
        >
          <p class="team-table__profile">
            Profile:
            <StatusTag :tone="user.status === 'active' ? 'success' : 'danger'">{{
              text
            }}</StatusTag>
          </p>
          <p class="team-table__signin">Sign-in: {{ signInState(teamRow(user)) }}</p>
          <p class="team-table__message" role="status">{{ rowMessage(user) }}</p>
        </div>
      </template>
      <template #actions="{ row: user }">
        <p v-if="teamRow(user)?.self" class="team-table__self">{{ TEAM_MESSAGES.self }}</p>
        <div v-else class="team-table__actions">
          <AppButton variant="secondary" aria-haspopup="dialog" @click="openManage(user, $event)">
            Manage <span class="visually-hidden">{{ user.displayName }}</span>
          </AppButton>
          <AppButton
            v-if="teamRow(user)?.state === 'failed'"
            variant="text"
            @click="actFromRow(user.uid, 'retry')"
          >
            {{ retryLabel(teamRow(user))
            }}<span class="visually-hidden"> for {{ user.displayName }}</span>
          </AppButton>
        </div>
      </template>
    </DataTable>

    <dialog
      ref="manageDialog"
      class="team-dialog"
      aria-labelledby="team-manage-title"
      @close="onManageClose"
    >
      <template v-if="managedUser">
        <h3 id="team-manage-title">
          {{ step === 'confirm' ? 'Disable' : 'Manage' }}
          <span dir="auto">{{ managedUser.displayName }}</span
          >{{ step === 'confirm' ? '?' : '' }}
        </h3>
        <p class="team-dialog__email" dir="auto">{{ managedUser.email }}</p>
        <dl class="team-dialog__facts">
          <div>
            <dt>Role</dt>
            <dd>{{ ROLE_LABELS[managedUser.role] ?? managedUser.role }}</dd>
          </div>
          <div>
            <dt>Profile</dt>
            <dd>{{ STATUS_LABELS[managedUser.status] ?? managedUser.status }}</dd>
          </div>
          <div>
            <dt>Sign-in</dt>
            <dd>{{ signInState(managedRow) }}</dd>
          </div>
        </dl>
        <div v-if="step === 'manage'" class="team-dialog__body">
          <div class="team-dialog__field">
            <label for="team-manage-role">Change role to</label>
            <select
              id="team-manage-role"
              v-model="roleDraft"
              class="form-control"
              :disabled="managedBusy"
              aria-describedby="team-manage-role-hint"
            >
              <option v-for="[value, label] in ROLE_OPTIONS" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
            <p id="team-manage-role-hint" class="team-dialog__hint">{{ roleHint }}</p>
          </div>
          <div class="team-dialog__actions">
            <AppButton
              variant="primary"
              :disabled="managedBusy || roleDraft === managedUser.role"
              @click="changeRole"
              >Change role</AppButton
            >
            <AppButton
              v-if="managedUser.status === 'active'"
              ref="disableButton"
              variant="secondary"
              :disabled="managedBusy"
              @click="askDisable"
              >Disable account</AppButton
            >
            <AppButton v-else variant="secondary" :disabled="managedBusy" @click="enableAccount"
              >Enable account</AppButton
            >
            <AppButton variant="text" :disabled="managedBusy" @click="checkAccount"
              >Check sign-in</AppButton
            >
          </div>
        </div>
        <div v-else class="team-dialog__body">
          <p>
            They are signed out within the hour and cannot sign in again until an admin enables the
            account.
          </p>
          <div class="team-dialog__actions">
            <AppButton variant="primary" :disabled="managedBusy" @click="confirmDisable"
              >Disable account</AppButton
            >
            <AppButton ref="cancelButton" variant="secondary" @click="cancelDisable"
              >Cancel</AppButton
            >
          </div>
        </div>
        <div
          ref="dialogStatus"
          class="team-dialog__status"
          :class="{ 'team-dialog__status--filled': dialogMessage }"
          tabindex="-1"
        >
          <p role="status">{{ dialogMessage }}</p>
        </div>
        <div class="team-dialog__close">
          <AppButton variant="text" @click="closeManage">Close</AppButton>
        </div>
      </template>
    </dialog>
  </div>
</template>

<style scoped>
.team-table__notice p,
.team-dialog__status p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.team-table__notice--filled {
  margin-bottom: 0.75rem;
}

.team-table__notice .team-table__notice-link {
  margin-top: 0.25rem;
}

/* The link to the other page stands on its own line, so it keeps a 44 px target. */
.team-table__notice-link a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
}

.team-table__name,
.team-table__email {
  display: block;
  overflow-wrap: anywhere;
}

.team-table__email {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 400;
}

.team-table__status p {
  margin: 0;
  font-size: 0.9375rem;
}

.team-table__signin {
  color: var(--color-text-muted);
}

.team-table__message {
  overflow-wrap: anywhere;
}

.team-table__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.team-table__self {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.team-dialog {
  width: min(36rem, calc(100vw - 2rem));
  max-width: min(36rem, calc(100vw - 2rem));
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
  margin: 0 0 0.25rem;
  color: var(--color-heading);
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}

.team-dialog__email {
  margin: 0 0 1rem;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.team-dialog__facts {
  display: grid;
  gap: 0.5rem;
  margin: 0 0 1.25rem;
}

.team-dialog__facts > div {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: 0.75rem;
}

.team-dialog__facts dt {
  color: var(--color-text-muted);
}

.team-dialog__facts dd {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.team-dialog__body {
  display: grid;
  gap: 1rem;
}

.team-dialog__body p {
  margin: 0;
}

.team-dialog__field {
  display: grid;
  gap: 0.5rem;
}

.team-dialog__field label {
  color: var(--color-heading);
  font-weight: 600;
}

.team-dialog__hint {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.team-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.team-dialog__status--filled {
  margin-top: 1rem;
}

.team-dialog__close {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}
</style>
