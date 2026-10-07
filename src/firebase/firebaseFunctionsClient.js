import { firebaseApp } from './firebaseClient.js'
import { EMULATOR_HOST, EMULATOR_PORTS } from './emulators.js'

/**
 * Where callable functions run for this build (spec 5.9 / A6).
 * 'cloud'    -> the deployed functions in australia-southeast1
 * 'emulator' -> the local Functions emulator on 127.0.0.1:5001
 * 'off'      -> callables are not available; controls show a configuration notice
 * The value comes from the committed Vite mode files (.env.development, .env.emulator,
 * .env.production, added in milestone 2); with none present it defaults to 'off'.
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
