import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'

import { firebaseAuth } from '../../../firebase/firebaseAuthClient.js'
import {
  validateLoginInput,
  validatePasswordResetInput,
  validateRegistrationInput,
} from '../domain/authValidation.js'
import { AuthError } from './AuthError.js'

const ALLOWED_ROLES = new Set(['member', 'staff', 'admin'])
const NON_DISCLOSING_RESET_CODES = new Set([
  'auth/invalid-credential',
  'auth/user-disabled',
  'auth/user-not-found',
])

const DEFAULT_AUTH_API = Object.freeze({
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
})

let defaultFirestoreContextPromise = null

/**
 * Loads profile storage only when an authenticated identity needs Firestore.
 * Anonymous application bootstrap therefore avoids downloading the larger
 * Firestore SDK while authenticated restoration, login and registration keep
 * the same profile-validation boundary.
 */
const loadDefaultFirestoreContext = () => {
  if (defaultFirestoreContextPromise === null) {
    defaultFirestoreContextPromise = Promise.all([
      import('firebase/firestore/lite'),
      import('../../../firebase/firebaseFirestoreLiteClient.js'),
    ])
      .then(([firestoreApi, { firestoreLite }]) =>
        Object.freeze({
          db: firestoreLite,
          firestoreApi: Object.freeze({
            doc: firestoreApi.doc,
            getDoc: firestoreApi.getDoc,
            serverTimestamp: firestoreApi.serverTimestamp,
            runTransaction: firestoreApi.runTransaction,
          }),
        }),
      )
      .catch((error) => {
        defaultFirestoreContextPromise = null
        throw error
      })
  }

  return defaultFirestoreContextPromise
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getExactPassword = (input) =>
  isPlainObject(input) && typeof input.password === 'string' ? input.password : ''

const normalizeEmail = (value) =>
  typeof value === 'string' ? value.trim().toLocaleLowerCase('en-AU') : ''

const mapFirebaseAuthError = (error) => {
  if (error instanceof AuthError) {
    return error
  }

  if (error?.code === 'auth/email-already-in-use') {
    return new AuthError('email-in-use')
  }

  if (
    error?.code === 'auth/invalid-credential' ||
    error?.code === 'auth/user-not-found' ||
    error?.code === 'auth/wrong-password' ||
    error?.code === 'auth/user-disabled'
  ) {
    return new AuthError('invalid-credentials')
  }

  return new AuthError('unexpected')
}

const mapPasswordResetError = (error) => {
  if (error instanceof AuthError) {
    return error
  }

  if (error?.code === 'auth/invalid-email' || error?.code === 'auth/missing-email') {
    return new AuthError('invalid-input')
  }

  return new AuthError('recovery-unavailable')
}

const projectPublicProfile = (snapshot, firebaseUser) => {
  if (!snapshot.exists()) {
    return null
  }

  const profile = snapshot.data()
  const firebaseEmail = normalizeEmail(firebaseUser.email)
  if (
    !isPlainObject(profile) ||
    profile.uid !== firebaseUser.uid ||
    normalizeEmail(profile.email) !== firebaseEmail ||
    typeof profile.displayName !== 'string' ||
    profile.displayName.length === 0 ||
    !ALLOWED_ROLES.has(profile.role) ||
    profile.status !== 'active'
  ) {
    return null
  }

  return Object.freeze({
    uid: profile.uid,
    email: firebaseEmail,
    displayName: profile.displayName,
    role: profile.role,
  })
}

/**
 * Creates the Firebase authentication repository used by the Pinia auth store.
 * Dependencies remain injectable so this boundary can be verified without
 * contacting a real Firebase project.
 *
 * @param {object} [dependencies]
 * @returns {{
 *   initialize: () => Promise<object | null>,
 *   register: (input: unknown) => Promise<object>,
 *   login: (input: unknown) => Promise<object>,
 *   requestPasswordReset: (input: unknown) => Promise<null>,
 *   logout: () => Promise<null>,
 *   restoreSession: () => Promise<object | null>,
 *   subscribeToSessionChanges: (listener: (uid: string | null) => void) => () => void
 * }} Repository matching the existing auth-store contract.
 */
export function createFirebaseAuthRepository(dependencies = {}) {
  const settings = isPlainObject(dependencies) ? dependencies : {}
  const auth = settings.auth ?? firebaseAuth
  const authApi = settings.authApi ?? DEFAULT_AUTH_API
  const injectedDb = settings.db ?? null
  const injectedFirestoreApi = settings.firestoreApi ?? null

  let initializationPromise = null
  let firestoreContextPromise = null

  const getFirestoreContext = () => {
    if (firestoreContextPromise === null) {
      if (injectedDb !== null && injectedFirestoreApi !== null) {
        firestoreContextPromise = Promise.resolve({
          db: injectedDb,
          firestoreApi: injectedFirestoreApi,
        })
      } else {
        firestoreContextPromise = loadDefaultFirestoreContext()
          .then((defaults) => ({
            db: injectedDb ?? defaults.db,
            firestoreApi: injectedFirestoreApi ?? defaults.firestoreApi,
          }))
          .catch((error) => {
            firestoreContextPromise = null
            throw error
          })
      }
    }

    return firestoreContextPromise
  }

  const loadProfile = async (firebaseUser, invalidProfileCode, completeRegistration = false) => {
    let snapshot
    try {
      const { db, firestoreApi } = await getFirestoreContext()
      const profileRef = firestoreApi.doc(db, 'users', firebaseUser.uid)
      snapshot = await firestoreApi.getDoc(profileRef)

      if (!snapshot.exists() && completeRegistration) {
        // Only an explicit sign-in/sign-up may finish an interrupted registration.
        // Create-if-absent also lets concurrent tabs reuse the winning profile;
        // existing disabled, malformed or privileged profiles are never replaced.
        await firestoreApi.runTransaction(db, async (transaction) => {
          const current = await transaction.get(profileRef)
          if (auth.currentUser?.uid !== firebaseUser.uid) {
            throw new AuthError('session-expired')
          }
          if (current.exists()) {
            return
          }

          const name =
            typeof firebaseUser.displayName === 'string' ? firebaseUser.displayName.trim() : ''
          const timestamp = firestoreApi.serverTimestamp()
          transaction.set(profileRef, {
            uid: firebaseUser.uid,
            email: normalizeEmail(firebaseUser.email),
            displayName: name && Array.from(name).length <= 50 ? name : 'Member',
            role: 'member',
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
          })
        })
        snapshot = await firestoreApi.getDoc(profileRef)
      }
    } catch (error) {
      throw mapFirebaseAuthError(error)
    }

    // A cross-tab sign-out/account change can finish during the profile read.
    // Never restore that stale identity or sign out its replacement account.
    if (auth.currentUser?.uid !== firebaseUser.uid) {
      throw new AuthError('session-expired')
    }

    const profile = projectPublicProfile(snapshot, firebaseUser)
    if (profile !== null) {
      return profile
    }

    // A Firebase credential without a matching active profile has no role in
    // this application. End that session before returning a generic failure.
    try {
      await authApi.signOut(auth)
    } catch {
      // Pinia still fails closed if remote sign-out cannot finish while offline.
    }
    throw new AuthError(invalidProfileCode)
  }

  const waitForInitialUser = () =>
    new Promise((resolve, reject) => {
      let unsubscribe = () => undefined
      const onNext = (user) => {
        unsubscribe()
        resolve(user)
      }
      const onError = (error) => {
        unsubscribe()
        reject(error)
      }

      unsubscribe = authApi.onAuthStateChanged(auth, onNext, onError)
    })

  const initialize = () => {
    if (initializationPromise === null) {
      initializationPromise = (async () => {
        try {
          await authApi.setPersistence(auth, authApi.browserLocalPersistence)
          await waitForInitialUser()
        } catch (error) {
          initializationPromise = null
          throw mapFirebaseAuthError(error)
        }
      })()
    }

    // Cache SDK readiness, not a user's profile. A recreated store must read
    // the current identity rather than the account present at first bootstrap.
    return initializationPromise.then(restoreSession)
  }

  const restoreSession = async () => {
    const firebaseUser = auth.currentUser
    return firebaseUser === null || firebaseUser === undefined
      ? null
      : loadProfile(firebaseUser, 'session-expired')
  }

  const subscribeToSessionChanges = (listener) => {
    // Deliver the initial snapshot as well: the identity can change between a
    // completed profile read and this subscription. The store ignores a
    // snapshot that already matches its settled user, so no extra read is needed.
    let previousUid
    return authApi.onAuthStateChanged(auth, (firebaseUser) => {
      const uid = firebaseUser?.uid ?? null
      if (uid !== previousUid) {
        previousUid = uid
        listener(uid)
      }
    })
  }

  const login = async (input) => {
    const validation = validateLoginInput(input)
    const password = getExactPassword(input)
    if (!validation.isValid) {
      throw new AuthError('invalid-input')
    }

    let firebaseUser
    try {
      const credential = await authApi.signInWithEmailAndPassword(
        auth,
        validation.values.email,
        password,
      )
      firebaseUser = credential.user
    } catch (error) {
      throw mapFirebaseAuthError(error)
    }

    return loadProfile(firebaseUser, 'invalid-credentials', true)
  }

  const register = async (input) => {
    const validation = validateRegistrationInput(input)
    const password = getExactPassword(input)
    if (!validation.isValid) {
      throw new AuthError('invalid-input')
    }

    let firebaseUser
    try {
      const credential = await authApi.createUserWithEmailAndPassword(
        auth,
        validation.values.email,
        password,
      )
      firebaseUser = credential.user

      await authApi.updateProfile(firebaseUser, {
        displayName: validation.values.displayName,
      })

      return await loadProfile(firebaseUser, 'invalid-credentials', true)
    } catch (error) {
      if (firebaseUser !== undefined) {
        // A failed response may follow a successful profile commit. Keep the
        // identity so sign-in can safely finish setup instead of deleting it.
        if (auth.currentUser?.uid === firebaseUser.uid) {
          try {
            await authApi.signOut(auth)
          } catch {
            // A later sign-in retries completion; restoration never creates data.
          }
        }
        throw new AuthError('registration-incomplete')
      }
      throw mapFirebaseAuthError(error)
    }
  }

  const requestPasswordReset = async (input) => {
    const validation = validatePasswordResetInput(input)
    if (!validation.isValid) {
      throw new AuthError('invalid-input')
    }

    try {
      await authApi.sendPasswordResetEmail(auth, validation.values.email)
    } catch (error) {
      // A reset request must never confirm whether an account exists or is
      // disabled. The UI presents the same success state for these outcomes.
      if (NON_DISCLOSING_RESET_CODES.has(error?.code)) {
        return null
      }
      throw mapPasswordResetError(error)
    }

    return null
  }

  const logout = async () => {
    try {
      await authApi.signOut(auth)
      return null
    } catch (error) {
      throw mapFirebaseAuthError(error)
    }
  }

  return Object.freeze({
    initialize,
    register,
    login,
    requestPasswordReset,
    logout,
    restoreSession,
    subscribeToSessionChanges,
  })
}
