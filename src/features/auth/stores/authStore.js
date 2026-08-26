import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { AuthError } from '../data/AuthError.js'
import { createLocalAuthRepository } from '../data/localAuthRepository.js'

const AUTH_STORE_ID = 'auth'
const ALLOWED_ROLES = new Set(['member', 'staff', 'admin'])

const projectPublicUser = (candidate) => {
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate) ||
    typeof candidate.uid !== 'string' ||
    typeof candidate.email !== 'string' ||
    typeof candidate.displayName !== 'string' ||
    !ALLOWED_ROLES.has(candidate.role)
  ) {
    return null
  }

  return Object.freeze({
    uid: candidate.uid,
    email: candidate.email,
    displayName: candidate.displayName,
    role: candidate.role,
  })
}

const getPublicErrorMessage = (error) =>
  error instanceof AuthError ? error.message : new AuthError('unexpected').message

/**
 * Creates a Pinia auth-store definition around an injectable repository contract.
 *
 * @param {{
 *   initialize: () => Promise<object | null>,
 *   register: (input: unknown) => Promise<object>,
 *   login: (input: unknown) => Promise<object>,
 *   logout: () => Promise<null>,
 *   restoreSession: () => Promise<object | null>
 * }} repository - Authentication operations; the default runtime uses the local adapter.
 * @returns {ReturnType<typeof defineStore>} A `useAuthStore(pinia?)` function.
 */
export function createAuthStore(repository) {
  return defineStore(AUTH_STORE_ID, () => {
    const user = ref(null)
    const status = ref('idle')
    const operationStatus = ref('idle')
    const errorMessage = ref('')
    const isAuthenticated = computed(() => user.value !== null)

    let initialized = false
    let initializationPromise = null
    let latestOperation = 0
    let repositoryOperationQueue = Promise.resolve()

    const enqueueRepositoryOperation = (operation) => {
      const queued = repositoryOperationQueue.then(operation, operation)
      repositoryOperationQueue = queued.catch(() => undefined)
      return queued
    }

    const commitUser = (candidate) => {
      const publicUser = projectPublicUser(candidate)
      user.value = publicUser
      status.value = publicUser === null ? 'anonymous' : 'authenticated'
      return publicUser
    }

    const copyCurrentUser = () => projectPublicUser(user.value)

    const initialize = () => {
      if (initialized) {
        return Promise.resolve(copyCurrentUser())
      }
      if (initializationPromise !== null) {
        return initializationPromise
      }

      const operation = ++latestOperation
      status.value = 'restoring'
      errorMessage.value = ''
      initializationPromise = (async () => {
        try {
          const restored = await enqueueRepositoryOperation(() => repository.initialize())
          if (operation === latestOperation) {
            commitUser(restored)
            return copyCurrentUser()
          }
        } catch (error) {
          if (operation === latestOperation) {
            user.value = null
            status.value = 'anonymous'
            errorMessage.value = getPublicErrorMessage(error)
          }
        } finally {
          initialized = true
        }

        return null
      })()

      return initializationPromise
    }

    const runUserOperation = async (method, pendingStatus, input) => {
      const operation = ++latestOperation
      operationStatus.value = pendingStatus
      errorMessage.value = ''

      try {
        const outcome = await enqueueRepositoryOperation(async () => {
          try {
            return { kind: 'success', user: await repository[method](input) }
          } catch (operationError) {
            try {
              // Keep the authoritative read inside this queue command so later intents cannot overtake it.
              const restoredUser = await repository.restoreSession()
              return { kind: 'operation-failed', operationError, restoredUser }
            } catch (restoreError) {
              return { kind: 'restore-failed', restoreError }
            }
          }
        })

        if (operation !== latestOperation) {
          return null
        }

        if (outcome.kind === 'success') {
          commitUser(outcome.user)
          return copyCurrentUser()
        }

        if (outcome.kind === 'operation-failed') {
          commitUser(outcome.restoredUser)
          errorMessage.value = getPublicErrorMessage(outcome.operationError)
          return null
        }

        commitUser(null)
        errorMessage.value = getPublicErrorMessage(outcome.restoreError)
        return null
      } catch (error) {
        if (operation === latestOperation) {
          commitUser(null)
          errorMessage.value = getPublicErrorMessage(error)
        }
        return null
      } finally {
        if (operation === latestOperation) {
          operationStatus.value = 'idle'
        }
      }
    }

    const register = (input) => runUserOperation('register', 'registering', input)
    const login = (input) => runUserOperation('login', 'logging-in', input)

    const logout = async () => {
      const operation = ++latestOperation
      operationStatus.value = 'logging-out'
      errorMessage.value = ''

      try {
        await enqueueRepositoryOperation(() => repository.logout())
      } catch (error) {
        if (operation === latestOperation) {
          errorMessage.value = getPublicErrorMessage(error)
        }
      } finally {
        // In-memory state fails closed; persistent revocation still depends on sessionStorage.
        if (operation === latestOperation) {
          user.value = null
          status.value = 'anonymous'
          operationStatus.value = 'idle'
        }
      }

      return null
    }

    const hasAnyRole = (roles) =>
      user.value !== null &&
      Array.isArray(roles) &&
      roles.some((role) => ALLOWED_ROLES.has(role) && role === user.value.role)

    return {
      errorMessage,
      hasAnyRole,
      initialize,
      isAuthenticated,
      login,
      logout,
      operationStatus,
      register,
      status,
      user,
    }
  })
}

/** Shared runtime auth store backed by the local Firebase-ready adapter. */
export const useAuthStore = createAuthStore(createLocalAuthRepository())
