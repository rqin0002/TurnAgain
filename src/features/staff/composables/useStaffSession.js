import { computed, ref, toValue } from 'vue'

import { isStaffFunctionsEnabled } from '../data/staffCapabilities.js'
import { markParticipantsNotified } from '../data/staffRepository.js'

import { useStaffCatalogue } from './useStaffCatalogue.js'

const OPEN_STATUSES = Object.freeze(['scheduled', 'full'])
const NOTIFY_CONFLICT =
  'This session changed in another window. It has been reloaded; check it and try again.'

/**
 * One session of the staff catalogue for the session page (spec 8.4): the record, its activity
 * and title (invariant 12: "Activity" when the activity is unknown), the page state, whether
 * Promote next is offered (L997, plus an open status) and "Mark participants notified" (R11: a
 * cancelled session whose `cancellationNoticeAt` is still null). `functionsEnabled` comes from
 * configuration, never from an error (A6).
 *
 * @param {import('vue').MaybeRefOrGetter<string>} sessionId
 */
export function useStaffSession(sessionId) {
  const catalogue = useStaffCatalogue()
  const functionsEnabled = isStaffFunctionsEnabled()

  const session = computed(
    () => catalogue.sessions.value.find((entry) => entry.id === toValue(sessionId)) ?? null,
  )
  const activity = computed(() =>
    session.value ? (catalogue.activitiesById.value.get(session.value.activityId) ?? null) : null,
  )
  const activityTitle = computed(() => activity.value?.title ?? 'Activity')
  const state = computed(() => {
    if (session.value) return 'ready'
    if (catalogue.status.value === 'error') return 'error'
    if (catalogue.status.value === 'ready') return 'not-found'
    return 'loading'
  })
  const canPromote = computed(() => {
    const current = session.value
    return (
      functionsEnabled &&
      current !== null &&
      current.registrationType === 'turnagain' &&
      OPEN_STATUSES.includes(current.status) &&
      current.waitlistCount > 0 &&
      current.bookedCount < current.capacity
    )
  })
  const showMarkNotified = computed(
    () => session.value?.status === 'cancelled' && session.value.cancellationNoticeAt === null,
  )

  const notifyState = ref('idle')
  const notifyMessage = ref('')

  const refresh = async () => {
    try {
      await catalogue.reload()
    } catch {
      // The catalogue keeps its error, and the page says what it shows was loaded earlier.
    }
  }

  const markNotified = async () => {
    const current = session.value
    if (!current || notifyState.value === 'saving') return
    notifyState.value = 'saving'
    notifyMessage.value = ''
    try {
      const saved = await markParticipantsNotified(current)
      // Shown at once, so a failed reload never leaves the button beside its own success holding a
      // stale revision; the client's clock stands in for the server's stamp until the next read.
      catalogue.applyLocal('sessions', {
        ...current,
        revision: saved.revision,
        cancellationNoticeAt: new Date().toISOString(),
        noticeFieldStored: true,
      })
      notifyState.value = 'saved'
      notifyMessage.value = 'Participants marked as notified.'
      await refresh()
    } catch (caught) {
      notifyState.value = 'failed'
      notifyMessage.value = caught?.code === 'conflict' ? NOTIFY_CONFLICT : (caught?.message ?? '')
      if (caught?.code === 'conflict') await refresh()
    }
  }

  return {
    session,
    activity,
    activityTitle,
    state,
    functionsEnabled,
    canPromote,
    showMarkNotified,
    notifyState,
    notifyMessage,
    markNotified,
  }
}
