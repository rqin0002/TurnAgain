import { computed, onBeforeUnmount, ref, toValue, watch } from 'vue'

import { useAuthStore } from '../../auth/stores/authStore.js'
import {
  RatingRepositoryError,
  createFirestoreRatingRepository,
} from '../data/firestoreRatingRepository.js'

const GENERIC_RATING_ERROR = 'Ratings are temporarily unavailable.'
const runtimeRatingRepository = createFirestoreRatingRepository()
const pendingWritesByRepository = new WeakMap()

const getSafeErrorMessage = (error) =>
  error instanceof RatingRepositoryError ? error.message : GENERIC_RATING_ERROR

const isValidRepositoryResult = (result) =>
  result !== null &&
  typeof result === 'object' &&
  result.rating !== null &&
  typeof result.rating === 'object' &&
  result.summary !== null &&
  typeof result.summary === 'object'

/**
 * Coordinates public rating summaries with auth-bound private rating reads and writes.
 * Repository work is not cancelled; generation guards prevent stale work from changing the UI.
 *
 * @param {object} options
 * @param {import('vue').MaybeRefOrGetter<string>} options.serviceId Canonical resolved service ID.
 * @param {object} [options.authStore] Injectable Pinia-compatible authentication store.
 * @param {object} [options.repository] Injectable rating repository.
 * @returns {{
 *   formKey: import('vue').ComputedRef<string>,
 *   isSaving: import('vue').ComputedRef<boolean>,
 *   myRating: import('vue').Ref<object | null>,
 *   privateErrorMessage: import('vue').Ref<string>,
 *   privateStatus: import('vue').Ref<string>,
 *   reloadMyRating: () => Promise<void>,
 *   reloadSummary: () => Promise<void>,
 *   saveRating: (input: unknown) => Promise<object | null>,
 *   successMessage: import('vue').Ref<string>,
 *   summary: import('vue').Ref<object | null>,
 *   summaryErrorMessage: import('vue').Ref<string>,
 *   summaryStatus: import('vue').Ref<string>
 * }} Reactive public and current-user rating state.
 */
