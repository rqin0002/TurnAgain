import { getFirestore } from 'firebase/firestore/lite'

import { firebaseApp } from './firebaseClient.js'

/**
 * Shared Firestore Lite client for bounded one-shot catalogue reads and
 * profile reads/writes.
 *
 * These operations do not use realtime listeners or managed offline
 * persistence. Keeping them on the REST-only Lite SDK avoids loading the full
 * Firestore runtime until a feature genuinely requires it.
 */
export const firestoreLite = getFirestore(firebaseApp)
