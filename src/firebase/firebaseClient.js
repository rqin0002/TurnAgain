import { getApp, getApps, initializeApp } from 'firebase/app'

/**
 * Read Firebase's public web-client identifiers from the local Vite
 * environment. Vite still exposes `VITE_` values to the browser at runtime, as
 * Firebase requires, but keeping concrete project values out of tracked source
 * prevents accidental repository disclosure and keeps environments swappable.
 * Firebase Auth, Firestore Rules, and provider-side API restrictions remain the
 * actual authorization boundaries.
 */
const readFirebaseConfig = () => {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }

  const missingFields = Object.entries(config)
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([field]) => field)

  if (missingFields.length > 0) {
    throw new Error(
      `Firebase client configuration is incomplete. Add ${missingFields.join(', ')} to an untracked .env file.`,
    )
  }

  return Object.freeze(config)
}

const FIREBASE_CONFIG = readFirebaseConfig()

/** Shared Firebase application instance; product SDKs initialise in their own modules. */
export const firebaseApp = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp()
