import {
  initializeFirestore,
  memoryEagerGarbageCollector,
  memoryLocalCache,
} from 'firebase/firestore'

import { firebaseApp } from './firebaseClient.js'

/**
 * Shared full Cloud Firestore client for transaction-backed features.
 *
 * Rating aggregation requires `runTransaction`, so it deliberately uses the
 * full SDK. One-shot catalogue, profile, and activity operations use the
 * separate Firestore Lite client instead.
 * Keep rating documents in memory only; Cloud Firestore owns persisted data.
 */
export const firestore = initializeFirestore(firebaseApp, {
  // Release unreferenced documents promptly. This collector also gives repeated
  // module initialisation stable settings during development hot reloads.
  localCache: memoryLocalCache({ garbageCollector: memoryEagerGarbageCollector() }),
})
