import { computed, effectScope, ref, shallowRef, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { isAbortError } from '@/shared/data/RepositoryError.js'

import {
  fetchStaffActivities,
  fetchStaffServices,
  fetchStaffSessions,
  listCorrections,
  listEmailLogs,
} from '../data/staffRepository.js'

/**
 * The staff catalogue (spec 8.1 L979): module-level state shared by every staff page, not a
 * second Pinia store. It is keyed by the auth store's identity epoch (spec 9.3): a load records
 * the epoch it started under, reads with `authStore.identitySignal` and drops its result when the
 * epoch moved; an epoch change (sign-out, another uid, a role or profile revision change) empties
 * the lists synchronously, so a downgraded account never repopulates staff data from a late
 * response (E1, E2). Writes never come through here and never take the identity signal (E7).
 * Nothing reaches localStorage (spec 11): offline, a page keeps what this session loaded.
 */

const STAFF_ROLES = Object.freeze(['staff', 'admin'])
const LOCAL_KINDS = Object.freeze(['services', 'activities', 'sessions', 'corrections'])
const noneTruncated = () => ({
  services: false,
  activities: false,
  sessions: false,
  corrections: false,
  emailLogs: false,
})

const services = shallowRef([])
const activities = shallowRef([])
const sessions = shallowRef([])
const corrections = shallowRef([])
const emailLogs = shallowRef([])
const lists = { services, activities, sessions, corrections, emailLogs }
const status = ref('idle')
const error = shallowRef(null)
const truncated = shallowRef(noneTruncated())
const skippedCount = ref(0)
const activitiesById = computed(
  () => new Map(activities.value.map((activity) => [activity.id, activity])),
)
const errorMessage = computed(() => error.value?.message ?? '')

let authStore = null
let scope = null
let generation = 0
let controller = null
let inFlight = null
let loadedEpoch = null

/** One signal that aborts when either source does (AbortSignal.any is not in every engine). */
const eitherSignal = (first, second) => {
  const combined = new AbortController()
  const abort = () => combined.abort()
  const sources = []
  for (const signal of [first, second]) {
    if (!signal) continue
    if (signal.aborted) {
      combined.abort()
      break
    }
    signal.addEventListener('abort', abort, { once: true })
    sources.push(signal)
  }
  const release = () => {
    for (const signal of sources) signal.removeEventListener('abort', abort)
  }
  return { signal: combined.signal, release }
}

/** Empties every list and aborts the load in flight; the next load() reads again. */
export function clearStaffCatalogue() {
  generation += 1
  controller?.abort()
  controller = null
  inFlight = null
  loadedEpoch = null
  for (const list of Object.values(lists)) list.value = []
  truncated.value = noneTruncated()
  skippedCount.value = 0
  error.value = null
  status.value = 'idle'
}

// One synchronous epoch watch per store instance, in a detached scope so it outlives the
// component that first asked for the catalogue (the store is a singleton in the app).
const watchIdentity = (store) => {
  if (store === authStore) return
  scope?.stop()
  authStore = store
  scope = effectScope(true)
  scope.run(() => {
    watch(
      () => store.identityEpoch,
      () => clearStaffCatalogue(),
      { flush: 'sync' },
    )
  })
}

const read = () => {
  const store = authStore
  const epoch = store.identityEpoch
  const run = ++generation
  controller?.abort()
  controller = new AbortController()
  const { signal, release } = eitherSignal(store.identitySignal, controller.signal)
  loadedEpoch = epoch
  if (status.value !== 'ready') status.value = 'loading'
  const current = (async () => {
    try {
      const [serviceRead, activityRead, sessionRead, correctionRead, logRead] = await Promise.all([
        fetchStaffServices({ signal }),
        fetchStaffActivities({ signal }),
        fetchStaffSessions({ signal }),
        listCorrections({ signal }),
        listEmailLogs({ signal }),
      ])
      if (run !== generation || store.identityEpoch !== epoch) return
      services.value = serviceRead.services
      activities.value = activityRead.activities
      sessions.value = sessionRead.sessions
      corrections.value = correctionRead.corrections
      emailLogs.value = logRead.emailLogs
      truncated.value = {
        services: serviceRead.truncated,
        activities: activityRead.truncated,
        sessions: sessionRead.truncated,
        corrections: correctionRead.truncated,
        emailLogs: logRead.truncated,
      }
      skippedCount.value = [serviceRead, activityRead, sessionRead, correctionRead, logRead].reduce(
        (sum, part) => sum + part.skippedCount,
        0,
      )
      error.value = null
      status.value = 'ready'
    } catch (caught) {
      if (isAbortError(caught) || run !== generation || store.identityEpoch !== epoch) return
      // A failed reload keeps what this session loaded (offline, spec 11); a failed first load
      // is the error state.
      error.value = caught
      if (status.value !== 'ready') status.value = 'error'
    } finally {
      release()
      if (run === generation) inFlight = null
    }
  })()
  inFlight = current
  return current
}

const mayRead = () => authStore !== null && authStore.canAccess(STAFF_ROLES)

/** Reads once per identity epoch; a no-op while that read runs or after it succeeded. */
function load() {
  if (!mayRead()) return Promise.resolve()
  if (loadedEpoch === authStore.identityEpoch && (inFlight || status.value === 'ready')) {
    return inFlight ?? Promise.resolve()
  }
  return read()
}

/** Always reads (after a save, or Try again). */
function reload() {
  return mayRead() ? read() : Promise.resolve()
}

/** Replaces the record with the same id, or prepends it (optimistic table update). */
function applyLocal(kind, record) {
  if (!LOCAL_KINDS.includes(kind) || typeof record?.id !== 'string') return
  const list = lists[kind]
  const index = list.value.findIndex((entry) => entry.id === record.id)
  list.value =
    index === -1
      ? [record, ...list.value]
      : list.value.map((entry, position) => (position === index ? record : entry))
}

export function useStaffCatalogue() {
  watchIdentity(useAuthStore())
  return {
    services,
    activities,
    sessions,
    corrections,
    emailLogs,
    activitiesById,
    status,
    error,
    errorMessage,
    truncated,
    skippedCount,
    load,
    reload,
    applyLocal,
  }
}
