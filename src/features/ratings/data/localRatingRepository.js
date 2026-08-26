import { loadLocalDatabase, updateLocalDatabase } from '../../../data/localDatabaseRepository.js'
import { buildRatingId } from '../../../data/databaseSchema.js'
import { calculateRatingSummary } from '../domain/ratingAggregate.js'
import { validateRatingInput } from '../domain/ratingValidation.js'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
const ERROR_MESSAGES = Object.freeze({
  'invalid-input': 'The rating input is invalid.',
  'service-unavailable': 'This service is not available for ratings.',
  'storage-unavailable': 'Ratings are temporarily unavailable.',
  'user-ineligible': 'Sign in with an active account to rate this service.',
})

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const cloneValue = (value) => {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

const findPublishedService = (database, serviceId) => {
  if (typeof serviceId !== 'string' || !ID_PATTERN.test(serviceId)) {
    throw new RatingRepositoryError('service-unavailable')
  }

  const service = database.collections.services.find(({ id }) => id === serviceId)
  if (service?.status !== 'published') {
    throw new RatingRepositoryError('service-unavailable')
  }
  return service
}

const findActiveProfile = (database, userId) => {
  if (typeof userId !== 'string' || !ID_PATTERN.test(userId)) {
    throw new RatingRepositoryError('user-ineligible')
  }

  const profile = database.collections.userProfiles.find(({ uid }) => uid === userId)
  if (profile?.status !== 'active') {
    throw new RatingRepositoryError('user-ineligible')
  }
  return profile
}

const getTimestamp = (now) => {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RatingRepositoryError('storage-unavailable')
  }
  return now.toISOString()
}

const mapRepositoryError = (error) => {
  if (error instanceof RatingRepositoryError) {
    throw error
  }
  throw new RatingRepositoryError('storage-unavailable')
}

const withRepositoryErrors = async (operation) => {
  try {
    return await operation()
  } catch (error) {
    return mapRepositoryError(error)
  }
}

const matchesRatingPair = (rating, serviceId, userId) =>
  rating?.serviceId === serviceId && rating.userId === userId

const migrateLegacyRatingIds = (ratings) => {
  ratings.forEach((rating) => {
    if (rating.id === `${rating.serviceId}__${rating.userId}`) {
      rating.id = buildRatingId(rating.serviceId, rating.userId)
    }
  })
}

/** Stable, non-sensitive error exposed by the local rating boundary. */
export class RatingRepositoryError extends Error {
  /**
   * @param {string} code - Supported public rating error code.
   */
  constructor(code) {
    const safeCode = Object.hasOwn(ERROR_MESSAGES, code) ? code : 'storage-unavailable'
    super(ERROR_MESSAGES[safeCode])
    this.name = 'RatingRepositoryError'
    this.code = safeCode
  }
}

/**
 * Creates the local rating repository over the shared local database boundary.
 *
 * @param {object} [dependencies]
 * @param {(options?: object) => Promise<object>} [dependencies.loadDatabase]
 * @param {(mutator: Function, options?: object) => Promise<{database: object, result: unknown}>} [dependencies.updateDatabase]
 * @param {() => Date} [dependencies.clock]
 * @param {object} [dependencies.databaseOptions]
 * @returns {{
 *   getSummary: (serviceId: string) => Promise<object>,
 *   getMyRating: (serviceId: string, userId: string) => Promise<object | null>,
 *   saveMyRating: (serviceId: string, userId: string, input: unknown) => Promise<{rating: object, summary: object}>
 * }} Public summary, current-user rating, and save operations.
 */
export function createLocalRatingRepository(dependencies = {}) {
  const settings = isPlainObject(dependencies) ? dependencies : {}
  const loadDatabase = settings.loadDatabase ?? loadLocalDatabase
  const updateDatabase = settings.updateDatabase ?? updateLocalDatabase
  const clock = settings.clock ?? (() => new Date())
  const databaseOptions = isPlainObject(settings.databaseOptions) ? settings.databaseOptions : {}

  const runLoad = () => loadDatabase(databaseOptions)
  const runUpdate = (mutator) => updateDatabase(mutator, { ...databaseOptions, clock })

  const getSummary = (serviceId) =>
    withRepositoryErrors(async () => {
      const database = await runLoad()
      findPublishedService(database, serviceId)
      return calculateRatingSummary(serviceId, database.collections.serviceRatings)
    })

  const getMyRating = (serviceId, userId) =>
    withRepositoryErrors(async () => {
      const database = await runLoad()
      findPublishedService(database, serviceId)
      findActiveProfile(database, userId)

      const rating = database.collections.serviceRatings.find(
        (candidate) =>
          matchesRatingPair(candidate, serviceId, userId) && candidate.status === 'active',
      )
      return rating === undefined ? null : cloneValue(rating)
    })

  const saveMyRating = (serviceId, userId, input) =>
    withRepositoryErrors(async () => {
      const validation = validateRatingInput(input)
      if (!validation.isValid) {
        throw new RatingRepositoryError('invalid-input')
      }

      const { database } = await runUpdate((candidate, { now }) => {
        findPublishedService(candidate, serviceId)
        // The caller passes only the UID restored by auth; form input cannot select identity or role.
        findActiveProfile(candidate, userId)

        const id = buildRatingId(serviceId, userId)
        const timestamp = getTimestamp(now)
        migrateLegacyRatingIds(candidate.collections.serviceRatings)
        const existing = candidate.collections.serviceRatings.find((rating) =>
          matchesRatingPair(rating, serviceId, userId),
        )
        if (existing === undefined) {
          candidate.collections.serviceRatings.push({
            id,
            serviceId,
            userId,
            score: validation.values.score,
            reviewText: validation.values.reviewText,
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
          })
        } else {
          existing.id = id
          existing.score = validation.values.score
          existing.reviewText = validation.values.reviewText
          existing.status = 'active'
          existing.updatedAt = timestamp
        }
      })

      const persistedRating = database.collections.serviceRatings.find(
        (rating) => matchesRatingPair(rating, serviceId, userId) && rating.status === 'active',
      )
      if (persistedRating === undefined) {
        throw new RatingRepositoryError('storage-unavailable')
      }

      return cloneValue({
        rating: persistedRating,
        summary: calculateRatingSummary(serviceId, database.collections.serviceRatings),
      })
    })

  return Object.freeze({ getSummary, getMyRating, saveMyRating })
}
