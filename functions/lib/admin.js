import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldPath, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'

/**
 * The only place that initialises the Admin SDK and sets the global function options (spec 5.1).
 * Every function module imports this file first: onCall/onRequest read the global options when
 * they are defined, so a setGlobalOptions placed in index.js would run after the imports it
 * follows. Sized to stay inside the Blaze free tier (spec 1.3): three instances, 256 MiB, 60 s.
 */
setGlobalOptions({
  region: 'australia-southeast1',
  maxInstances: 3,
  memory: '256MiB',
  timeoutSeconds: 60,
})

const app = initializeApp()

export const db = getFirestore(app)
export const auth = getAuth(app)
export { FieldPath, FieldValue, Timestamp }

/** Cloud Functions and `firebase emulators:exec` both supply FIREBASE_CONFIG; the env vars are the fallback. */
export const projectId =
  app.options.projectId ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? ''

export const isEmulated = process.env.FUNCTIONS_EMULATOR === 'true'
