/**
 * Emulator wiring flag (spec 12.2). The mode files set VITE_USE_EMULATORS; the host and ports are
 * re-exported from the pure firebaseConfig.js so the SPA clients keep one import for all three.
 */
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === '1'
export { EMULATOR_HOST, EMULATOR_PORTS } from './firebaseConfig.js'
