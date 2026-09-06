import { getFirestore } from 'firebase/firestore'

import { firebaseApp } from './firebaseClient.js'

/**
 * Shared full Cloud Firestore client for transaction-backed features.
 *
 * Rating aggregation requires `runTransaction`, so it deliberately uses the
 * full SDK. One-shot catalogue, profile, and activity operations use the
 * separate Firestore Lite client instead.
 */
export const firestore = getFirestore(firebaseApp)
