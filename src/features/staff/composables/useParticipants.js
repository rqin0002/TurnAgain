import { computed, onMounted, ref, shallowRef, toValue, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { isAbortError } from '@/shared/data/RepositoryError.js'

import { listSessionBookings } from '../data/staffRepository.js'
import {
  isLiveParticipant,
  liveParticipants,
  selectIds,
  toParticipantRows,
} from '../domain/participants.js'

const STAFF_ROLES = Object.freeze(['staff', 'admin'])

/**
 * One session's participants and the staff member's selection. The bookings
 * are read with the identity signal, held in memory only and dropped on an identity
 * change. The selection belongs to the session, not to the table: a filter or a page change never
 * changes it, the select buttons pick from every live booking, and a reload drops the ids that
 * are no longer confirmed or waitlisted.
 *
 * @param {import('vue').MaybeRefOrGetter<string>} sessionId
 */
export function useParticipants(sessionId) {
  const authStore = useAuthStore()
  const bookings = shallowRef([])
  const status = ref('idle')
  const error = shallowRef(null)
  const truncated = ref(false)
  const selectedIds = ref([])

  const rows = computed(() => toParticipantRows(bookings.value))
  const liveCount = computed(() => liveParticipants(bookings.value).length)
  const selectedBookings = computed(() => {
    const byId = new Map(bookings.value.map((booking) => [booking.id, booking]))
    return selectedIds.value
      .map((id) => byId.get(id))
      .filter((booking) => booking !== undefined && isLiveParticipant(booking))
  })

  let generation = 0

  const clear = () => {
    bookings.value = []
    truncated.value = false
    selectedIds.value = []
    error.value = null
    status.value = 'idle'
  }

  const reload = async () => {
    const id = toValue(sessionId)
    const run = ++generation
    if (!id || !authStore.canAccess(STAFF_ROLES)) return
    error.value = null
    if (status.value !== 'ready') status.value = 'loading'
    try {
      const result = await listSessionBookings(id, {
        signal: authStore.identitySignal,
      })
      if (run !== generation) return
      bookings.value = result.bookings
      truncated.value = result.truncated
      const live = new Set(liveParticipants(result.bookings).map((booking) => booking.id))
      selectedIds.value = selectedIds.value.filter((selected) => live.has(selected))
      status.value = 'ready'
    } catch (caught) {
      if (isAbortError(caught) || run !== generation) return
      error.value = caught
      if (status.value !== 'ready') status.value = 'error'
    }
  }

  /** @param {'all' | 'confirmed' | 'waitlisted' | 'none'} mode */
  const select = (mode) => {
    selectedIds.value = mode === 'none' ? [] : selectIds(bookings.value, mode)
  }

  const toggle = (bookingId, checked) => {
    const booking = bookings.value.find((entry) => entry.id === bookingId)
    if (checked) {
      if (isLiveParticipant(booking) && !selectedIds.value.includes(bookingId)) {
        selectedIds.value = [...selectedIds.value, bookingId]
      }
    } else {
      selectedIds.value = selectedIds.value.filter((selected) => selected !== bookingId)
    }
  }

  watch(
    () => authStore.identityEpoch,
    () => {
      generation += 1
      clear()
      void reload()
    },
    { flush: 'sync' },
  )
  watch(
    () => toValue(sessionId),
    () => {
      generation += 1
      clear()
      void reload()
    },
  )
  onMounted(() => void reload())

  return {
    bookings,
    rows,
    status,
    error,
    truncated,
    reload,
    selectedIds,
    selectedBookings,
    liveCount,
    select,
    toggle,
  }
}
