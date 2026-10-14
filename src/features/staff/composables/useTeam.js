import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { isAbortError } from '@/shared/data/RepositoryError.js'

import { isStaffFunctionsEnabled } from '../data/staffCapabilities.js'
import { fetchTeamUser, listUsers, setUserAccess } from '../data/teamRepository.js'
import {
  ACCOUNT_SECTIONS,
  initialTeamRow,
  isEnvironmentFailure,
  isRowBusy,
  reduceTeamRow,
  sectionOfRole,
  sweepStoppedText,
} from '../domain/team.js'

/**
 * One admin account page, Team (staff and admin accounts) or Members (member accounts): lists the
 * page's profiles with one scoped read, runs a row's role change, Disable, Enable, Check and Retry
 * through the state machine of team.js, and checks sign-in states one account at a time, never
 * the caller's own (the function refuses it).
 *
 * Team checks every account when it loads. Members checks nothing by itself: a member list may
 * hold up to 1,000 accounts and every Check is a callable call that takes the account's lease, so
 * `checkMany(uids)` checks the accounts the page asks for. One run at a time; a run stops at the
 * first failure every account would share (the service missing or unreachable, the connection
 * down, the caller's access lost, development mode) and says so once in `sweepNotice` rather than
 * failing row after row. A check is never repeated by filtering or paging.
 *
 * An account whose confirmed role (a change's answer, a Check, or a reload) belongs to the other
 * page leaves `rows`, and `moved` names it (uid, name, role, status and the page it now belongs
 * to) so the page can say where it went; nothing leaves on a request alone. A revision mismatch,
 * a lost lease or a reconciled failure reloads that row, and when the reload leaves no sign-in
 * evidence (team.js drops `access` on a conflict) one silent re-Check follows under the kept
 * notice; `in-progress` re-Checks after `retryAfterMs`.
 *
 * Memory only: an identity change aborts the reads, clears the rows, the counts and the timers,
 * and loads again for an admin. Reads take the identity signal; the callable does not (a write is
 * not cancelled by navigation). Loads on mount only when `isStaffFunctionsEnabled()` (the
 * StaffView sub-navigation's own getter) is true.
 *
 * @param {{ section: 'team' | 'members' }} options
 */
