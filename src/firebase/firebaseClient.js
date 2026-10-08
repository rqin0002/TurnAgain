import { getApp, getApps, initializeApp } from 'firebase/app'

import { EMULATOR_CONFIG, FIREBASE_CONFIG, missingConfigFields } from './firebaseConfig.js'
import { useEmulators } from './emulators.js'

const config = useEmulators ? EMULATOR_CONFIG : FIREBASE_CONFIG

/**
 * This module picks the emulator or the real Firebase configuration (VITE_USE_EMULATORS) and
 * exports the one shared `firebaseApp` the Auth, Firestore and Functions clients build on.
 * `firebaseConfigProblem` is empty when that configuration has every required field; otherwise
 * it names the missing ones, logs them once, and App.vue shows the message instead of the page.
 * initializeApp itself does not throw for a missing field, but the Auth client (no apiKey) and
 * the Firestore client (no projectId) do, at import, so for those two fields the app stops before
 * the shell can show this message.
 */
export const firebaseConfigProblem = (() => {
  const missing = missingConfigFields(config)
  if (missing.length === 0) {
    return ''
  }
  const message = `Firebase configuration is incomplete (missing: ${missing.join(', ')}).`
  console.warn(message)
  return message
})()

/** Shared Firebase application instance; product SDKs initialise in their own modules. */
export const firebaseApp = getApps().length === 0 ? initializeApp(config) : getApp()
