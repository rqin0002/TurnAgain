import { nextTick, ref, shallowRef } from 'vue'

import { setRecordStatus } from '../data/staffRepository.js'

import { useStaffCatalogue } from './useStaffCatalogue.js'

/**
 * The register row actions (Archive/Restore, Cancel session or Mark cancelled, Mark completed; no
 * Delete anywhere). Archiving and cancelling ask first; restoring and completing do not. A
 * session's words follow who runs it: TurnAgain cancels its own sessions (staff then email the
 * participants from the session page), while for a provider or drop-in session TurnAgain only
 * records what happened in its listing, tells nobody and changes nothing on the provider's side,
 * and the confirm and the result say so. A change that another window overtook reloads the
 * register before it says so, and says when that reload failed and the register still shows what
 * was loaded earlier. The result goes to the page's mounted status line through `message`; with
 * `focusTarget` (a ref to that line, which carries tabindex="-1"), focus moves there once a
 * started change settles, because the control just used is disabled, swapped or gone by then
 * and would leave focus on <body>.
 */

const nameOf = (record) => record.name ?? record.title ?? 'this record'

/**
 * A session TurnAgain only lists: someone else takes its registrations, or nobody does. A record
 * without a registration type keeps the TurnAgain wording.
 */
const isListedOnly = (record) =>
  record?.registrationType === 'provider' || record?.registrationType === 'drop-in'

/** The name of a session's cancel action: what it really does for that kind of session. */
export const sessionCancelLabel = (record) =>
  isListedOnly(record) ? 'Mark cancelled' : 'Cancel session'

export const confirmText = (kind, record, status) => {
  if (status === 'archived') {
    return `Archive ${nameOf(record)}? It leaves the public pages until you restore it.`
  }
  if (kind === 'sessions' && status === 'cancelled') {
    return isListedOnly(record)
      ? "Mark this session as cancelled? Only the TurnAgain listing changes: nobody is told, and the provider's own page stays as it is."
      : 'Cancel this session? It stays listed as cancelled; email the participants from the session page.'
  }
  return ''
}

const doneText = (kind, record, status) => {
  if (kind === 'sessions') {
    if (isListedOnly(record)) {
      return status === 'cancelled'
        ? 'The listing now shows this session as cancelled. Nobody was told.'
        : 'The listing now shows this session as completed.'
    }
    return status === 'cancelled' ? 'The session is cancelled.' : 'The session is marked completed.'
  }
  return status === 'archived' ? `${nameOf(record)} is archived.` : `${nameOf(record)} is restored.`
}

export function useRecordStatus({ focusTarget = null } = {}) {
  const catalogue = useStaffCatalogue()
  const pendingId = ref(null)
  const error = shallowRef(null)
  const message = ref('')

  async function setStatus(kind, record, status) {
    if (pendingId.value !== null) return false
    const question = confirmText(kind, record, status)
    if (question && !window.confirm(question)) return false
    pendingId.value = record.id
    error.value = null
    message.value = ''
    try {
      await setRecordStatus(kind, record, status)
      message.value = doneText(kind, record, status)
      await catalogue.reload()
      return true
    } catch (caught) {
      error.value = caught
      if (caught?.code === 'conflict') {
        // A failed reload never throws: the catalogue keeps its lists and sets `error`.
        await catalogue.reload()
        message.value = catalogue.error.value
          ? 'This record was changed in another window. The register could not be refreshed; try again later.'
          : 'This record was changed in another window. The register now shows the latest version; try again.'
      } else {
        message.value = caught?.message ?? ''
      }
      return false
    } finally {
      pendingId.value = null
      await nextTick()
      focusTarget?.value?.focus()
    }
  }

  return { pendingId, error, message, setStatus }
}
