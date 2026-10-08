import { getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  connectAuthEmulator,
  inMemoryPersistence,
  initializeAuth,
} from 'firebase/auth'

import { EMULATOR_HOST, EMULATOR_PORTS, useEmulators } from './emulators.js'
import { firebaseApp } from './firebaseClient.js'

const CLEANUP_APP_NAME = 'turnagain-cleanup'

const connectToEmulator = (auth) => {
  if (useEmulators) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
      disableWarnings: true,
    })
  }
}

/**
 * The app's one shared Firebase Auth instance (`firebaseAuth`), connected to the local Auth
 * emulator when VITE_USE_EMULATORS is set. It exists at import so the shell can restore a session
 * before it renders role-aware navigation. It is created with initializeAuth and
 * browserLocalPersistence rather than getAuth, so every tab restores the session from
 * localStorage; getAuth's IndexedDB-first default could move a stored session between the two
 * stores and briefly sign the other tabs out. getCleanupAuth below is the only other instance.
 */
export const firebaseAuth = initializeAuth(firebaseApp, {
  persistence: browserLocalPersistence,
})

connectToEmulator(firebaseAuth)

let cleanupAuth

/**
 * A second Auth instance, on its own app, for removing an account whose registration failed.
 * The SDK's `User.delete()` ends with `signOut()` on the instance that owns the user, so a delete
 * through the shared instance would sign out whoever holds the session by then. This instance
 * keeps its session in memory only, so nothing it signs in is persisted or seen by other tabs.
 */
export function getCleanupAuth() {
  if (!cleanupAuth) {
    const cleanupApp =
      getApps().find(({ name }) => name === CLEANUP_APP_NAME) ??
      initializeApp(firebaseApp.options, CLEANUP_APP_NAME)
    cleanupAuth = initializeAuth(cleanupApp, { persistence: inMemoryPersistence })
    connectToEmulator(cleanupAuth)
  }
  return cleanupAuth
}
