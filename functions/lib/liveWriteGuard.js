import { HttpsError } from 'firebase-functions/v2/https'

/**
 * A guard for the callables that write across users (promoteNextBooking, adminSetUserAccess).
 * `npm run functions:dev` starts the Functions emulator against the real project's Firestore and
 * Auth, and `npm run dev` points the app at it, so a promotion or an access change made there
 * would be a live write. This refuses such a call when it runs in the emulator against any
 * project other than demo-turnagain, unless ALLOW_LIVE_ADMIN is '1'. Deployed functions are not
 * emulated, so the guard never blocks them.
 */
export const EMULATOR_PROJECT_ID = 'demo-turnagain'
export const LIVE_WRITE_DISABLED = 'live-admin-disabled'

export function assertLiveWriteAllowed({ isEmulated, projectId, allowLiveAdmin }) {
  if (isEmulated && projectId !== EMULATOR_PROJECT_ID && !allowLiveAdmin) {
    throw new HttpsError(
      'failed-precondition',
      'Admin changes against the live project are disabled in development mode.',
      { code: LIVE_WRITE_DISABLED },
    )
  }
}
