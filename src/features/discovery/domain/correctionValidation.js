import { hasControlCharacter } from '@shared/controlCharacters.js'

import { isStoredEmail } from '@/features/auth/domain/profileSchema.js'
import {
  hasExactKeys,
  isPlainObject,
  isValidId,
  normalizeEmail,
  toIsoTimestamp,
} from '@/shared/domain/catalogueValidation.js'

/**
 * The stored vocabulary of a correction, the client mirror of the rules'
 * `isValidCorrection`. Lengths are UTF-16 code units (`.length`), which is what the rules'
 * `string.size()` counts. A message and a resolution note
 * may hold tab, line feed and carriage return (`hasNoControlChars`); the service name is one line
 * (`isSingleLineText`). The public form's input validation follows. Pure.
 */

export const CORRECTION_FIELDS = Object.freeze([
  'address',
  'hours',
  'items',
  'closed',
  'contact',
  'other',
])
export const CORRECTION_STATUSES = Object.freeze(['open', 'applied', 'dismissed'])
export const CORRECTION_KEYS = Object.freeze([
  'serviceId',
  'serviceName',
  'field',
  'message',
  'reporterEmail',
  'reporterUid',
  'status',
  'resolutionNote',
  'resolvedBy',
  'resolvedAt',
  'createdAt',
  'updatedAt',
])
export const CORRECTION_LIMITS = Object.freeze({
  serviceNameMax: 150,
  messageMin: 10,
  messageMax: 1000,
  resolutionNoteMax: 500,
})

const KEY_SET = new Set(CORRECTION_KEYS)
const MULTI_LINE = '\t\n\r'

const isText = (value, minimum, maximum) =>
  typeof value === 'string' && value.length >= minimum && value.length <= maximum

const isNullableUid = (value) => value === null || (typeof value === 'string' && value !== '')

const CHECKS = Object.freeze({
  serviceId: (c) => isValidId(c.serviceId),
  serviceName: (c) =>
    isText(c.serviceName, 1, CORRECTION_LIMITS.serviceNameMax) &&
    !hasControlCharacter(c.serviceName),
  field: (c) => CORRECTION_FIELDS.includes(c.field),
  message: (c) =>
    isText(c.message, CORRECTION_LIMITS.messageMin, CORRECTION_LIMITS.messageMax) &&
    !hasControlCharacter(c.message, MULTI_LINE),
  reporterEmail: (c) => c.reporterEmail === null || isStoredEmail(c.reporterEmail),
  reporterUid: (c) => isNullableUid(c.reporterUid),
  status: (c) => CORRECTION_STATUSES.includes(c.status),
  resolutionNote: (c) =>
    c.resolutionNote === null ||
    (isText(c.resolutionNote, 1, CORRECTION_LIMITS.resolutionNoteMax) &&
      !hasControlCharacter(c.resolutionNote, MULTI_LINE)),
  resolvedBy: (c) => isNullableUid(c.resolvedBy),
  resolvedAt: (c) => c.resolvedAt === null || toIsoTimestamp(c.resolvedAt) !== null,
  createdAt: (c) => toIsoTimestamp(c.createdAt) !== null,
  updatedAt: (c) => toIsoTimestamp(c.updatedAt) !== null,
})

/** @returns {{ isValid: boolean, errors: Record<string, string> }} one reason per failing field */
export function validateCorrection(candidate) {
  if (!isPlainObject(candidate)) {
    return { isValid: false, errors: { record: 'not-an-object' } }
  }
  const errors = {}
  if (!hasExactKeys(candidate, KEY_SET)) {
    errors.keys = 'unexpected-or-missing-keys'
  }
  for (const [field, check] of Object.entries(CHECKS)) {
    if (!check(candidate)) {
      errors[field] = 'invalid'
    }
  }
  return { isValid: Object.keys(errors).length === 0, errors }
}

