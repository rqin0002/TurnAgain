import { PROFILE_STATUSES } from '@/features/auth/domain/profileSchema.js'
import {
  ROLES,
  isPlainObject,
  isValidId,
  toIsoTimestamp,
} from '@/shared/domain/catalogueValidation.js'
import { formatDate } from '@/shared/domain/formatDate.js'

/**
 * Account management's pure half, shared by the two admin pages: Team (staff and admin accounts)
 * and Members (member accounts). It holds the projection of a users/{uid} document for the
 * tables, each page's roles, columns, filters and copy, and the per-row state machine that turns
 * each adminSetUserAccess outcome into what the row shows. The composable runs the calls; this
 * module only decides. The role decides which page lists an account; the status (active or
 * disabled) never moves it. A row's `revision` is the stored `revision ?? 0`, the value the
 * function compares `expectedRevision` with (a legacy profile has none).
 */

export const ROLE_LABELS = Object.freeze({ member: 'Member', staff: 'Staff', admin: 'Admin' })
export const STATUS_LABELS = Object.freeze({ active: 'Active', disabled: 'Disabled' })

/** The account pages' copy. */
export const TEAM_MESSAGES = Object.freeze({
  revisionMismatch: 'This account changed since you loaded it; review and try again',
  liveAdminDisabled: 'Admin changes against the live project are disabled in development mode',
  needsRecovery: 'This account may be in an inconsistent state; press Check sign-in',
  serviceUnavailable: 'The account check is not available on this deployment yet',
  failed: 'The request could not be completed',
  inProgress: 'Another change to this account is in progress; try again in a moment',
  saved: 'Saved',
  self: "That's you",
  checkingWait:
    'This account is being checked; Disable account is available when the check finishes',
  outsideFilters: 'is outside the current filters',
  otherPage: 'is on another page of the table',
  othersUnchecked: 'The other accounts were not checked.',
  noMatch: 'No accounts match these filters.',
})

/** The wait before the automatic re-Check when the function names none. */
export const DEFAULT_RETRY_AFTER_MS = 2000

/** States in which a row's buttons are disabled: a call is running or about to run. */
const BUSY_ROW_STATES = Object.freeze(['checking', 'applying', 'reloading', 'waiting'])

/** The roles each page lists. */
const TEAM_ROLES = Object.freeze(['staff', 'admin'])
const MEMBER_ROLES = Object.freeze(['member'])

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

// The name column carries the email too: one search finds an account by either, and the table
// shows both in the one cell (accounts often share a name).
const nameColumn = Object.freeze({
  key: 'name',
  label: 'Name',
  value: (user) => user.displayName,
  searchValues: (user) => [user.displayName, user.email],
  sort: 'text',
  filter: 'text',
  quickFilter: true,
  filterLabel: 'Search name or email',
  placeholder: 'Name or email',
  width: 'wide',
  wrap: true,
})

const statusColumn = Object.freeze({
  key: 'status',
  label: 'Status',
  value: (user) => user.status,
  text: (user) => STATUS_LABELS[user.status] ?? user.status,
  sort: 'text',
  filter: 'select',
  quickFilter: true,
  filterLabel: 'Profile status',
  anyLabel: 'Active and disabled',
  options: Object.freeze(
    PROFILE_STATUSES.map((status) =>
      Object.freeze({ value: status, label: STATUS_LABELS[status] }),
    ),
  ),
  width: 'wide',
  wrap: true,
})

/** `joined` is the Melbourne date of `createdAt`. */
const joinedColumn = Object.freeze({
  key: 'joined',
  label: 'Joined',
  value: (user) => user.createdAt,
  text: joinedText,
  searchValues: (user) => [joinedText(user)],
  sort: 'date',
  filter: 'text',
  nullsLast: true,
  nowrap: true,
})

