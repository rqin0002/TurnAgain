import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore/lite'

import { EMULATOR_HOST, EMULATOR_PORTS, useEmulators } from './emulators.js'
import { firebaseApp } from './firebaseClient.js'

/**
 * Shared Firestore Lite client: one-shot reads, `runTransaction` and
 * `writeBatch` without realtime listeners or the full SDK's local cache.
 */
export const firestoreLite = getFirestore(firebaseApp)

if (useEmulators) {
  connectFirestoreEmulator(firestoreLite, EMULATOR_HOST, EMULATOR_PORTS.firestore)
}
