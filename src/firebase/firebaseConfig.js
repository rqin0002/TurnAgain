/**
 * Public Firebase web configuration (spec 12.2). A pure object module: no import.meta.env read,
 * so the seed can import it in Node. Firebase Web identifiers are public; access depends on
 * Firebase Auth, the Firestore rules and the API-key restrictions, never on hiding this file.
 * https://firebase.google.com/docs/projects/api-keys
 */

export const CONFIG_FIELDS = Object.freeze([
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
])

export const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyB02b9MveXGa_3m4E2VgJKGF76bz4gN0dI',
  authDomain: 'fit5032-7b50f.firebaseapp.com',
  projectId: 'fit5032-7b50f',
  storageBucket: 'fit5032-7b50f.firebasestorage.app',
  messagingSenderId: '308362338146',
  appId: '1:308362338146:web:7629d332404108796cd63b',
})

/** The project id every emulator script passes with `--project` (firebase.json singleProjectMode). */
export const EMULATOR_PROJECT_ID = 'demo-turnagain'

// Host and ports of firebase.json. They live here rather than in emulators.js because that module
// reads import.meta.env, which Node lacks; the seed connects to the emulators from these (spec 13.4).
export const EMULATOR_HOST = '127.0.0.1'
export const EMULATOR_PORTS = /* @__PURE__ */ Object.freeze({
  auth: 9099,
  firestore: 8080,
  functions: 5001,
})

// Plain literals and the pure annotation let Rollup drop this fake config from the production
// bundle. Template strings built from EMULATOR_PROJECT_ID, or a bare Object.freeze call, keep it.
export const EMULATOR_CONFIG = /* @__PURE__ */ Object.freeze({
  apiKey: 'demo-api-key',
  authDomain: 'demo-turnagain.firebaseapp.com',
  projectId: 'demo-turnagain',
  storageBucket: 'demo-turnagain.appspot.com',
  messagingSenderId: '0',
  appId: '1:0:web:demo',
})

/** Names of the fields that are missing or blank; empty when the config is complete. */
export function missingConfigFields(config) {
  return CONFIG_FIELDS.filter(
    (field) => typeof config?.[field] !== 'string' || config[field].trim() === '',
  )
}