export function useServiceRatings({ serviceId, authStore, repository } = {}) {
  const resolvedAuthStore = authStore ?? useAuthStore()
  const resolvedRepository = repository ?? runtimeRatingRepository
  let pendingWrites = pendingWritesByRepository.get(resolvedRepository)
  if (!pendingWrites) {
    pendingWrites = new Map()
    pendingWritesByRepository.set(resolvedRepository, pendingWrites)
  }
  const currentServiceId = computed(() => {
    const value = toValue(serviceId)
    return typeof value === 'string' ? value : ''
  })
  const currentUserId = computed(() => {
    const value = resolvedAuthStore.user?.uid
    return typeof value === 'string' ? value : ''
  })
  const authReady = ref(false)
  const hasPrivateAccess = computed(
    () =>
      authReady.value &&
      currentServiceId.value !== '' &&
      resolvedAuthStore.status === 'authenticated' &&
      resolvedAuthStore.operationStatus === 'idle' &&
      currentUserId.value !== '',
  )

  const summary = ref(null)
  const summaryStatus = ref('idle')
  const summaryErrorMessage = ref('')
  const myRating = ref(null)
  const privateStatus = ref('idle')
  const privateErrorMessage = ref('')
  const successMessage = ref('')
  const isSaving = computed(() => privateStatus.value === 'saving')
  const formKey = computed(() =>
    hasPrivateAccess.value ? `${currentServiceId.value}:${currentUserId.value}` : '',
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
    privateErrorMessage.value = ''
    successMessage.value = ''
    privateStatus.value = nextStatus
  }

  const waitForPendingWrites = async (requestedServiceId, isCurrent) => {
    // Remounted views must read after every queued write to this service settles.
    while (pendingWrites.has(requestedServiceId)) {
      // The originating save owns its error; failed writes still unlock reads.
      await pendingWrites.get(requestedServiceId).catch(() => undefined)
      if (!isCurrent()) {
        return false
      }
    }
    return isCurrent()
  }

  const loadSummary = async () => {
    const requestedServiceId = currentServiceId.value
    const generation = ++publicGeneration
    summary.value = null
    summaryErrorMessage.value = ''

    if (requestedServiceId === '') {
      summaryStatus.value = 'idle'
      return
    }

    summaryStatus.value = 'loading'
    try {
      if (
        !(await waitForPendingWrites(requestedServiceId, () =>
          isPublicCurrent(generation, requestedServiceId),
        ))
      ) {
        return
      }
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
      summaryErrorMessage.value = getSafeErrorMessage(error)
      summaryStatus.value = 'error'
    }
  }

  const loadMyRating = async () => {
    const requestedServiceId = currentServiceId.value
    const requestedUserId = currentUserId.value
    const generation = ++privateGeneration
    clearPrivateState('loading')

    if (!hasPrivateAccess.value) {
      privateStatus.value =
        authReady.value &&
        resolvedAuthStore.status === 'anonymous' &&
        resolvedAuthStore.operationStatus === 'idle'
          ? 'anonymous'
          : 'waiting-for-auth'
      return
    }

    try {
      if (
        !(await waitForPendingWrites(requestedServiceId, () =>
          isPrivateCurrent(generation, requestedServiceId, requestedUserId),
        ))
      ) {
        return
      }
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
      privateErrorMessage.value = getSafeErrorMessage(error)
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
    privateErrorMessage.value = ''
    successMessage.value = ''

    try {
      const previousWrite = pendingWrites.get(requestedServiceId)
      const write = () =>
        resolvedRepository.saveMyRating(requestedServiceId, requestedUserId, input)
      const operation = previousWrite
        ? previousWrite
            .catch(() => undefined)
            .then(() => {
              // A queued intent may outlive its service, identity, or mounted form.
              return isPrivateCurrent(generation, requestedServiceId, requestedUserId)
                ? write()
                : null
            })
        : write()
      const pendingWrite = Promise.resolve(operation).finally(() => {
        if (pendingWrites.get(requestedServiceId) === pendingWrite) {
          pendingWrites.delete(requestedServiceId)
        }
      })
      pendingWrites.set(requestedServiceId, pendingWrite)

      const result = await pendingWrite
      if (!isPrivateCurrent(generation, requestedServiceId, requestedUserId)) {
        return null
      }
      if (!isValidRepositoryResult(result)) {
        throw new Error('Invalid rating repository result')
      }

      myRating.value = result.rating
      ++publicGeneration
      summary.value = result.summary
      summaryErrorMessage.value = ''
      summaryStatus.value = 'ready'
      successMessage.value = wasUpdate ? 'Your rating was updated.' : 'Your rating was submitted.'
      privateStatus.value = 'ready'
      return result
    } catch (error) {
      if (isPrivateCurrent(generation, requestedServiceId, requestedUserId)) {
        privateErrorMessage.value = getSafeErrorMessage(error)
        privateStatus.value = 'ready'
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
    [
      currentServiceId,
      () => resolvedAuthStore.status,
      () => resolvedAuthStore.operationStatus,
      currentUserId,
      authReady,
    ],
    () => {
      if (hasPrivateAccess.value) {
        void loadMyRating()
        return
      }

      ++privateGeneration
      clearPrivateState(
        authReady.value &&
          resolvedAuthStore.status === 'anonymous' &&
          resolvedAuthStore.operationStatus === 'idle'
          ? 'anonymous'
          : 'waiting-for-auth',
      )
    },
    { flush: 'sync', immediate: true },
  )

  try {
    Promise.resolve(resolvedAuthStore.initialize()).then(
      () => {
        if (!disposed) {
          authReady.value = true
        }
      },
      () => undefined,
    )
  } catch {
    // Auth owns its public error state; rating reads remain private until eligibility is restored.
  }

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
    privateErrorMessage,
    privateStatus,
    reloadMyRating,
    reloadSummary,
    saveRating,
    successMessage,
    summary,
    summaryErrorMessage,
    summaryStatus,
  }
}
