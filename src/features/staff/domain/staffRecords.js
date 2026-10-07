import { projectActivity } from '@/features/activities/domain/activitySchema.js'
import { projectSession } from '@/features/activities/domain/sessionSchema.js'
import { projectService } from '@/features/discovery/domain/serviceSchema.js'
import {
  hasExactKeys,
  isBoundedString,
  isValidId,
  toIsoTimestamp,
} from '@/shared/domain/catalogueValidation.js'

/**
 * The records the staff side holds (spec 8.1, contract section 2.1): the public projectors' shapes
 * with the stored `revision ?? 0`, because the rules' `isStaffUpdate` steps from the stored value
 * (`before.get('revision', 0) + 1`, R1) and the projectors' `?? 1` default would make a legacy
 * record's first save a conflict. A session also says whether the stored document carries
 * `cancellationNoticeAt`, so its first save can add the key (R16). Pure.
 */

export const STAFF_KINDS = Object.freeze(['services', 'activities', 'sessions'])
export const COLLECTION_OF_KIND = Object.freeze({
  services: 'services',
  activities: 'activities',
  sessions: 'activitySessions',
})

const storedRevision = (data) => data.revision ?? 0

/** @returns {object | null} a StaffService, or null for a malformed document (skip and count) */
export function toStaffService(id, data) {
  const record = projectService(id, data)
  return record === null ? null : { ...record, revision: storedRevision(data) }
}

/** @returns {object | null} a StaffActivity, or null */
export function toStaffActivity(id, data) {
  const record = projectActivity(id, data)
  return record === null ? null : { ...record, revision: storedRevision(data) }
}

/** @returns {object | null} a StaffSession (no activityTitle; noticeFieldStored), or null */
export function toStaffSession(id, data) {
  const record = projectSession(id, data)
  return record === null
    ? null
    : {
        ...record,
        revision: storedRevision(data),
        noticeFieldStored: Object.hasOwn(data, 'cancellationNoticeAt'),
      }
}

const PROJECTORS = Object.freeze({
  services: toStaffService,
  activities: toStaffActivity,
  sessions: toStaffSession,
})

/** The kind's projector; null for an unknown kind or a malformed document. */
export function toStaffRecord(kind, id, data) {
  return Object.hasOwn(PROJECTORS, kind) ? PROJECTORS[kind](id, data) : null
}

export const EMAIL_LOG_STATUSES = Object.freeze([
  'sending',
  'accepted',
  'partial',
  'failed',
  'unknown',
  'dry-run',
])

// The nine keys sendSessionEmail writes to emailLogs/{operationId} (functions/sendSessionEmail.js).
const EMAIL_LOG_KEYS = new Set([
  'sessionId',
  'subject',
  'sentBy',
  'recipientCount',
  'copyToSender',
  'attachParticipants',
  'operationId',
  'status',
  'sentAt',
])

/** One "Previous emails" row (Q12), or null when the stored row is not the nine-key shape. */
export function projectEmailLog(id, data) {
  if (
    !isValidId(id) ||
    !hasExactKeys(data, EMAIL_LOG_KEYS) ||
    data.operationId !== id ||
    !isValidId(data.sessionId) ||
    !isBoundedString(data.subject, 200) ||
    !isBoundedString(data.sentBy, 128) ||
    !Number.isSafeInteger(data.recipientCount) ||
    data.recipientCount < 0 ||
    typeof data.copyToSender !== 'boolean' ||
    typeof data.attachParticipants !== 'boolean' ||
    !EMAIL_LOG_STATUSES.includes(data.status)
  ) {
    return null
  }
  const sentAt = toIsoTimestamp(data.sentAt)
  if (sentAt === null) {
    return null
  }
  return {
    id,
    sessionId: data.sessionId,
    subject: data.subject,
    sentBy: data.sentBy,
    recipientCount: data.recipientCount,
    copyToSender: data.copyToSender,
    attachParticipants: data.attachParticipants,
    operationId: data.operationId,
    status: data.status,
    sentAt,
  }
}
