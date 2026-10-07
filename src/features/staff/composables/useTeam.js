import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { isAbortError } from '@/shared/data/RepositoryError.js'

import { isStaffFunctionsEnabled } from '../data/staffCapabilities.js'
import { fetchTeamUser, listUsers, setUserAccess } from '../data/teamRepository.js'
import { initialTeamRow, isRowBusy, reduceTeamRow } from '../domain/team.js'

/**
 * The Team tab (spec 8.7 L1009, R19, R20, R25): lists every profile, then Checks the rows one
 * after another (never the caller's own row, which the function refuses), so each row shows its
 * profile status and its sign-in state; runs a row's Apply, Disable, Enable, Check and Retry
 * through the state machine of team.js. A revision mismatch, a lost lease or a reconciled failure
 * reloads that row, and when the reload leaves no sign-in evidence (team.js drops `access` on a
 * conflict) one silent re-Check follows under the kept notice; `in-progress` re-Checks after
 * `retryAfterMs`. Memory only: an identity
 * change aborts the reads, clears the rows and the timers, and loads again for an admin. Reads
 * take the identity signal; the callable does not (a write is not cancelled by navigation, E7).
 * Loads on mount only when `isStaffFunctionsEnabled()` (Task 6, the StaffView sub-navigation's own
 * getter) is true.
 */
export function useTeam() {
  const authStore = useAuthStore()
  const enabled = isStaffFunctionsEnabled()
  const rows = shallowRef([])
  const status = ref('idle')
  const error = shallowRef(null)
  const truncated = ref(false)
  const callerUid = computed(() => authStore.user?.uid ?? null)

  let generation = 0
  let mounted = false
  const timers = new Map()

  const rowOf = (uid) => rows.value.find((row) => row.uid === uid) ?? null
  const dispatch = (uid, event) => {
    rows.value = rows.value.map((row) => (row.uid === uid ? reduceTeamRow(row, event) : row))
    return rowOf(uid)
  }
  const clearTimers = () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
  const clear = () => {
    clearTimers()
    rows.value = []
    truncated.value = false
    error.value = null
    status.value = 'idle'
  }

  const reloadRow = async (uid, run) => {
    try {
      const user = await fetchTeamUser(uid, { signal: authStore.identitySignal })
      if (run !== generation) return
      dispatch(uid, { type: 'reloaded', user })
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      dispatch(uid, { type: 'failed', error: caught })
    }
  }

  /**
   * One adminSetUserAccess call for a row and the follow-up its outcome asks for. A busy row takes
   * no second call; the re-Check of a waiting row comes from its own timer; `keepMessage` marks
   * the silent re-Check after a reload, which keeps the row's notice and is never followed by
   * another one.
   */
  const send = async (uid, request, { afterWait = false, keepMessage = false } = {}) => {
    const before = rowOf(uid)
    if (!before || before.self) return
    if (isRowBusy(before) && !(afterWait && before.state === 'waiting')) return
    const run = generation
    const timer = timers.get(uid)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(uid)
    }
    dispatch(uid, request === null ? { type: 'check', keepMessage } : { type: 'apply', request })
    let after
    try {
      const result = await setUserAccess({
        uid,
        ...request,
        expectedRevision: before.user.revision,
      })
      if (run !== generation) return
      after = dispatch(uid, { type: 'succeeded', result, keepMessage })
    } catch (caught) {
      if (run !== generation) return
      after = dispatch(uid, { type: 'failed', error: caught })
    }
    if (after?.state === 'reloading') {
      await reloadRow(uid, run)
      // The reload shows the fresh profile but no sign-in state: one re-Check with the fresh
      // revision restores the line while the notice stays.
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
    try {
      const result = await listUsers({ signal: authStore.identitySignal })
      if (run !== generation) return
      rows.value = result.users.map((user) => initialTeamRow(user, callerUid.value))
      truncated.value = result.truncated
      status.value = 'ready'
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      error.value = caught
      status.value = 'error'
      return
    }
    // One Check at a time keeps the tab inside the function's three instances (R25).
    for (const row of rows.value) {
      if (run !== generation) return
      if (!row.self) await check(row.uid)
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
    callerUid,
    load,
    check,
    applyRole,
    setStatus,
    retry,
  }
}
