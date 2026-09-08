import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'

import { firebaseAuth } from '../../../firebase/firebaseAuthClient.js'
import { firestore } from '../../../firebase/firebaseFirestoreClient.js'
import { validateRatingInput } from '../domain/ratingValidation.js'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
const ERROR_MESSAGES = Object.freeze({
  'invalid-input': 'The rating input is invalid.',
  'service-unavailable': 'This service is not available for ratings.',
  'storage-unavailable': 'Ratings are temporarily unavailable.',
  'user-ineligible': 'Sign in with an active account to rate this service.',
})

const DEFAULT_FIRESTORE_API = Object.freeze({ doc, getDoc, runTransaction, serverTimestamp })

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isValidId = (value) => typeof value === 'string' && ID_PATTERN.test(value)

const timestampMillis = (value) => {
  try {
    const millis = value?.toMillis?.()
    return typeof millis === 'number' && Number.isFinite(millis) ? millis : null
  } catch {
    return null
  }
}

const hasExactFields = (candidate, fields) =>
  isPlainObject(candidate) &&
  Object.keys(candidate).length === fields.length &&
  fields.every((field) => Object.hasOwn(candidate, field))

const projectSummary = (candidate) => {
  if (
    !hasExactFields(candidate, ['ratingCount', 'ratingSum', 'histogram', 'updatedAt']) ||
    timestampMillis(candidate.updatedAt) === null ||
    !Number.isInteger(candidate.ratingCount) ||
    candidate.ratingCount < 0 ||
    candidate.ratingCount > 1000000 ||
    !Number.isInteger(candidate.ratingSum) ||
    candidate.ratingSum < 0 ||
    !Array.isArray(candidate.histogram) ||
    candidate.histogram.length !== 5 ||
    !candidate.histogram.every((count) => Number.isInteger(count) && count >= 0) ||
    candidate.histogram.reduce((total, count) => total + count, 0) !== candidate.ratingCount ||
    candidate.histogram.reduce((total, count, index) => total + count * (index + 1), 0) !==
      candidate.ratingSum
  ) {
    return null
  }

  return {
    ratingCount: candidate.ratingCount,
    ratingSum: candidate.ratingSum,
    averageRating: candidate.ratingCount === 0 ? null : candidate.ratingSum / candidate.ratingCount,
    histogram: {
      1: candidate.histogram[0],
      2: candidate.histogram[1],
      3: candidate.histogram[2],
      4: candidate.histogram[3],
      5: candidate.histogram[4],
    },
  }
}

const projectRating = (candidate, serviceId, userId) => {
  const createdAt = timestampMillis(candidate?.createdAt)
  const updatedAt = timestampMillis(candidate?.updatedAt)
  const validation = validateRatingInput({
    score: candidate?.score,
  })
  if (
    !hasExactFields(candidate, ['score', 'reviewText', 'status', 'createdAt', 'updatedAt']) ||
    !validation.isValid ||
    (candidate.reviewText !== null &&
      (typeof candidate.reviewText !== 'string' ||
        candidate.reviewText.length === 0 ||
        Array.from(candidate.reviewText).length > 1000)) ||
    candidate.status !== 'active' ||
    createdAt === null ||
    updatedAt === null ||
    createdAt > updatedAt
  ) {
    return null
  }

  return {
    serviceId,
    userId,
    score: candidate.score,
    reviewText: candidate.reviewText,
    // Preserve bounded legacy text for the owner to correct explicitly. New
    // writes still use full validation; never silently strip stored content.
    reviewError: validateRatingInput({
      score: candidate.score,
      reviewText: candidate.reviewText,
    }).errors.reviewText,
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  }
}

/** Stable, non-sensitive error exposed by the Firestore rating boundary. */
export class RatingRepositoryError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(ERROR_MESSAGES, code) ? code : 'storage-unavailable'
    super(ERROR_MESSAGES[safeCode])
    this.name = 'RatingRepositoryError'
    this.code = safeCode
  }
}

const mapRepositoryError = (error) =>
  error instanceof RatingRepositoryError ? error : new RatingRepositoryError('storage-unavailable')

/**
 * Creates a Firestore rating repository with public aggregate reads and
 * current-user-only private rating operations.
 */
