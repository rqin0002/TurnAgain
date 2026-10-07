import { computed, toValue } from 'vue'

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
 */
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
    let saved
    if (current === 'services') saved = await saveService(values, { isNew, correctionId })
    else if (current === 'activities') saved = await saveActivity(values, { isNew })
    else saved = await saveSession(values, { isNew })
    await catalogue.reload()
    return saved
  }

  // The read takes the signal of the identity epoch it starts in, so an identity change aborts
  // it; the store hands out a new signal per epoch, hence the read at call time.
  const fetchLatest = () =>
    fetchStaffRecord(toValue(kind), toValue(recordId), { signal: authStore.identitySignal })

  return { catalogue, record, state, save, fetchLatest }
}
