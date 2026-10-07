import { PROFILE_STATUSES } from '@/features/auth/domain/profileSchema.js'
import {
  ROLES,
  isPlainObject,
  isValidId,
  toIsoTimestamp,
} from '@/shared/domain/catalogueValidation.js'
import { formatDate } from '@/shared/domain/formatDate.js'

/**
 * The Team tab's pure half (spec 8.7 L1009, R19, R20, R25): the projection of a users/{uid}
 * document for the table, the columns, the copy and the per-row state machine that turns each
 * adminSetUserAccess outcome into what the row shows. The composable runs the calls; this module
 * only decides. A row's `revision` is the stored `revision ?? 0`, the value the function compares
 * `expectedRevision` with (a legacy profile has none).
 */

export const ROLE_LABELS = Object.freeze({ member: 'Member', staff: 'Staff', admin: 'Admin' })
export const STATUS_LABELS = Object.freeze({ active: 'Active', disabled: 'Disabled' })

/** Spec L1009's copy, verbatim where the spec quotes it. */
export const TEAM_MESSAGES = Object.freeze({
  revisionMismatch: 'This account changed since you loaded it; review and try again',
  liveAdminDisabled: 'Admin changes against the live project are disabled in development mode',
  needsRecovery: 'This account may be in an inconsistent state; press Check',
  retry: 'The change could not be applied; press Retry',
  inProgress: 'Another change to this account is in progress; try again in a moment',
  self: "That's you",
  checkingWait:
    'This account is being checked; Disable account is available when the check finishes',
  outsideFilters: 'is outside the current filters',
  otherPage: 'is on another page of the table',
})

/** The wait before the automatic re-Check when the function names none. */
export const DEFAULT_RETRY_AFTER_MS = 2000

/** States in which a row's buttons are disabled: a call is running or about to run. */
export const BUSY_ROW_STATES = Object.freeze(['checking', 'applying', 'reloading', 'waiting'])

/**
 * @param {string} id - the document id
 * @param {unknown} data - the stored users/{uid} document
 * @returns {{ uid: string, email: string, displayName: string, role: string, status: string, revision: number, createdAt: string | null } | null}
 */
export function projectTeamUser(id, data) {
  if (!isValidId(id) || !isPlainObject(data) || data.uid !== id) return null
  if (typeof data.email !== 'string' || typeof data.displayName !== 'string') return null
  if (!ROLES.includes(data.role) || !PROFILE_STATUSES.includes(data.status)) return null
  const revision = data.revision ?? 0
  if (!Number.isSafeInteger(revision) || revision < 0) return null
  return Object.freeze({
    uid: id,
    email: data.email,
    displayName: data.displayName,
    role: data.role,
    status: data.status,
    revision,
    createdAt: toIsoTimestamp(data.createdAt),
  })
}

const joinedText = (user) =>
  user.createdAt ? formatDate(user.createdAt, { dateStyle: 'medium' }) : ''

/** The Team table's columns (section 2.2 shape); `joined` is the Melbourne date of `createdAt`. */
export const TEAM_COLUMNS = Object.freeze([
  Object.freeze({
    key: 'name',
    label: 'Name',
    value: (user) => user.displayName,
    sort: 'text',
    filter: 'text',
  }),
  Object.freeze({
    key: 'email',
    label: 'Email',
    value: (user) => user.email,
    sort: 'text',
    filter: 'text',
  }),
  Object.freeze({
    key: 'role',
    label: 'Role',
    value: (user) => user.role,
    text: (user) => ROLE_LABELS[user.role] ?? user.role,
    sort: 'text',
    filter: 'select',
    options: Object.freeze(
      ROLES.map((role) => Object.freeze({ value: role, label: ROLE_LABELS[role] })),
    ),
  }),
  Object.freeze({
    key: 'status',
    label: 'Status',
    value: (user) => user.status,
    text: (user) => STATUS_LABELS[user.status] ?? user.status,
    sort: 'text',
    filter: 'select',
    options: Object.freeze(
      PROFILE_STATUSES.map((status) =>
        Object.freeze({ value: status, label: STATUS_LABELS[status] }),
      ),
    ),
  }),
  Object.freeze({
    key: 'joined',
    label: 'Joined',
    value: (user) => user.createdAt,
    text: joinedText,
    searchValues: (user) => [joinedText(user)],
    sort: 'date',
    filter: 'text',
    nullsLast: true,
  }),
])

export const TEAM_DEFAULT_SORT = Object.freeze({ key: 'joined', direction: 'desc' })

/**
 * "Profile: active; sign-in: enabled": the two observed states a Check reports (R19). A
 * `needs-recovery` answer may carry `authDisabled: null` (the function never read Auth, Task 3
 * ruling R-6a.9): the line then says "unknown" rather than an older observation.
 */
export const accessLine = ({ status, authDisabled }) =>
  `Profile: ${status}; sign-in: ${authDisabled === null ? 'unknown' : authDisabled ? 'disabled' : 'enabled'}`

