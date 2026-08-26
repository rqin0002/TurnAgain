import { LocalDatabaseError, loadLocalDatabase } from '../../../data/localDatabaseRepository.js'

/**
 * Error raised when the public discovery catalogue cannot be loaded.
 */
export class ServiceCatalogueError extends Error {
  /**
   * @param {string} message - Stable public failure description.
   * @param {object} [details]
   * @param {'network' | 'http' | 'invalid-data'} [details.code] - Public diagnostic code.
   * @param {number} [details.status] - HTTP status when available.
   * @param {unknown} [details.cause] - Original network error only.
   */
  constructor(message, { code, status, cause } = {}) {
    super(message)
    this.name = 'ServiceCatalogueError'
    this.code = code

    if (status !== undefined) {
      this.status = status
    }

    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

const toServiceCatalogueError = (error) => {
  if (error.code === 'seed-network') {
    return new ServiceCatalogueError('The service catalogue could not be reached.', {
      code: 'network',
      cause: error.cause,
    })
  }

  if (error.code === 'seed-http') {
    return new ServiceCatalogueError('The service catalogue is temporarily unavailable.', {
      code: 'http',
      status: error.status,
    })
  }

  // Storage and schema messages may describe private local state. Discovery
  // intentionally collapses them into one public data error at this boundary.
  return new ServiceCatalogueError('The service catalogue has an unexpected structure.', {
    code: 'invalid-data',
  })
}

/**
 * Loads the public discovery catalogue through the validated local database boundary.
 *
 * @param {object} [options]
 * @param {string} [options.url] - Versioned public database endpoint.
 * @param {typeof fetch} [options.fetchImpl] - Injectable fetch implementation.
 * @param {Storage} [options.localStorage] - Injectable browser storage.
 * @param {AbortSignal} [options.signal] - Optional request cancellation signal.
 * @returns {Promise<{ metadata: object, services: object[] }>} Discovery-compatible catalogue.
 * @throws {ServiceCatalogueError} When loading the public catalogue fails.
 */
export async function fetchServiceCatalogue(options = {}) {
  try {
    const database = await loadLocalDatabase(options)

    return {
      metadata: database.dataset.catalogue,
      // The public catalogue boundary never exposes draft or archived records,
      // including when an empty search requests every current option.
      services: database.collections.services.filter(({ status }) => status === 'published'),
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }

    if (error instanceof LocalDatabaseError) {
      throw toServiceCatalogueError(error)
    }

    throw new ServiceCatalogueError('The service catalogue has an unexpected structure.', {
      code: 'invalid-data',
    })
  }
}
