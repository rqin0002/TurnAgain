import { HttpsError } from 'firebase-functions/v2/https'

/**
 * The development-mode guard of spec 5.7 (A7), shared by every callable that writes across users
 * (decision M6-D10): under `npm run dev` the Functions emulator runs against the real project, so a
 * promotion or an access change would be a live write. Refused unless ALLOW_LIVE_ADMIN is '1'.
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
