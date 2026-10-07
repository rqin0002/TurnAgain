import { hasControlCharacter } from '@shared/controlCharacters.js'

import { isStoredEmail } from '@/features/auth/domain/profileSchema.js'
import {
  POSTCODE_PATTERN,
  hasExactKeys,
  isBoundedString,
  isPlainObject,
  isValidId,
  toIsoTimestamp,
} from '@/shared/domain/catalogueValidation.js'

import { BOOKING_STATUSES, REFERENCE_PATTERN, bookingIdFor } from './bookingRules.js'

/**
 * The review form's input and the booking document's client projection. Lengths are UTF-16
 * code units, as the rules' `size()` and authValidation.js measure them, so a value the form accepts is a value the rules store.
 */

export const BOOKING_LIMITS = Object.freeze({ contactNameMax: 50, itemDescriptionMax: 200 })

// The rules' hasNoControlChars for the description; the name is one line (isSingleLineText).
const STORED_TEXT_ALLOWS = '\t\n\r'

const COPY = Object.freeze({
  nameRequired: 'Enter the name for the register.',
  nameTooLong: 'Use 50 characters or fewer.',
  control: 'Remove control characters.',
  descriptionTooLong: 'Use 200 characters or fewer.',
  acknowledge: 'Confirm that you have read the information.',
})

const describeName = (name) => {
  if (name === '') return COPY.nameRequired
  if (hasControlCharacter(name)) return COPY.control
  if (name.length > BOOKING_LIMITS.contactNameMax) return COPY.nameTooLong
  return ''
}

// A member may list items on separate lines in the textarea; the rules store tab, LF and CR.
const describeDescription = (description) => {
  if (hasControlCharacter(description, STORED_TEXT_ALLOWS)) return COPY.control
  if (description.length > BOOKING_LIMITS.itemDescriptionMax) return COPY.descriptionTooLong
  return ''
}

/**
 * @param {{ contactName: unknown, itemDescription: unknown, acknowledged: unknown }} input
 * @returns {{ isValid: boolean, errors: { contactName: string, itemDescription: string, acknowledged: string }, values: { contactName: string, itemDescription: string | null } }}
 */
export function validateBookingInput({ contactName, itemDescription, acknowledged } = {}) {
  const name = typeof contactName === 'string' ? contactName.trim().replace(/\s+/gu, ' ') : ''
  // One line-feed form, so the counter, the limit and the stored length all count a break once.
  const description =
    typeof itemDescription === 'string' ? itemDescription.replace(/\r\n?/gu, '\n').trim() : ''
  const errors = {
    contactName: describeName(name),
    itemDescription: describeDescription(description),
    acknowledged: acknowledged === true ? '' : COPY.acknowledge,
  }
  return {
    isValid: Object.values(errors).every((message) => message === ''),
    errors,
    values: { contactName: name, itemDescription: description === '' ? null : description },
  }
}

export const BOOKING_KEYS = Object.freeze([
  'uid',
  'email',
  'contactName',
  'itemDescription',
  'sessionId',
  'activityId',
  'activityTitle',
  'venueName',
  'address',
  'suburb',
  'postcode',
  'startsAt',
  'endsAt',
  'status',
  'reference',
  'waitlistedAt',
  'promotedAt',
  'cancelledAt',
  'createdAt',
  'updatedAt',
])
const KEY_SET = new Set(BOOKING_KEYS)

const isNullableTimestamp = (value) => value === null || toIsoTimestamp(value) !== null

const CHECKS = Object.freeze({
  uid: (c) => isValidId(c.uid),
  email: (c) => isStoredEmail(c.email),
  contactName: (c) =>
    isBoundedString(c.contactName, BOOKING_LIMITS.contactNameMax) &&
    !hasControlCharacter(c.contactName),
  itemDescription: (c) =>
    c.itemDescription === null ||
    (typeof c.itemDescription === 'string' &&
      c.itemDescription.length <= BOOKING_LIMITS.itemDescriptionMax &&
      !hasControlCharacter(c.itemDescription, STORED_TEXT_ALLOWS)),
  sessionId: (c) => isValidId(c.sessionId),
  activityId: (c) => isValidId(c.activityId),
  activityTitle: (c) => isBoundedString(c.activityTitle, 150),
  venueName: (c) => isBoundedString(c.venueName, 150),
  address: (c) => isBoundedString(c.address, 200),
  suburb: (c) => isBoundedString(c.suburb, 100),
  postcode: (c) => typeof c.postcode === 'string' && POSTCODE_PATTERN.test(c.postcode),
  startsAt: (c) => toIsoTimestamp(c.startsAt) !== null,
  endsAt: (c) => {
    const starts = toIsoTimestamp(c.startsAt)
    const ends = toIsoTimestamp(c.endsAt)
    return starts !== null && ends !== null && Date.parse(ends) > Date.parse(starts)
  },
  status: (c) => BOOKING_STATUSES.includes(c.status),
  reference: (c) => typeof c.reference === 'string' && REFERENCE_PATTERN.test(c.reference),
  waitlistedAt: (c) => isNullableTimestamp(c.waitlistedAt),
  promotedAt: (c) => isNullableTimestamp(c.promotedAt),
  cancelledAt: (c) => isNullableTimestamp(c.cancelledAt),
  createdAt: (c) => toIsoTimestamp(c.createdAt) !== null,
  updatedAt: (c) => toIsoTimestamp(c.updatedAt) !== null,
})

/** The rules' isValidBooking on the client side: exact keys and every field check. */
export function validateBooking(candidate) {
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

/** A booking document id: two ids joined by `_` (at most 257 characters). */
export const isBookingId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,256}$/u.test(value)

const isoOrNull = (value) => (value === null ? null : toIsoTimestamp(value))

/**
 * The client Booking: the stored fields with ISO instants plus `id`; null
 * when the id is not `uid_sessionId` or any check fails (skip-and-count).
 */
export function projectBooking(documentId, candidate) {
  if (
    !isBookingId(documentId) ||
    !validateBooking(candidate).isValid ||
    documentId !== bookingIdFor(candidate.uid, candidate.sessionId)
  ) {
    return null
  }
  return {
    id: documentId,
    ...candidate,
    startsAt: toIsoTimestamp(candidate.startsAt),
    endsAt: toIsoTimestamp(candidate.endsAt),
    waitlistedAt: isoOrNull(candidate.waitlistedAt),
    promotedAt: isoOrNull(candidate.promotedAt),
    cancelledAt: isoOrNull(candidate.cancelledAt),
    createdAt: toIsoTimestamp(candidate.createdAt),
    updatedAt: toIsoTimestamp(candidate.updatedAt),
  }
}
