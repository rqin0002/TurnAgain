import { HttpsError } from 'firebase-functions/v2/https'

/**
 * The development-mode guard. `npm run functions:dev` starts the Functions emulator against the
 * real project's Firestore and Auth (the .firebaserc default), and `npm run dev` points the app at
 * it, so a call made there would act on live data and real people. A call is blocked when it runs
 * in the emulator against any project other than demo-turnagain, unless ALLOW_LIVE_ADMIN is '1'.
 * Deployed functions are not emulated, so the guard never changes them.
 *
 * The callables that write across users (promoteNextBooking, adminSetUserAccess) refuse a blocked
 * call; the two email functions (sendBookingEmail, sendSessionEmail) answer it as a dry run, so no
 * email leaves a development session whatever EMAIL_DRY_RUN the project's env file sets.
 */
export const EMULATOR_PROJECT_ID = 'demo-turnagain'
export const LIVE_WRITE_DISABLED = 'live-admin-disabled'

/** True when this runtime is the Functions emulator pointed at a real project, not opted in. */
export function isLiveWriteBlocked({ isEmulated, projectId, allowLiveAdmin }) {
  return isEmulated && projectId !== EMULATOR_PROJECT_ID && !allowLiveAdmin
}

export function assertLiveWriteAllowed(runtime) {
  if (isLiveWriteBlocked(runtime)) {
    throw new HttpsError(
      'failed-precondition',
      'Admin changes against the live project are disabled in development mode.',
      { code: LIVE_WRITE_DISABLED },
    )
  }
}
