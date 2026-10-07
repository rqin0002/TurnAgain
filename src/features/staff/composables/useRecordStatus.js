import { nextTick, ref, shallowRef } from 'vue'

import { setRecordStatus } from '../data/staffRepository.js'

import { useStaffCatalogue } from './useStaffCatalogue.js'

/**
 * The register row actions (spec 8.2: Archive/Restore, Cancel session, Mark completed; no Delete
 * anywhere, C4). Archiving and cancelling ask first; restoring and completing do not. A change
 * that another window overtook reloads the register before it says so. The result goes to the
 * page's mounted status line through `message`; with `focusTarget` (a ref to that line, which
 * carries tabindex="-1"), focus moves there once a started change settles, because the control
 * just used is disabled, swapped or gone by then and would leave focus on <body> (M6-D22).
 */

const nameOf = (record) => record.name ?? record.title ?? 'this record'

export const confirmText = (kind, record, status) => {
  if (status === 'archived') {
    return `Archive ${nameOf(record)}? It leaves the public pages until you restore it.`
  }
  if (kind === 'sessions' && status === 'cancelled') {
    return 'Cancel this session? It stays listed as cancelled; email the participants from the session page.'
  }
  return ''
}

const doneText = (kind, record, status) => {
  if (kind === 'sessions') {
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
        await catalogue.reload()
        message.value =
          'This record was changed in another window. The register now shows the latest version; try again.'
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