// Team's role filter offers Staff and Admin only, so a `?role=member` from an old link is not an
// option and filters nothing: the page shows its own accounts, never members.
const teamRoleColumn = Object.freeze({
  key: 'role',
  label: 'Role',
  value: (user) => user.role,
  text: (user) => ROLE_LABELS[user.role] ?? user.role,
  sort: 'text',
  filter: 'select',
  quickFilter: true,
  anyLabel: 'Staff and admin',
  options: Object.freeze(
    TEAM_ROLES.map((role) => Object.freeze({ value: role, label: ROLE_LABELS[role] })),
  ),
  width: 'narrow',
})

/** The Team table's columns. */
export const TEAM_COLUMNS = Object.freeze([nameColumn, teamRoleColumn, statusColumn, joinedColumn])
/** The Members table's columns: every account there is a member, so there is no role column. */
export const MEMBER_COLUMNS = Object.freeze([nameColumn, statusColumn, joinedColumn])

export const TEAM_DEFAULT_SORT = Object.freeze({ key: 'joined', direction: 'desc' })

/**
 * The two admin account pages. A column's `quickFilter` keeps its filter in view (the search, the
 * Team role and the profile status); Joined sits under More filters. `checksOnLoad` says whether
 * the page checks every account's sign-in state when it loads (Team) or only on request (Members:
 * up to 1,000 accounts, and every Check is a callable call).
 */
export const ACCOUNT_SECTIONS = Object.freeze({
  team: Object.freeze({
    key: 'team',
    title: 'Team',
    path: '/staff/team',
    caption: 'Staff and admin accounts',
    intro:
      'Staff and admin accounts, active and disabled, from their account profiles. Every account but yours is checked when the page opens, so each row shows its sign-in state beside its profile status.',
    empty: 'No staff or admin accounts yet.',
    loading: 'Loading the team…',
    roles: TEAM_ROLES,
    columns: TEAM_COLUMNS,
    checksOnLoad: true,
  }),
  members: Object.freeze({
    key: 'members',
    title: 'Members',
    path: '/staff/members',
    caption: 'Member accounts',
    intro:
      'Member accounts, active and disabled, from their account profiles; an account that has no profile yet is not listed. Sign-in states are checked only on request: use Check sign-in for this page, or Manage on one account.',
    empty: 'No member accounts yet.',
    loading: 'Loading the members…',
    roles: MEMBER_ROLES,
    columns: MEMBER_COLUMNS,
    checksOnLoad: false,
  }),
})

/** The page that lists an account with this role. */
export const sectionOfRole = (role) => (MEMBER_ROLES.includes(role) ? 'members' : 'team')

/**
 * "Profile: active; sign-in: enabled": the two observed states a Check reports. A
 * `needs-recovery` answer may carry `authDisabled: null` (the function never read Auth): the
 * line then says "unknown" rather than an older observation.
 */
export const accessLine = ({ status, authDisabled }) =>
  `Profile: ${status}; sign-in: ${authDisabled === null ? 'unknown' : authDisabled ? 'disabled' : 'enabled'}`

/**
 * The sign-in state a row can honestly show: what the last answer of the function reported,
 * "Checking" while a Check runs, "Unknown" when a call failed before any answer or the function
 * could not read Auth, and "Not checked" otherwise. The profile status is never shown as a
 * sign-in state: only a Check reads Auth. The caller's own account is never checked.
 *
 * @param {TeamRow | null} row
 */
export function signInState(row) {
  if (row?.self) return 'Not checked (your account)'
  if (row?.state === 'checking') return 'Checking'
  const access = row?.access ?? null
  if (access === null) {
    return row?.state === 'failed' || row?.state === 'needs-recovery' ? 'Unknown' : 'Not checked'
  }
  if (access.authDisabled === null) return 'Unknown'
  return access.authDisabled ? 'Disabled' : 'Enabled'
}

