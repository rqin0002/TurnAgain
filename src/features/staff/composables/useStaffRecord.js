import { computed, toValue } from 'vue'

import { deriveSessionStatus } from '@/features/activities/domain/sessionSchema.js'
import { useAuthStore } from '@/features/auth/stores/authStore.js'

import {
  fetchStaffRecord,
  saveActivity,
  saveService,
  saveSession,
} from '../data/staffRepository.js'

import { useStaffCatalogue } from './useStaffCatalogue.js'

/**
 * The record a staff form edits, for StaffRecordView, which as a view imports no
 * data module: the record from the staff catalogue, its loading state, the kind's save
 * followed by a catalogue reload, and the latest stored record for the conflict Reload.
 * A create has no record and is ready at once. `kind` and `recordId` may be getters.
 * A save puts the saved record into the catalogue before the reload, so the page that follows (a
 * create's edit page, a register) shows it even when that reload fails; the next successful read
 * replaces the copy with the stored record.
 */

/**
 * The record as the next read will return it, from the validated values and the write's answer.
 * `createdAt` and `updatedAt` are the client's clock standing in for the server's stamps. A new
 * session gets what its create writes besides the content: counters (0 for a TurnAgain session,
 * null otherwise), status `scheduled` and the notice field as null. An edited record keeps the
 * fields the form does not carry (`noticeFieldStored`, the counters) from the catalogue's copy,
 * and an edited session re-derives its status from the counters and the new capacity, as the
 * write does.
 */
const asSavedRecord = (kind, values, saved, { isNew, existing }) => {
  const now = new Date().toISOString()
  const record = {
    ...existing,
    ...values,
    id: saved.id,
    revision: saved.revision,
    createdAt: isNew || !values.createdAt ? now : values.createdAt,
    updatedAt: now,
  }
  if (kind !== 'sessions') return record
  if (isNew) {
    const counter = values.registrationType === 'turnagain' ? 0 : null
    return {
      ...record,
      bookedCount: counter,
      waitlistCount: counter,
      status: 'scheduled',
      cancellationNoticeAt: null,
      noticeFieldStored: true,
    }
  }
  return { ...record, status: deriveSessionStatus(record) }
}

export function useStaffRecord(kind, recordId) {
  const authStore = useAuthStore()
  const catalogue = useStaffCatalogue()
  const lists = {
    services: catalogue.services,
    activities: catalogue.activities,
    sessions: catalogue.sessions,
  }

  const record = computed(() => {
    const id = toValue(recordId)
    return id ? (lists[toValue(kind)]?.value.find((entry) => entry.id === id) ?? null) : null
  })
  const state = computed(() => {
    if (!toValue(recordId) || record.value) return 'ready'
    if (catalogue.status.value === 'ready') return 'not-found'
    return catalogue.status.value === 'error' ? 'error' : 'loading'
  })

  async function save(values, { isNew = false, correctionId = null } = {}) {
    const current = toValue(kind)
    // Read before the write: the local copy is dropped if the identity has changed meanwhile.
    const epoch = catalogue.currentEpoch()
    const existing = lists[current]?.value.find((entry) => entry.id === values.id) ?? null
    let saved
    if (current === 'services') saved = await saveService(values, { isNew, correctionId })
    else if (current === 'activities') saved = await saveActivity(values, { isNew })
    else saved = await saveSession(values, { isNew })
    catalogue.applyLocal(current, asSavedRecord(current, values, saved, { isNew, existing }), {
      epoch,
    })
    await catalogue.reload()
    return saved
  }

  // The read takes the signal of the identity epoch it starts in, so an identity change aborts
  // it; the store hands out a new signal per epoch, hence the read at call time.
  const fetchLatest = () =>
    fetchStaffRecord(toValue(kind), toValue(recordId), { signal: authStore.identitySignal })

  return { catalogue, record, state, save, fetchLatest }
}
