import { computed, onBeforeUnmount, ref, toValue, watch } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { isRepositoryError } from '@/shared/data/RepositoryError.js'

import { getMyRating, getSummary, saveMyRating } from '../data/firestoreRatingRepository.js'

const GENERIC_RATING_ERROR = 'Ratings are temporarily unavailable.'
const runtimeRatingRepository = Object.freeze({ getSummary, getMyRating, saveMyRating })

const getSafeErrorMessage = (error) =>
  isRepositoryError(error) ? error.message : GENERIC_RATING_ERROR

/** The code and copy a view renders (StatePanel offline for the connection codes). */
const toPrivateError = (error) => ({
  code: isRepositoryError(error) ? error.code : 'unavailable',
  message: getSafeErrorMessage(error),
})

/**
 * True for the repository's "no summary" refusal: the service has no valid rating summary, so the
 * listing cannot be rated. The page says so and offers no Retry, because rereading cannot create
 * a summary; a later visit reads it again. The repository's other not-found (a missing or
 * unpublished service) is shown as an ordinary error.
 */
const isUnrateable = (error) =>
  isRepositoryError(error) && error.code === 'not-found' && error.details?.code === 'no-summary'

const isValidRepositoryResult = (result) =>
  result !== null &&
  typeof result === 'object' &&
  result.rating !== null &&
  typeof result.rating === 'object' &&
  result.summary !== null &&
  typeof result.summary === 'object'

/**
 * Coordinates the public rating summary with the signed-in member's own rating for one service.
 * Reads follow the auth store's `status`, `user` and `identityEpoch`: private state
 * waits while the store restores, is anonymous when nobody is signed in, and reloads when the
 * identity changes under the same account. Repository work is not cancelled; generation guards
 * keep stale work from changing the UI. Writes go straight to the repository (no
 * pending-write queue); the summary a save returns replaces the public one.
 *
 * @param {object} options
 * @param {import('vue').MaybeRefOrGetter<string>} options.serviceId Canonical resolved service ID.
 * @param {object} [options.authStore] Injectable store with `status`, `user`, `identityEpoch`.
 * @param {object} [options.repository] Injectable rating repository.
 * @returns {{
 *   formKey: import('vue').ComputedRef<string>,
 *   isSaving: import('vue').ComputedRef<boolean>,
 *   myRating: import('vue').Ref<object | null>,
 *   privateError: import('vue').Ref<{ code: string, message: string } | null>,
 *   privateErrorMessage: import('vue').Ref<string>,
 *   privateStatus: import('vue').Ref<'idle' | 'waiting-for-auth' | 'anonymous' | 'loading' | 'ready' | 'saving' | 'error'>,
 *   reloadMyRating: () => Promise<void>,
 *   reloadSummary: () => Promise<void>,
 *   saveRating: (input: unknown) => Promise<object | null>,
 *   successMessage: import('vue').Ref<string>,
 *   summary: import('vue').Ref<object | null>,
 *   summaryError: import('vue').Ref<{ code: string, message: string } | null>,
 *   summaryErrorMessage: import('vue').ComputedRef<string>,
 *   summaryStatus: import('vue').Ref<'idle' | 'loading' | 'ready' | 'unrateable' | 'error'>
 * }} Reactive public and current-user rating state.
 */
