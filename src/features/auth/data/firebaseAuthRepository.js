import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

import { firebaseAuth, firestore } from '../../../firebase/firebaseClient.js'
import { validateLoginInput, validateRegistrationInput } from '../domain/authValidation.js'
import { AuthError } from './AuthError.js'

const ALLOWED_ROLES = new Set(['member', 'staff', 'admin'])

const DEFAULT_AUTH_API = Object.freeze({
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
})

const DEFAULT_FIRESTORE_API = Object.freeze({ doc, getDoc, serverTimestamp, setDoc })

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
 *   logout: () => Promise<null>,
 *   restoreSession: () => Promise<object | null>
 * }} Repository matching the existing auth-store contract.
 */
export function createFirebaseAuthRepository(dependencies = {}) {
  const settings = isPlainObject(dependencies) ? dependencies : {}
  const auth = settings.auth ?? firebaseAuth
  const db = settings.db ?? firestore
  const authApi = settings.authApi ?? DEFAULT_AUTH_API
  const firestoreApi = settings.firestoreApi ?? DEFAULT_FIRESTORE_API

  let initializationPromise = null

  const loadProfile = async (firebaseUser, invalidProfileCode) => {
    let snapshot
    try {
      snapshot = await firestoreApi.getDoc(firestoreApi.doc(db, 'users', firebaseUser.uid))
    } catch (error) {
      throw mapFirebaseAuthError(error)
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
          const firebaseUser = await waitForInitialUser()
          return firebaseUser === null ? null : await loadProfile(firebaseUser, 'session-expired')
        } catch (error) {
          throw mapFirebaseAuthError(error)
        }
      })()
    }

    return initializationPromise
  }

  const restoreSession = async () => {
    const firebaseUser = auth.currentUser
    return firebaseUser === null || firebaseUser === undefined
      ? null
      : loadProfile(firebaseUser, 'session-expired')
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

    return loadProfile(firebaseUser, 'invalid-credentials')
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

      const timestamp = firestoreApi.serverTimestamp()
      await firestoreApi.setDoc(firestoreApi.doc(db, 'users', firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: normalizeEmail(firebaseUser.email),
        displayName: validation.values.displayName,
        role: 'member',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    } catch (error) {
      if (firebaseUser !== undefined) {
        try {
          await authApi.deleteUser(firebaseUser)
        } catch {
          // The original failure remains authoritative. A future sign-in also
          // fails closed because the incomplete identity has no valid profile.
        }
      }
      throw mapFirebaseAuthError(error)
    }

    return Object.freeze({
      uid: firebaseUser.uid,
      email: normalizeEmail(firebaseUser.email),
      displayName: validation.values.displayName,
      role: 'member',
    })
  }

  const logout = async () => {
    try {
      await authApi.signOut(auth)
      return null
    } catch (error) {
      throw mapFirebaseAuthError(error)
    }
  }

  return Object.freeze({ initialize, register, login, logout, restoreSession })
}
