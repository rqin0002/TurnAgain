import { getApp, getApps, initializeApp } from 'firebase/app'

import { EMULATOR_CONFIG, FIREBASE_CONFIG, missingConfigFields } from './firebaseConfig.js'
import { useEmulators } from './emulators.js'

const config = useEmulators ? EMULATOR_CONFIG : FIREBASE_CONFIG

/**
 * Empty when the selected configuration is complete. Never throws at import: a problem is
 * logged once here and the app shell renders it (StatePanel) instead of a blank page.
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