export function useTeam({ section }) {
  if (!Object.hasOwn(ACCOUNT_SECTIONS, section)) {
    throw new RangeError(`useTeam: unknown account page "${section}".`)
  }
  const page = ACCOUNT_SECTIONS[section]
  const authStore = useAuthStore()
  const enabled = isStaffFunctionsEnabled()
  const rows = shallowRef([])
  const status = ref('idle')
  const error = shallowRef(null)
  const truncated = ref(false)
  const skippedCount = ref(0)
  const moved = shallowRef(null)
  const sweeping = ref(false)
  const sweepNotice = ref('')
  const callerUid = computed(() => authStore.user?.uid ?? null)

  let generation = 0
  let mounted = false
  const timers = new Map()

  const rowOf = (uid) => rows.value.find((row) => row.uid === uid) ?? null
  const dispatch = (uid, event) => {
    rows.value = rows.value.map((row) => (row.uid === uid ? reduceTeamRow(row, event) : row))
    return rowOf(uid)
  }
  const clearTimer = (uid) => {
    const timer = timers.get(uid)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(uid)
    }
  }
  const clearTimers = () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
  const clear = () => {
    clearTimers()
    rows.value = []
    truncated.value = false
    skippedCount.value = 0
    moved.value = null
    sweeping.value = false
    sweepNotice.value = ''
    error.value = null
    status.value = 'idle'
  }

  /** Takes a row out of the list when its confirmed role belongs to the other page. */
  const leaveIfMoved = (uid) => {
    const row = rowOf(uid)
    if (!row || page.roles.includes(row.user.role)) return false
    clearTimer(uid)
    rows.value = rows.value.filter((candidate) => candidate.uid !== uid)
    moved.value = Object.freeze({
      uid,
      displayName: row.user.displayName,
      role: row.user.role,
      status: row.user.status,
      section: sectionOfRole(row.user.role),
    })
    return true
  }

  const reloadRow = async (uid, run) => {
    try {
      const user = await fetchTeamUser(uid, { signal: authStore.identitySignal })
      if (run !== generation) return
      dispatch(uid, { type: 'reloaded', user })
      leaveIfMoved(uid)
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      dispatch(uid, { type: 'failed', error: caught })
    }
  }

  /**
   * One adminSetUserAccess call for a row and the follow-up its outcome asks for. A busy row takes
   * no second call; the re-Check of a waiting row comes from its own timer; `keepMessage` marks
   * the silent re-Check after a reload, which keeps the row's notice and is never followed by
   * another one. Resolves to the error of the call when it failed, else null.
   */
  const send = async (uid, request, { afterWait = false, keepMessage = false } = {}) => {
    const before = rowOf(uid)
    if (!before || before.self) return null
    if (isRowBusy(before) && !(afterWait && before.state === 'waiting')) return null
    const run = generation
    clearTimer(uid)
    dispatch(uid, request === null ? { type: 'check', keepMessage } : { type: 'apply', request })
    let after
    let failure = null
    try {
      const result = await setUserAccess({
        uid,
        ...request,
        expectedRevision: before.user.revision,
      })
      if (run !== generation) return null
      dispatch(uid, { type: 'succeeded', result, keepMessage })
      if (leaveIfMoved(uid)) return null
      after = rowOf(uid)
    } catch (caught) {
      if (run !== generation) return null
      failure = caught
      after = dispatch(uid, { type: 'failed', error: caught })
    }
    if (after?.state === 'reloading') {
      await reloadRow(uid, run)
      // The reload shows the fresh profile but no sign-in state: one re-Check with the fresh
      // revision restores the line while the notice stays (unless the account has left).
      const reloaded = run === generation ? rowOf(uid) : null
      if (!keepMessage && reloaded?.state === 'idle' && reloaded.access === null) {
        await send(uid, null, { keepMessage: true })
      }
    } else if (after?.state === 'waiting') {
      timers.set(
        uid,
        setTimeout(() => {
          timers.delete(uid)
          if (run === generation) void send(uid, null, { afterWait: true })
        }, after.retryAfterMs),
      )
    }
    return failure
  }

  const check = (uid) => send(uid, null)
  const applyRole = (uid, role) => send(uid, { role })
  const setStatus = (uid, nextStatus) => send(uid, { status: nextStatus })
  /** Retry repeats the row's last request (a Check when it was one), with the current revision. */
  const retry = (uid) => {
    const row = rowOf(uid)
    const last = row?.lastRequest ?? {}
    return send(uid, last.role || last.status ? { ...last } : null)
  }

  /**
   * Checks the given accounts one at a time (one Check at a time keeps the tab inside the
   * function's three instances), skipping the caller's own row, rows that have left and busy rows.
   * Stops at the first failure every account would share and says so in `sweepNotice`. A second
   * run while one is going is ignored.
   */
  const checkMany = async (uids) => {
    if (sweeping.value) return
    const run = generation
    sweeping.value = true
    sweepNotice.value = ''
    try {
      for (const uid of uids) {
        if (run !== generation) return
        const failure = await send(uid, null)
        if (run !== generation) return
        if (failure && isEnvironmentFailure(failure)) {
          sweepNotice.value = sweepStoppedText(rowOf(uid)?.message ?? '')
          return
        }
      }
    } finally {
      if (run === generation) sweeping.value = false
    }
  }

  const load = async () => {
    if (!enabled) return
    const run = ++generation
    clearTimers()
    if (!authStore.canAccess(['admin'])) {
      clear()
      return
    }
    error.value = null
    status.value = 'loading'
    moved.value = null
    sweeping.value = false
    sweepNotice.value = ''
    try {
      const result = await listUsers({ roles: page.roles, signal: authStore.identitySignal })
      if (run !== generation) return
      rows.value = result.users.map((user) => initialTeamRow(user, callerUid.value))
      truncated.value = result.truncated
      skippedCount.value = result.skippedCount
      status.value = 'ready'
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      error.value = caught
      status.value = 'error'
      return
    }
    if (page.checksOnLoad) {
      await checkMany(rows.value.filter((row) => !row.self).map((row) => row.uid))
    }
  }

  watch(
    () => authStore.identityEpoch,
    () => {
      generation += 1
      clear()
      if (mounted) void load()
    },
  )
  onMounted(() => {
    mounted = true
    void load()
  })
  onBeforeUnmount(() => {
    mounted = false
    generation += 1
    clearTimers()
  })

  return {
    enabled,
    rows,
    status,
    error,
    truncated,
    skippedCount,
    moved,
    sweeping,
    sweepNotice,
    callerUid,
    load,
    check,
    checkMany,
    applyRole,
    setStatus,
    retry,
  }
}
