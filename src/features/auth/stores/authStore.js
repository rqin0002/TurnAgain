import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'

import { AuthError } from '../data/AuthError.js'
import { createFirebaseAuthRepository } from '../data/firebaseAuthRepository.js'

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
 *   requestPasswordReset: (input: unknown) => Promise<null>,
 *   logout: () => Promise<null>,
 *   restoreSession: () => Promise<object | null>,
 *   subscribeToSessionChanges?: (listener: (uid: string | null) => void) => () => void
 * }} repository - Authentication operations; the default runtime uses Firebase.
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
    let unsubscribeSession = null
    // Undefined means no pending event; null is an observed signed-out session.
    let pendingSessionUid
    let disposed = false
    const sessionWaiters = new Set()

    const enqueueRepositoryOperation = (operation) => {
      const queued = repositoryOperationQueue.then(operation, operation)
      repositoryOperationQueue = queued.catch(() => undefined)
      return queued
    }

    const commitUser = (candidate) => {
      const publicUser = projectPublicUser(candidate)
      if (pendingSessionUid !== undefined && pendingSessionUid !== (publicUser?.uid ?? null)) {
        // A newer SDK identity takes precedence over an older command result.
        // Keep privileged/private UI empty until that profile is validated.
        user.value = null
        status.value = pendingSessionUid === null ? 'anonymous' : 'restoring'
        return null
      }
      user.value = publicUser
      status.value = publicUser === null ? 'anonymous' : 'authenticated'
      if (pendingSessionUid === (publicUser?.uid ?? null)) {
        // Our login/register/logout already reconciled this SDK event. A newer
        // different identity must remain pending for a separate profile read.
        pendingSessionUid = undefined
      }
      return publicUser
    }

    const copyCurrentUser = () => projectPublicUser(user.value)

    const resolveSessionWaiters = () => {
      if (!disposed && (operationStatus.value !== 'idle' || status.value === 'restoring')) {
        return
      }
      for (const resolve of sessionWaiters) {
        resolve(disposed ? null : copyCurrentUser())
      }
      sessionWaiters.clear()
    }

    const waitForStableSession = () =>
      new Promise((resolve) => {
        sessionWaiters.add(resolve)
        resolveSessionWaiters()
      })

    const refreshChangedSession = () => {
      if (disposed || pendingSessionUid === undefined || operationStatus.value !== 'idle') {
        return
      }
      pendingSessionUid = undefined
      void runUserOperation('restoreSession', 'restoring-session')
    }

    const observeSession = () => {
      if (disposed || unsubscribeSession !== null || !repository.subscribeToSessionChanges) {
        return
      }
      unsubscribeSession = repository.subscribeToSessionChanges((uid) => {
        if (disposed) {
          return
        }
        if (
          uid === (user.value?.uid ?? null) &&
          (status.value === 'authenticated' || status.value === 'anonymous')
        ) {
          // Firebase can deliver an operation's observer event after its
          // promise resolves. Do not re-enter restoration for settled state.
          return
        }
        // Clear private UI immediately. Profile restoration shares the command
        // queue so our own registration can finish creating its member profile.
        user.value = null
        status.value = uid === null ? 'anonymous' : 'restoring'
        pendingSessionUid = uid
        refreshChangedSession()
      })
    }

    const initialize = () => {
      if (initialized) {
        return waitForStableSession()
      }
      if (initializationPromise !== null) {
        return initializationPromise.then(waitForStableSession)
      }

      const operation = ++latestOperation
      status.value = 'restoring'
      errorMessage.value = ''
      initializationPromise = (async () => {
        try {
          const restored = await enqueueRepositoryOperation(() => repository.initialize())
          initialized = true
          observeSession()
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
          initializationPromise = null
        }

        return null
      })()

      return initializationPromise.then(waitForStableSession)
    }

    const runUserOperation = async (method, pendingStatus, input) => {
      const operation = ++latestOperation
      const isSessionRefresh = method === 'restoreSession'
      operationStatus.value = pendingStatus
      if (!isSessionRefresh) {
        errorMessage.value = ''
      }
      const reportError = (error) => {
        // Background reconciliation must not erase the failed command's
        // message before the originating form/account page can display it.
        if (!isSessionRefresh || !errorMessage.value) {
          errorMessage.value = getPublicErrorMessage(error)
        }
      }

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
          initialized = true
          observeSession()
          commitUser(outcome.user)
          return copyCurrentUser()
        }

        if (outcome.kind === 'operation-failed') {
          commitUser(outcome.restoredUser)
          reportError(outcome.operationError)
          return null
        }

        commitUser(null)
        reportError(outcome.restoreError)
        return null
      } catch (error) {
        if (operation === latestOperation) {
          commitUser(null)
          reportError(error)
        }
        return null
      } finally {
        if (operation === latestOperation) {
          operationStatus.value = 'idle'
          refreshChangedSession()
          resolveSessionWaiters()
        }
      }
    }

    const register = (input) => runUserOperation('register', 'registering', input)
    const login = (input) => runUserOperation('login', 'logging-in', input)

    const requestPasswordReset = async (input) => {
      const operation = ++latestOperation
      operationStatus.value = 'requesting-password-reset'
      errorMessage.value = ''

      try {
        // Password recovery does not create an application session, so it
        // deliberately bypasses runUserOperation's session-restoration path.
        await enqueueRepositoryOperation(() => repository.requestPasswordReset(input))
        return operation === latestOperation
      } catch (error) {
        if (operation === latestOperation) {
          errorMessage.value = getPublicErrorMessage(error)
        }
        return false
      } finally {
        if (operation === latestOperation) {
          operationStatus.value = 'idle'
          refreshChangedSession()
          resolveSessionWaiters()
        }
      }
    }

    const logout = async () => {
      const operation = ++latestOperation
      operationStatus.value = 'logging-out'
      errorMessage.value = ''

      try {
        await enqueueRepositoryOperation(() => repository.logout())
        if (operation === latestOperation) {
          commitUser(null)
          return true
        }
      } catch (error) {
        if (operation === latestOperation) {
          errorMessage.value = getPublicErrorMessage(error)
        }
      } finally {
        if (operation === latestOperation) {
          operationStatus.value = 'idle'
          refreshChangedSession()
          resolveSessionWaiters()
        }
      }

      return false
    }

    onScopeDispose(() => {
      disposed = true
      ++latestOperation
      unsubscribeSession?.()
      resolveSessionWaiters()
    })

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
      requestPasswordReset,
      register,
      status,
      user,
    }
  })
}

export const useAuthStore = createAuthStore(createFirebaseAuthRepository())
