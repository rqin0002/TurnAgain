import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore/lite'

import { firebaseAuth } from '@/firebase/firebaseAuthClient.js'
import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import {
  RepositoryError,
  notifyPermissionDenied,
  toRepositoryError,
} from '@/shared/data/RepositoryError.js'
import { isPlainObject, isValidId } from '@/shared/domain/catalogueValidation.js'

import { projectRatingSummary } from '../domain/rankServices.js'
import { validateRatingInput } from '../domain/ratingValidation.js'
import { storeRatingSummary } from './ratingSummaryRepository.js'

/**
 * Ratings on Firestore Lite: the summary must pre-exist and is never reset; a
 * missing or malformed summary is `not-found` ("can't be rated yet"), never a zero.
 * Only an active member account saves a rating: the save transaction checks the profile it reads.
 * Every error is a RepositoryError; the composable renders `message`.
 */

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

// A stored note is measured in UTF-16 code units, the unit of the validator, the form's counter
// and the rules' size(), so an emoji counts as two everywhere.
const projectRating = (candidate, serviceId, userId) => {
  const createdAt = timestampMillis(candidate?.createdAt)
  const updatedAt = timestampMillis(candidate?.updatedAt)
  const validation = validateRatingInput({ score: candidate?.score })
  if (
    !hasExactFields(candidate, ['score', 'reviewText', 'status', 'createdAt', 'updatedAt']) ||
    !validation.isValid ||
    (candidate.reviewText !== null &&
      (typeof candidate.reviewText !== 'string' ||
        candidate.reviewText.length === 0 ||
        candidate.reviewText.length > 1000)) ||
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
    reviewError: validateRatingInput({ score: candidate.score, reviewText: candidate.reviewText })
      .errors.reviewText,
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  }
}

const paths = (serviceId, userId) => ({
  service: doc(firestoreLite, 'services', serviceId),
  profile: doc(firestoreLite, 'users', userId),
  rating: doc(firestoreLite, 'services', serviceId, 'ratings', userId),
  summary: doc(firestoreLite, 'services', serviceId, 'aggregates', 'rating-summary'),
})

const notRateable = () =>
  new RepositoryError('not-found', "This listing can't be rated yet.", {
    details: { code: 'no-summary' },
  })
const unavailableService = () =>
  new RepositoryError('not-found', 'This service is not available for ratings.')
const ineligible = () =>
  new RepositoryError('permission', 'Sign in with an active member account to rate this service.')
// For an active account that is not a member's (staff, admin): it is already signed in, so the
// copy says what it may not do instead of asking it to sign in.
const memberOnly = () =>
  new RepositoryError('permission', 'Only member accounts can rate services.')
const malformed = () =>
  new RepositoryError('invalid-data', 'Ratings are temporarily unavailable.', {
    details: { reason: 'stored' },
  })

const assertCaller = (userId) => {
  if (!isValidId(userId) || firebaseAuth.currentUser?.uid !== userId) {
    throw ineligible()
  }
}

/** Public aggregate for one service; Lite `getDoc` always reads from the server. */
export async function getSummary(serviceId) {
  if (!isValidId(serviceId)) {
    throw unavailableService()
  }
  try {
    const snapshot = await getDoc(paths(serviceId, '_').summary)
    const summary = snapshot.exists() ? projectRatingSummary(snapshot.data()) : null
    if (summary === null) {
      throw notRateable()
    }
    return summary
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/** The signed-in user's own rating, or null when they have not rated the service. */
export async function getMyRating(serviceId, userId) {
  if (!isValidId(serviceId)) {
    throw unavailableService()
  }
  assertCaller(userId)
  try {
    const snapshot = await getDoc(paths(serviceId, userId).rating)
    assertCaller(userId)
    if (!snapshot.exists()) {
      return null
    }
    const rating = projectRating(snapshot.data(), serviceId, userId)
    if (rating === null) {
      throw malformed()
    }
    return rating
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/** Creates or updates the caller's rating and moves the summary by the exact delta, in one transaction. */
export async function saveMyRating(serviceId, userId, input) {
  if (!isValidId(serviceId)) {
    throw unavailableService()
  }
  assertCaller(userId)
  const validation = validateRatingInput(input)
  if (!validation.isValid) {
    throw new RepositoryError('invalid-data', 'The rating input is invalid.', {
      details: { reason: 'input', fields: validation.errors },
    })
  }

  try {
    const result = await runTransaction(firestoreLite, async (transaction) => {
      const target = paths(serviceId, userId)

      // Firestore transactions require every read before the first write.
      const serviceSnapshot = await transaction.get(target.service)
      const profileSnapshot = await transaction.get(target.profile)
      const ratingSnapshot = await transaction.get(target.rating)
      const summarySnapshot = await transaction.get(target.summary)

      assertCaller(userId)
      if (!serviceSnapshot.exists() || serviceSnapshot.data().status !== 'published') {
        throw unavailableService()
      }
      // Only an active member account rates (the rules refuse anyone else as well). The profile
      // read here decides, not the role or status the page has cached: a refusal means that copy
      // is out of date, so the auth store is asked to read the profile again.
      const profile = profileSnapshot.exists() ? profileSnapshot.data() : null
      if (profile?.status !== 'active' || profile.role !== 'member') {
        notifyPermissionDenied()
        throw profile?.status === 'active' ? memberOnly() : ineligible()
      }

      const currentSummary = summarySnapshot.exists()
        ? projectRatingSummary(summarySnapshot.data())
        : null
      if (currentSummary === null) {
        throw notRateable()
      }

      const existingRating = ratingSnapshot.exists()
        ? projectRating(ratingSnapshot.data(), serviceId, userId)
        : null
      if (ratingSnapshot.exists() && existingRating === null) {
        throw malformed()
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
      const timestamp = serverTimestamp()
      const persistedRating = {
        score,
        reviewText: validation.values.reviewText,
        status: 'active',
        createdAt: existingRating?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }

      transaction.set(target.rating, persistedRating)
      transaction.update(target.summary, {
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
    // Lists read the summary through the ratings cache; keep it in step with what was just written.
    storeRatingSummary(serviceId, result.summary)
    return result
  } catch (error) {
    throw toRepositoryError(error)
  }
}
