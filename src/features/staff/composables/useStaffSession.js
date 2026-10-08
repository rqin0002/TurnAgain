import { computed, ref, toValue, watch } from 'vue'

import { isStaffFunctionsEnabled } from '../data/staffCapabilities.js'
import { markParticipantsNotified } from '../data/staffRepository.js'

import { useStaffCatalogue } from './useStaffCatalogue.js'

const OPEN_STATUSES = Object.freeze(['scheduled', 'full'])
const NOTIFY_CONFLICT =
  'This session changed in another window. It has been reloaded; check it and try again.'

/**
 * One session of the staff catalogue for the session page: the record, its activity
 * and title ("Activity" when the activity is unknown), the page state, whether
 * Promote next is offered (an open status and a start still ahead, since the callable
 * refuses a started session with `session-not-open`) and "Mark participants notified" (a
 * cancelled session whose `cancellationNoticeAt` is still null). `functionsEnabled` comes from
 * configuration, never from an error. `now` is the page's clock, so a page left open past
 * the start takes Promote next away.
 *
 * The notified state belongs to one session and one identity: changing `sessionId` or the
 * signed-in identity clears it. A save that finishes after a session change still updates the
 * catalogue's copy of the session it started on, but not the message of the session now shown;
 * a save that finishes after an identity change changes nothing (no catalogue update, no message,
 * no reload). `markNotified` resolves to whether its outcome was shown, so the page moves focus
 * only for a result it displayed.
 *
 * @param {import('vue').MaybeRefOrGetter<string>} sessionId
 * @param {{ now?: () => Date }} [options]
 */
export function useStaffSession(sessionId, { now = () => new Date() } = {}) {
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
      Date.parse(current.startsAt) > now().getTime() &&
      current.waitlistCount > 0 &&
      current.bookedCount < current.capacity
    )
  })
  const showMarkNotified = computed(
    () => session.value?.status === 'cancelled' && session.value.cancellationNoticeAt === null,
  )

  const notifyState = ref('idle')
  const notifyMessage = ref('')

  // Counts session and identity changes; a write remembers the count it started under and reports
  // its outcome only while the count is unchanged.
  let generation = 0
  watch([() => toValue(sessionId), () => catalogue.currentEpoch()], () => {
    generation += 1
    notifyState.value = 'idle'
    notifyMessage.value = ''
  })

  const refresh = async () => {
    try {
      await catalogue.reload()
    } catch {
      // The catalogue keeps its error, and the page says what it shows was loaded earlier.
    }
  }

  const markNotified = async () => {
    const current = session.value
    if (!current || notifyState.value === 'saving') return false
    const run = generation
    // The identity epoch the save starts under. After any identity-epoch change (another account,
    // a sign-out, or a re-read profile whose role, revision or email changed, the same account's
    // included) this save changes nothing more (no catalogue update, no message, no reload), and
    // the catalogue drops a late local update too.
    const epoch = catalogue.currentEpoch()
    const sameIdentity = () => catalogue.currentEpoch() === epoch
    notifyState.value = 'saving'
    notifyMessage.value = ''
    try {
      const saved = await markParticipantsNotified(current)
      if (!sameIdentity()) return false
      // Shown at once, so a failed reload never leaves the button beside its own success holding a
      // stale revision; the client's clock stands in for the server's stamp until the next read.
      catalogue.applyLocal(
        'sessions',
        {
          ...current,
          revision: saved.revision,
          cancellationNoticeAt: new Date().toISOString(),
          noticeFieldStored: true,
        },
        { epoch },
      )
      if (run === generation) {
        notifyState.value = 'saved'
        notifyMessage.value = 'Participants marked as notified.'
      }
      await refresh()
    } catch (caught) {
      if (!sameIdentity()) return false
      if (run === generation) {
        notifyState.value = 'failed'
        notifyMessage.value =
          caught?.code === 'conflict' ? NOTIFY_CONFLICT : (caught?.message ?? '')
      }
      if (caught?.code === 'conflict') await refresh()
    }
    return run === generation
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