/** The row's Retry, named after the request that failed (a Check when it was one). */
export function retryLabel(row) {
  const last = row?.lastRequest ?? {}
  if (last.role) return 'Retry role change'
  if (last.status === 'disabled') return 'Retry disable'
  if (last.status === 'active') return 'Retry enable'
  return 'Retry check'
}

/**
 * True for an idle row whose last role change, Disable or Enable was refused as in progress and
 * has not been applied since: the Check after the wait kept its notice and its request, so the
 * row offers the Retry of that change. A change that went through says "Saved" instead.
 */
export function hasRefusedChange(row) {
  const last = row?.lastRequest ?? {}
  return (
    row?.state === 'idle' &&
    row.message === TEAM_MESSAGES.inProgress &&
    Boolean(last.role || last.status)
  )
}

/**
 * True for a failure every account would meet in turn: the callable is missing or unreachable
 * (`not-found`, or `unavailable` without a recovery code), the connection is down, the caller
 * lost access, or the functions refuse in development mode. A check run stops there instead of
 * failing row after row. Conflicts, a recovery case and bad data belong to one account.
 */
export function isEnvironmentFailure(error) {
  const code = error?.code
  const details = error?.details ?? null
  if (details?.reconciled === true) return false
  if (code === 'conflict') return details?.code === 'live-admin-disabled'
  if (code === 'unavailable') return details?.code !== 'needs-recovery'
  return ['not-found', 'network', 'offline', 'permission'].includes(code)
}

/** The check line after a run stopped at `message` (a row message, with or without a full stop). */
export const sweepStoppedText = (message) =>
  `${message.replace(/\.$/u, '')}. ${TEAM_MESSAGES.othersUnchecked}`

/** The line under the check line when the read skipped profiles it could not use. */
export const skippedText = (count) =>
  count === 1
    ? '1 profile could not be read and is not listed.'
    : `${count} profiles could not be read and are not listed.`

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
 * The row after one failed call, by the error's code and `details.code`. A branch
 * that reloads the row drops `access` unless the answer observed the states itself: after a
 * conflict the account may have been disabled by another admin, so the earlier
 * "sign-in: enabled" is no evidence (useTeam re-Checks once after the reload). A callable that is
 * missing (`not-found`) or unreachable (`unavailable`) says so plainly: pressing Retry would not
 * help until it is deployed or reachable.
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
  if (code === 'unavailable' || code === 'not-found') {
    return {
      ...row,
      state: 'failed',
      message: TEAM_MESSAGES.serviceUnavailable,
      retryAfterMs: null,
    }
  }
  return {
    ...row,
    state: 'failed',
    message: typeof error?.message === 'string' ? error.message : TEAM_MESSAGES.failed,
    retryAfterMs: null,
  }
}

/**
 * The row state machine. Events: `{ type: 'check', keepMessage?, keepRequest? }`,
 * `{ type: 'apply', request }` (request = `{ role }` or `{ status }`),
 * `{ type: 'succeeded', result, keepMessage? }`, `{ type: 'failed', error }` and
 * `{ type: 'reloaded', user }`. `keepMessage` marks a Check the composable starts by itself (the
 * silent re-Check after a conflict reload, or the Check after an in-progress wait): the row's
 * notice stays through the check and its success. `keepRequest` keeps the row's last request
 * through such a Check, so a change that was refused as in-progress and never applied keeps its
 * Retry. A change the function confirmed says "Saved"; a Check that succeeds says nothing. The
 * caller's own row ignores every event.
 *
 * @param {TeamRow} row
 * @param {{ type: string, request?: object, result?: object, error?: unknown, user?: object, keepMessage?: boolean, keepRequest?: boolean }} event
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
        lastRequest: event.keepRequest ? row.lastRequest : {},
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
      let message = ''
      if (event.keepMessage) message = row.message
      else if (row.state === 'applying') message = TEAM_MESSAGES.saved
      return Object.freeze({
        ...row,
        user: Object.freeze({ ...row.user, role, status, revision }),
        access: { status, authDisabled },
        state: 'idle',
        message,
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
