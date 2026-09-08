import { getApp, getApps, initializeApp } from 'firebase/app'

/**
 * Firebase Web identifiers are public; restrict this API key to Firebase APIs.
 * Tracking this config lets a fresh checkout run without a private .env file.
 * Access still depends on Firebase Auth, Firestore Rules, and API restrictions;
 * never put service-account keys or other server credentials in this object.
 * https://firebase.google.com/docs/projects/api-keys
 */
const DEFAULT_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyB02b9MveXGa_3m4E2VgJKGF76bz4gN0dI',
  authDomain: 'fit5032-7b50f.firebaseapp.com',
  projectId: 'fit5032-7b50f',
  storageBucket: 'fit5032-7b50f.firebasestorage.app',
  messagingSenderId: '308362338146',
  appId: '1:308362338146:web:7629d332404108796cd63b',
})

/** Use a complete optional environment override, never a mix of two projects. */
const readFirebaseConfig = () => {
  const environmentConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }

  const config = Object.fromEntries(
    Object.entries(environmentConfig).map(([field, value]) => [
      field,
      typeof value === 'string' ? value.trim() : '',
    ]),
  )
  const missingFields = Object.entries(config)
    .filter(([, value]) => value === '')
    .map(([field]) => field)

  // Missing or wholly blank overrides mean the standard TurnAgain project.
  if (missingFields.length === Object.keys(config).length) {
    return DEFAULT_FIREBASE_CONFIG
  }

  if (missingFields.length > 0) {
    throw new Error(
      `Firebase environment override is incomplete (missing: ${missingFields.join(', ')}). Supply all six VITE_FIREBASE_* values, or remove the override to use the default TurnAgain project.`,
    )
  }

  return Object.freeze(config)
}

const FIREBASE_CONFIG = readFirebaseConfig()

/** Shared Firebase application instance; product SDKs initialise in their own modules. */
export const firebaseApp = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp()