export function createFirestoreRatingRepository(dependencies = {}) {
  const settings = isPlainObject(dependencies) ? dependencies : {}
  const auth = settings.auth ?? firebaseAuth
  const db = settings.db ?? firestore
  const firestoreApi = settings.firestoreApi ?? DEFAULT_FIRESTORE_API

  const getPaths = (serviceId, userId) => ({
    service: firestoreApi.doc(db, 'services', serviceId),
    profile: firestoreApi.doc(db, 'users', userId),
    rating: firestoreApi.doc(db, 'services', serviceId, 'ratings', userId),
    summary: firestoreApi.doc(db, 'services', serviceId, 'aggregates', 'rating-summary'),
  })

  const getSummary = async (serviceId) => {
    if (!isValidId(serviceId)) {
      throw new RatingRepositoryError('service-unavailable')
    }

    try {
      const snapshot = await firestoreApi.getDoc(getPaths(serviceId, '_').summary)
      const summary = snapshot.exists() ? projectSummary(snapshot.data()) : null
      if (summary === null) {
        throw new RatingRepositoryError('service-unavailable')
      }
      return summary
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  const getMyRating = async (serviceId, userId) => {
    if (!isValidId(serviceId)) {
      throw new RatingRepositoryError('service-unavailable')
    }
    if (!isValidId(userId) || auth.currentUser?.uid !== userId) {
      throw new RatingRepositoryError('user-ineligible')
    }

    try {
      const snapshot = await firestoreApi.getDoc(getPaths(serviceId, userId).rating)
      if (auth.currentUser?.uid !== userId) {
        throw new RatingRepositoryError('user-ineligible')
      }
      if (!snapshot.exists()) {
        return null
      }

      const rating = projectRating(snapshot.data(), serviceId, userId)
      if (rating === null) {
        throw new RatingRepositoryError('storage-unavailable')
      }
      return rating
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  const saveMyRating = async (serviceId, userId, input) => {
    if (!isValidId(serviceId)) {
      throw new RatingRepositoryError('service-unavailable')
    }
    if (!isValidId(userId) || auth.currentUser?.uid !== userId) {
      throw new RatingRepositoryError('user-ineligible')
    }

    const validation = validateRatingInput(input)
    if (!validation.isValid) {
      throw new RatingRepositoryError('invalid-input')
    }

    try {
      return await firestoreApi.runTransaction(db, async (transaction) => {
        const paths = getPaths(serviceId, userId)

        // Firestore transactions require every read before the first write.
        const serviceSnapshot = await transaction.get(paths.service)
        const profileSnapshot = await transaction.get(paths.profile)
        const ratingSnapshot = await transaction.get(paths.rating)
        const summarySnapshot = await transaction.get(paths.summary)

        if (auth.currentUser?.uid !== userId) {
          throw new RatingRepositoryError('user-ineligible')
        }

        if (!serviceSnapshot.exists() || serviceSnapshot.data().status !== 'published') {
          throw new RatingRepositoryError('service-unavailable')
        }
        if (!profileSnapshot.exists() || profileSnapshot.data().status !== 'active') {
          throw new RatingRepositoryError('user-ineligible')
        }

        const currentSummary = summarySnapshot.exists()
          ? projectSummary(summarySnapshot.data())
          : null
        if (currentSummary === null) {
          throw new RatingRepositoryError('storage-unavailable')
        }

        const existingRating = ratingSnapshot.exists()
          ? projectRating(ratingSnapshot.data(), serviceId, userId)
          : null
        if (ratingSnapshot.exists() && existingRating === null) {
          throw new RatingRepositoryError('storage-unavailable')
        }

        const score = validation.values.score
        const previousScore = existingRating?.score ?? null
        const histogram = [1, 2, 3, 4, 5].map(
          (bucket) =>
            currentSummary.histogram[bucket] +
            (score === bucket ? 1 : 0) -
            (previousScore === bucket ? 1 : 0),
        )
        const ratingCount = currentSummary.ratingCount + (existingRating === null ? 1 : 0)
        const ratingSum = currentSummary.ratingSum + score - (previousScore ?? 0)
        const timestamp = firestoreApi.serverTimestamp()
        const persistedRating = {
          score,
          reviewText: validation.values.reviewText,
          status: 'active',
          createdAt: existingRating?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }

        transaction.set(paths.rating, persistedRating)
        transaction.update(paths.summary, {
          ratingCount,
          ratingSum,
          histogram,
          updatedAt: timestamp,
        })

        return {
          rating: { serviceId, userId, ...persistedRating },
          summary: {
            ratingCount,
            ratingSum,
            averageRating: ratingSum / ratingCount,
            histogram: {
              1: histogram[0],
              2: histogram[1],
              3: histogram[2],
              4: histogram[3],
              5: histogram[4],
            },
          },
        }
      })
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  return Object.freeze({ getSummary, getMyRating, saveMyRating })
}
