/**
 * The one error every repository throws (spec 10.2). Views render copy from `code`; nothing
 * user-facing is built from a Firebase message. `toRepositoryError` maps Firestore Lite and
 * Cloud Functions errors (spec 5.9); AbortError and RepositoryError pass through.
 */

export const REPOSITORY_ERROR_CODES = Object.freeze([
  'network',
  'offline',
  'permission',
  'not-found',
  'invalid-data',
  'unavailable',
  'conflict',
])

/** Dispatched on window so the auth store re-validates the profile (spec 9.3). */
export const PERMISSION_DENIED_EVENT = 'turnagain:permission-denied'

const DEFAULT_MESSAGES = Object.freeze({
  network: 'The service could not be reached. Check your connection and try again.',
  offline: 'You appear to be offline. Check your connection and try again.',
  permission: 'You no longer have access to this.',
  'not-found': 'This record could not be found.',
  'invalid-data': 'The data was not in the expected shape.',
  unavailable: 'Something went wrong. Try again in a moment.',
  conflict: 'This action conflicts with the current state of the record.',
})

export class RepositoryError extends Error {
  constructor(code, message, { details = null, cause } = {}) {
    const safeCode = REPOSITORY_ERROR_CODES.includes(code) ? code : 'unavailable'
    super(message ?? DEFAULT_MESSAGES[safeCode])
    this.name = 'RepositoryError'
    this.code = safeCode
    this.details = details
    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

export const isRepositoryError = (error) => error instanceof RepositoryError

export const isAbortError = (error) => error?.name === 'AbortError'

export function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException('The request was aborted.', 'AbortError')
  }
}

/**
 * @param {string} [source='firestore'] - who was denied. The auth store ignores `'users'` (its own
 *   profile writes report through their promise, C4.2) and re-validates the profile for every
 *   other source (spec 9.3).
 */
export function notifyPermissionDenied(source = 'firestore') {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(PERMISSION_DENIED_EVENT, { detail: { source } }))
  }
}

const isBrowserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

const transportCode = () => (isBrowserOffline() ? 'offline' : 'network')

/**
 * @param {unknown} error - anything thrown by the Firestore Lite SDK, `httpsCallable` or fetch
 * @param {{ source?: 'firestore' | 'functions' | 'users' }} [options] - `'users'` maps exactly
 *   like `'firestore'` and names the profile repository in the permission-denied event (C4.2)
 */
export function toRepositoryError(error, { source = 'firestore' } = {}) {
  if (isRepositoryError(error) || isAbortError(error)) {
    return error
  }

  const code = String(error?.code ?? '').replace(/^functions\//u, '')
  const details = error?.details ?? null
  const wrap = (safeCode, extraDetails = details) =>
    new RepositoryError(safeCode, undefined, { details: extraDetails, cause: error })

  switch (code) {
    case 'permission-denied':
    case 'unauthenticated':
      notifyPermissionDenied(source)
      return wrap('permission')
    case 'not-found':
      return wrap('not-found')
    case 'failed-precondition':
      // Functions: a revision mismatch (spec 5.9). Firestore: mostly a query whose composite index
      // is not deployed, a config fault that no reload or retry-with-revision can fix.
      return wrap(source === 'functions' ? 'conflict' : 'unavailable')
    case 'aborted':
      // Functions: this execution lost its lease (spec 5.7, R25). Firestore: transaction contention.
      return wrap('conflict', {
        ...details,
        code: source === 'functions' ? 'lock-lost' : 'aborted',
      })
    case 'invalid-argument':
      return wrap('invalid-data')
    case 'resource-exhausted':
    case 'internal':
      return wrap('unavailable')
    case 'unavailable':
    case 'deadline-exceeded':
    case 'unknown':
    case 'cancelled':
      // Firestore Lite reports every transport failure (offline, unreachable host, CSP-blocked
      // origin) as FirestoreError('unknown'): its fetch wrapper maps a response with no HTTP
      // status to UNKNOWN. `unavailable` only comes back from an HTTP 503. So `unknown` is the
      // offline/network case, split by the navigator.onLine hint (spec 11).
      return source === 'functions' ? wrap('unavailable') : wrap(transportCode())
    default:
      if (source === 'functions' && error instanceof TypeError) {
        // The lazy `firebase/functions` chunk failing to load surfaces as a TypeError. Firestore
        // Lite never throws a bare TypeError (it wraps the fetch rejection, see above), so a
        // TypeError from that source is a code defect, not a network condition.
        return wrap(transportCode())
      }
      return wrap('unavailable')
  }
}
