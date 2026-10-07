import { hasControlCharacter } from '@shared/controlCharacters.js'

import {
  CORRECTION_FIELD_LABELS,
  CORRECTION_LIMITS,
  CORRECTION_STATUSES,
} from '@/features/discovery/domain/correctionValidation.js'

/**
 * Corrections on the staff side. `bindCorrection` decides whether the
 * `?correction=` of a record edit may be marked applied in that save's batch: only a correction
 * that exists, is about this very service and is still open; any other link saves the record
 * without it and says why. The queue helpers filter and order the cards; the note check mirrors
 * the rules' `resolutionNote` bounds. Pure.
 */

export const CORRECTION_NOTICES = Object.freeze({
  notFound: 'This correction was not found, so it will not be marked applied.',
  otherListing: 'This correction is about another listing, so it will not be marked applied.',
  notOpen: 'This correction is already handled, so it will not be marked applied again.',
  notService: 'Corrections apply to services only; this save leaves the correction unchanged.',
  bound: (field) =>
    `Saving also marks the correction "${CORRECTION_FIELD_LABELS[field]}" as applied.`,
})

const unbound = (notice) => ({ correction: null, notice })

/**
 * @param {{ correctionId: string, kind: string, recordId: string, corrections: object[] | null }} input
 *   `corrections` is null while the staff catalogue has not
 *   loaded, which gives no notice yet
 * @returns {{ correction: object | null, notice: string }}
 */
export function bindCorrection({ correctionId, kind, recordId, corrections }) {
  if (typeof correctionId !== 'string' || correctionId === '') return unbound('')
  if (kind !== 'services') return unbound(CORRECTION_NOTICES.notService)
  if (!Array.isArray(corrections)) return unbound('')
  const correction = corrections.find((entry) => entry.id === correctionId)
  if (!correction) return unbound(CORRECTION_NOTICES.notFound)
  if (correction.serviceId !== recordId) return unbound(CORRECTION_NOTICES.otherListing)
  if (correction.status !== 'open') return unbound(CORRECTION_NOTICES.notOpen)
  return { correction, notice: CORRECTION_NOTICES.bound(correction.field) }
}

/** `?status=` of the queue: one of the three statuses, `open` when missing or unknown. */
export function normalizeCorrectionStatus(value) {
  const first = Array.isArray(value) ? value[0] : value
  return CORRECTION_STATUSES.includes(first) ? first : 'open'
}

/** The cards of one status, newest first (ties keep the read order). */
export function correctionsWithStatus(corrections, status) {
  return corrections
    .map((correction, index) => ({ correction, index }))
    .filter(({ correction }) => correction.status === status)
    .sort(
      (left, right) =>
        Date.parse(right.correction.createdAt) - Date.parse(left.correction.createdAt) ||
        left.index - right.index,
    )
    .map(({ correction }) => correction)
}

export const RESOLUTION_NOTE_MESSAGES = Object.freeze({
  long: 'Use 500 characters or fewer.',
  control: 'Remove control characters.',
})

/**
 * The optional note of Mark applied and Dismiss: CRLF and CR made LF, trimmed, empty -> null,
 * at most 500 UTF-16 units, no control character but a line feed.
 *
 * @returns {{ isValid: boolean, error: string, value: string | null }}
 */
export function validateResolutionNote(text) {
  const value = typeof text === 'string' ? text.replace(/\r\n?/gu, '\n').trim() : ''
  if (value === '') return { isValid: true, error: '', value: null }
  if (value.length > CORRECTION_LIMITS.resolutionNoteMax) {
    return { isValid: false, error: RESOLUTION_NOTE_MESSAGES.long, value }
  }
  if (hasControlCharacter(value, '\n')) {
    return { isValid: false, error: RESOLUTION_NOTE_MESSAGES.control, value }
  }
  return { isValid: true, error: '', value }
}
