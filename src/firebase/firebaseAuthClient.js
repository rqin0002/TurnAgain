import { browserLocalPersistence, initializeAuth } from 'firebase/auth'

import { firebaseApp } from './firebaseClient.js'

/**
 * Shared Firebase Authentication client.
 *
 * Authentication is required during application bootstrap so the shell can
 * restore an existing session before role-aware navigation is rendered.
 * Choose the same persistence before restoration in every tab: getAuth's
 * IndexedDB-first defaults would migrate a localStorage session out and back
 * when our repository selects local persistence, briefly signing other tabs out.
 */
export const firebaseAuth = initializeAuth(firebaseApp, {
  persistence: browserLocalPersistence,
})
