import { HttpsError } from 'firebase-functions/v2/https'

import { db } from './admin.js'

/**
 * The access checks of every protected callable, before anything else is read: signed in,
 * verified email, an active profile (read with the Admin SDK, which bypasses the rules, so this
 * function is the boundary) and an allowed role. Returns the caller the handlers need.
 */
export async function requireCaller(request, { roles }) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.')
  if (request.auth.token?.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Verify your email address first.')
  }
  const snap = await db.doc(`users/${request.auth.uid}`).get()
  const profile = snap.exists ? snap.data() : null
  if (!profile || profile.status !== 'active') {
    throw new HttpsError('permission-denied', 'This account is not active.')
  }
  if (!roles.includes(profile.role)) {
    throw new HttpsError('permission-denied', 'You do not have access to this action.')
  }
  return {
    uid: request.auth.uid,
    email: request.auth.token.email,
    role: profile.role,
    revision: profile.revision,
    displayName: profile.displayName,
  }
}