export function useServiceRatings({ serviceId, authStore, repository } = {}) {
  const resolvedAuthStore = authStore ?? useAuthStore()
  const resolvedRepository = repository ?? runtimeRatingRepository
  const currentServiceId = computed(() => {
    const value = toValue(serviceId)
    return typeof value === 'string' ? value : ''
  })
  const currentUserId = computed(() => {
    const value = resolvedAuthStore.user?.uid
    return typeof value === 'string' ? value : ''
  })
  const identityEpoch = computed(() =>
    Number.isInteger(resolvedAuthStore.identityEpoch) ? resolvedAuthStore.identityEpoch : 0,
  )
  const hasPrivateAccess = computed(
    () =>
      currentServiceId.value !== '' &&
      resolvedAuthStore.status === 'signed-in' &&
      currentUserId.value !== '',
  )
  // Restoring is the only state that may still become signed-in without the user acting.
  const idlePrivateStatus = () =>
    resolvedAuthStore.status === 'restoring' ? 'waiting-for-auth' : 'anonymous'

  const summary = ref(null)
  const summaryStatus = ref('idle')
  const summaryError = ref(null)
  const summaryErrorMessage = computed(() => summaryError.value?.message ?? '')
  const myRating = ref(null)
  const privateStatus = ref('idle')
  const privateError = ref(null)
  const privateErrorMessage = ref('')
  const successMessage = ref('')
  const isSaving = computed(() => privateStatus.value === 'saving')
  const formKey = computed(() =>
    hasPrivateAccess.value
      ? `${currentServiceId.value}:${currentUserId.value}:${identityEpoch.value}`
      : '',
  )

  let disposed = false
  let publicGeneration = 0
  let privateGeneration = 0
  let activeSaveGeneration = null

  const isPublicCurrent = (generation, requestedServiceId) =>
    !disposed && generation === publicGeneration && requestedServiceId === currentServiceId.value

  const isPrivateCurrent = (generation, requestedServiceId, requestedUserId) =>
    !disposed &&
    generation === privateGeneration &&
    hasPrivateAccess.value &&
    requestedServiceId === currentServiceId.value &&
    requestedUserId === currentUserId.value

  const clearPrivateState = (nextStatus) => {
    myRating.value = null
    privateError.value = null
    privateErrorMessage.value = ''
    successMessage.value = ''
    privateStatus.value = nextStatus
  }

  const loadSummary = async () => {
    const requestedServiceId = currentServiceId.value
    const generation = ++publicGeneration
    summary.value = null
    summaryError.value = null

    if (requestedServiceId === '') {
      summaryStatus.value = 'idle'
      return
    }

    summaryStatus.value = 'loading'
    try {
      const result = await resolvedRepository.getSummary(requestedServiceId)
      if (!isPublicCurrent(generation, requestedServiceId)) {
        return
      }
      summary.value = result
      summaryStatus.value = 'ready'
    } catch (error) {
      if (!isPublicCurrent(generation, requestedServiceId)) {
        return
      }
      summary.value = null
      summaryError.value = {
        code: isRepositoryError(error) ? error.code : 'unavailable',
        message: getSafeErrorMessage(error),
      }
      summaryStatus.value = isUnrateable(error) ? 'unrateable' : 'error'
    }
  }

  const loadMyRating = async () => {
    const requestedServiceId = currentServiceId.value
    const requestedUserId = currentUserId.value
    const generation = ++privateGeneration
    clearPrivateState('loading')

    if (!hasPrivateAccess.value) {
      privateStatus.value = idlePrivateStatus()
      return
    }

    try {
      const result = await resolvedRepository.getMyRating(requestedServiceId, requestedUserId)
      if (!isPrivateCurrent(generation, requestedServiceId, requestedUserId)) {
        return
      }
      myRating.value = result
      privateStatus.value = 'ready'
    } catch (error) {
      if (!isPrivateCurrent(generation, requestedServiceId, requestedUserId)) {
        return
      }
      myRating.value = null
      privateError.value = toPrivateError(error)
      privateErrorMessage.value = privateError.value.message
      privateStatus.value = 'error'
    }
  }

  const reloadSummary = () => loadSummary()
  const reloadMyRating = () => loadMyRating()

  const saveRating = async (input) => {
    const requestedServiceId = currentServiceId.value
    const requestedUserId = currentUserId.value
    const generation = privateGeneration

    if (
      !hasPrivateAccess.value ||
      privateStatus.value !== 'ready' ||
      activeSaveGeneration === generation
    ) {
      return null
    }

    const wasUpdate = myRating.value !== null
    activeSaveGeneration = generation
    privateStatus.value = 'saving'
    privateError.value = null
    privateErrorMessage.value = ''
    successMessage.value = ''

    try {
      const result = await resolvedRepository.saveMyRating(
        requestedServiceId,
        requestedUserId,
        input,
      )
      if (!isPrivateCurrent(generation, requestedServiceId, requestedUserId)) {
        return null
      }
      if (!isValidRepositoryResult(result)) {
        throw new Error('Invalid rating repository result')
      }

      myRating.value = result.rating
      ++publicGeneration
      summary.value = result.summary
      summaryError.value = null
      summaryStatus.value = 'ready'
      successMessage.value = wasUpdate ? 'Your rating was updated.' : 'Your rating was submitted.'
      privateStatus.value = 'ready'
      return result
    } catch (error) {
      if (isPrivateCurrent(generation, requestedServiceId, requestedUserId)) {
        privateError.value = toPrivateError(error)
        privateErrorMessage.value = privateError.value.message
        privateStatus.value = 'ready'
        if (isUnrateable(error)) {
          // The save found no valid summary to update: the listing cannot be rated. The public
          // panel says so and the rating form is hidden until a later visit reads the summary
          // again.
          ++publicGeneration
          summary.value = null
          summaryError.value = { code: error.code, message: error.message }
          summaryStatus.value = 'unrateable'
        }
      }
      return null
    } finally {
      if (activeSaveGeneration === generation) {
        activeSaveGeneration = null
      }
    }
  }

  watch(currentServiceId, loadSummary, { flush: 'sync', immediate: true })
  watch(
    [currentServiceId, () => resolvedAuthStore.status, currentUserId, identityEpoch],
    () => {
      if (hasPrivateAccess.value) {
        void loadMyRating()
        return
      }

      ++privateGeneration
      clearPrivateState(idlePrivateStatus())
    },
    { flush: 'sync', immediate: true },
  )

  onBeforeUnmount(() => {
    disposed = true
    ++publicGeneration
    ++privateGeneration
    activeSaveGeneration = null
    clearPrivateState('idle')
  })

  return {
    formKey,
    isSaving,
    myRating,
    privateError,
    privateErrorMessage,
    privateStatus,
    reloadMyRating,
    reloadSummary,
    saveRating,
    successMessage,
    summary,
    summaryError,
    summaryErrorMessage,
    summaryStatus,
  }
}
