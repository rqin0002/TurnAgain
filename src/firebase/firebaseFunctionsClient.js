import { firebaseApp } from './firebaseClient.js'
import { EMULATOR_HOST, EMULATOR_PORTS } from './emulators.js'

/**
 * Where this build sends callable Cloud Function requests, from VITE_FUNCTIONS_TARGET (set per
 * Vite mode in .env.development, .env.emulator and .env.production):
 *   'cloud'    -> the australia-southeast1 functions of the configured Firebase project
 *   'emulator' -> the local Functions emulator (EMULATOR_HOST, EMULATOR_PORTS.functions)
 *   anything else or unset -> off: callFunction refuses with details.code 'functions-off' and
 *                 the callable-backed controls show CapabilityNotice instead
 * `capabilities.functions` only says this build may call them, not that they are deployed or
 * reachable. Auth and Firestore follow the separate VITE_USE_EMULATORS flag.
 */
const target = import.meta.env.VITE_FUNCTIONS_TARGET ?? 'off'

export const capabilities = Object.freeze({
  functions: target === 'cloud' || target === 'emulator',
  functionsTarget: target,
})

let instance

/** Lazily initialises the Functions SDK so public pages never download it. */
export async function getFunctionsClient() {
  const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions')
  if (!instance) {
    instance = getFunctions(firebaseApp, 'australia-southeast1')
    if (target === 'emulator')
      connectFunctionsEmulator(instance, EMULATOR_HOST, EMULATOR_PORTS.functions)
  }
  return instance
}