/**
 * @typedef {{ uid: string, user: object, self: boolean, access: { status: string, authDisabled: boolean | null } | null, state: 'self' | 'idle' | 'checking' | 'applying' | 'waiting' | 'needs-recovery' | 'failed' | 'reloading', message: string, retryAfterMs: number | null, lastRequest: { role?: string, status?: string } | null }} TeamRow
 */

/** The caller's own row reads "That's you" and never takes an action (the function refuses it). */
export function initialTeamRow(user, callerUid) {
  const self = user.uid === callerUid
  return Object.freeze({
    uid: user.uid,
    user,
    self,
    access: null,
    state: self ? 'self' : 'idle',
    message: self ? TEAM_MESSAGES.self : '',
    retryAfterMs: null,
    lastRequest: null,
  })
}

/**
 * The states a function answer observed (`authDisabled` null = Auth not read, shown as unknown).
 * An answer without them gives null: the row keeps no older observation as evidence.
 */
const observed = (details) =>
  typeof details?.status === 'string' &&
  (typeof details?.authDisabled === 'boolean' || details?.authDisabled === null)
    ? { status: details.status, authDisabled: details.authDisabled }
    : null

/**
 * The row after one failed call, by the error's code and `details.code` (spec L1009). A branch
 * that reloads the row drops `access` unless the answer observed the states itself: after a
 * conflict the account may have been disabled by another admin, so the earlier
 * "sign-in: enabled" is no evidence (useTeam re-Checks once after the reload).
 */
function failedRow(row, error) {
  const code = error?.code
  const details = error?.details ?? null
  const detailCode = details?.code
  if (details?.reconciled === true) {
    return {
      ...row,
      state: 'reloading',
      access: observed(details),
      message: detailCode === 'revision-mismatch' ? TEAM_MESSAGES.revisionMismatch : '',
      retryAfterMs: null,
    }
  }
  if (code === 'conflict' && detailCode === 'revision-mismatch') {
    return {
      ...row,
      state: 'reloading',
      access: null,
      message: TEAM_MESSAGES.revisionMismatch,
      retryAfterMs: null,
    }
  }
  if (code === 'conflict' && detailCode === 'lock-lost') {
    return { ...row, state: 'reloading', access: null, message: '', retryAfterMs: null }
  }
  if (code === 'conflict' && detailCode === 'in-progress') {
    const wait = details.retryAfterMs
    return {
      ...row,
      state: 'waiting',
      message: TEAM_MESSAGES.inProgress,
      retryAfterMs: Number.isFinite(wait) && wait >= 0 ? wait : DEFAULT_RETRY_AFTER_MS,
    }
  }
  if (code === 'conflict' && detailCode === 'live-admin-disabled') {
    return { ...row, state: 'failed', message: TEAM_MESSAGES.liveAdminDisabled, retryAfterMs: null }
  }
  if (code === 'unavailable' && detailCode === 'needs-recovery') {
    const access = observed(details)
    return {
      ...row,
      state: 'needs-recovery',
      access,
      message: access
        ? `${TEAM_MESSAGES.needsRecovery}. ${accessLine(access)}.`
        : TEAM_MESSAGES.needsRecovery,
      retryAfterMs: null,
    }
  }
  if (code === 'unavailable') {
    return { ...row, state: 'failed', message: TEAM_MESSAGES.retry, retryAfterMs: null }
  }
  return {
    ...row,
    state: 'failed',
    message: typeof error?.message === 'string' ? error.message : TEAM_MESSAGES.retry,
    retryAfterMs: null,
  }
}

/**
 * The row state machine. Events: `{ type: 'check', keepMessage? }`, `{ type: 'apply', request }`
 * (request = `{ role }` or `{ status }`), `{ type: 'succeeded', result, keepMessage? }`,
 * `{ type: 'failed', error }` and `{ type: 'reloaded', user }`. `keepMessage` is the silent
 * re-Check after a conflict reload: the row's notice stays through the check and its success. The
 * caller's own row ignores every event.
 *
 * @param {TeamRow} row
 * @param {{ type: string, request?: object, result?: object, error?: unknown, user?: object, keepMessage?: boolean }} event
 * @returns {TeamRow}
 */
export function reduceTeamRow(row, event) {
  if (row.self) return row
  switch (event.type) {
    case 'check':
      return Object.freeze({
        ...row,
        state: 'checking',
        message: event.keepMessage ? row.message : '',
        retryAfterMs: null,
        lastRequest: {},
      })
    case 'apply':
      return Object.freeze({
        ...row,
        state: 'applying',
        message: '',
        retryAfterMs: null,
        lastRequest: { ...event.request },
      })
    case 'succeeded': {
      const { role, status, revision, authDisabled } = event.result
      return Object.freeze({
        ...row,
        user: Object.freeze({ ...row.user, role, status, revision }),
        access: { status, authDisabled },
        state: 'idle',
        message: event.keepMessage ? row.message : '',
        retryAfterMs: null,
      })
    }
    case 'failed':
      return Object.freeze(failedRow(row, event.error))
    case 'reloaded':
      return Object.freeze({ ...row, user: event.user, state: 'idle', retryAfterMs: null })
    default:
      return row
  }
}

export const isRowBusy = (row) => BUSY_ROW_STATES.includes(row?.state)