/** A stored correction with ISO instants, or null (skip and count). */
export function projectCorrection(id, candidate) {
  if (!isValidId(id) || !validateCorrection(candidate).isValid) {
    return null
  }
  return {
    id,
    serviceId: candidate.serviceId,
    serviceName: candidate.serviceName,
    field: candidate.field,
    message: candidate.message,
    reporterEmail: candidate.reporterEmail,
    reporterUid: candidate.reporterUid,
    status: candidate.status,
    resolutionNote: candidate.resolutionNote,
    resolvedBy: candidate.resolvedBy,
    resolvedAt: candidate.resolvedAt === null ? null : toIsoTimestamp(candidate.resolvedAt),
    createdAt: toIsoTimestamp(candidate.createdAt),
    updatedAt: toIsoTimestamp(candidate.updatedAt),
  }
}

/** What the public form offers for `field`, in the order of CORRECTION_FIELDS. */
export const CORRECTION_FIELD_LABELS = Object.freeze({
  address: 'Address or location',
  hours: 'Opening hours',
  items: 'Items accepted',
  closed: 'Closed or moved',
  contact: 'Contact details',
  other: 'Something else',
})

/** The public form's error copy. */
export const CORRECTION_INPUT_MESSAGES = Object.freeze({
  field: 'Choose what is wrong.',
  messageShort: 'Tell us in at least 10 characters.',
  messageLong: 'Use 1,000 characters or fewer.',
  messageControl: 'Remove control characters.',
  reporterEmail: 'Enter a valid email address or leave it empty.',
})

const correctionMessageError = (text) => {
  if (text.length < CORRECTION_LIMITS.messageMin) return CORRECTION_INPUT_MESSAGES.messageShort
  if (text.length > CORRECTION_LIMITS.messageMax) return CORRECTION_INPUT_MESSAGES.messageLong
  if (hasControlCharacter(text, '\n')) return CORRECTION_INPUT_MESSAGES.messageControl
  return ''
}

/**
 * The public form's input: `field` one of the six values; `message` with CRLF and
 * CR made LF, trimmed, 10-1,000 UTF-16 units (the rules' `size()`) and no control character but
 * a line feed; `reporterEmail` optional, lower-cased, the rules' address shape. `website` is the
 * honeypot: a person never sees it, so any text there marks the submission as spam, which the
 * caller answers as sent without writing.
 *
 * @returns {{ isValid: boolean, isSpam: boolean, errors: { field: string, message: string, reporterEmail: string }, values: { field: string, message: string, reporterEmail: string | null } }}
 */
export function validateCorrectionInput({ field, message, reporterEmail, website } = {}) {
  const text = typeof message === 'string' ? message.replace(/\r\n?/gu, '\n').trim() : ''
  const email = normalizeEmail(reporterEmail)
  const errors = {
    field: CORRECTION_FIELDS.includes(field) ? '' : CORRECTION_INPUT_MESSAGES.field,
    message: correctionMessageError(text),
    reporterEmail:
      email === '' || isStoredEmail(email) ? '' : CORRECTION_INPUT_MESSAGES.reporterEmail,
  }
  return {
    isValid: Object.values(errors).every((error) => error === ''),
    isSpam: typeof website === 'string' && website.trim() !== '',
    errors,
    values: {
      field: CORRECTION_FIELDS.includes(field) ? field : '',
      message: text,
      reporterEmail: email === '' ? null : email,
    },
  }
}

/**
 * The new correction document without its two timestamps: the repository adds
 * `createdAt` and `updatedAt` as server timestamps, and tests/api builds the same document, so the
 * rules are proven against exactly what the browser writes.
 */
export function toNewCorrection({
  serviceId,
  serviceName,
  field,
  message,
  reporterEmail,
  reporterUid,
}) {
  return {
    serviceId,
    serviceName,
    field,
    message,
    reporterEmail,
    reporterUid,
    status: 'open',
    resolutionNote: null,
    resolvedBy: null,
    resolvedAt: null,
  }
}
