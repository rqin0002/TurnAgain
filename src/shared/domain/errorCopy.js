/**
 * The one line every surface shows for a failure it cannot name, and the reader of the two error
 * classes' user-facing messages. Duck-typed on `name`, so a view or a component,
 * which never imports a data layer (`views-no-data`, `components-no-data`), renders an
 * AuthError or a RepositoryError without knowing either class.
 */

export const GENERIC_FAILURE = 'Something went wrong. Try again in a moment.'

const NAMED_ERRORS = new Set(['AuthError', 'RepositoryError'])

/**
 * @param {unknown} error - anything rejected by a store action or a repository
 * @returns {string} the error's own message for an AuthError or RepositoryError, else GENERIC_FAILURE
 */
export function describeError(error) {
  return NAMED_ERRORS.has(error?.name) && typeof error.message === 'string' && error.message !== ''
    ? error.message
    : GENERIC_FAILURE
}

/** The codes that get the connection wording. */
export const CONNECTION_ERROR_CODES = Object.freeze(['offline', 'network'])

export const isConnectionError = (error) => CONNECTION_ERROR_CODES.includes(error?.code)
