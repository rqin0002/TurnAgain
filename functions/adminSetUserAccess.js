import { randomUUID } from 'node:crypto'

import { Timestamp, auth as adminAuth, db, isEmulated, projectId } from './lib/admin.js'

import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { requireCaller } from './lib/authorize.js'
import { assertLiveWriteAllowed } from './lib/liveWriteGuard.js'
import { isLiveAdminAllowed } from './lib/params.js'
import { assertEnum, assertId, assertNonNegativeInt, requestData } from './lib/validate.js'

/**
 * adminSetUserAccess. An admin changes another
 * account's role or status; a call with neither is a Check. The transition is serialised per
 * target uid by a lease in accessLocks/{uid}. Firestore writes are fenced by the lease inside
 * their own transactions; Auth writes cannot be fenced, so they run only while the lease is
 * believed held (re-checked immediately before and after each) and never after it is known to be
 * lost. The reconcile sets Auth `disabled` from the profile. The role lives in users/{uid} only:
 * no custom claims.
 */

/** Longer than the 60 s timeoutSeconds, so a takeover happens only after a stall (step 1). */
export const LOCK_LEASE_MS = 90_000

const ADMIN_ROLES = ['admin']
const ROLES = ['member', 'staff', 'admin']
const STATUSES = ['active', 'disabled']

const inProgress = (retryAfterMs) =>
  new HttpsError(
    'failed-precondition',
    'Another change to this account is in progress; try again in a moment.',
    { code: 'in-progress', retryAfterMs },
  )
const revisionMismatch = (currentRevision) =>
  new HttpsError('failed-precondition', 'This account changed since you loaded it.', {
    code: 'revision-mismatch',
    currentRevision,
  })
const lockLost = (extra = {}) =>
  new HttpsError('aborted', 'A newer change took over this account.', {
    code: 'lock-lost',
    ...extra,
  })
const needsRecovery = ({ status, authDisabled }) =>
  new HttpsError('internal', 'This account may be in an inconsistent state; press Check.', {
    code: 'needs-recovery',
    status,
    authDisabled,
  })
const isLockLost = (error) => error instanceof HttpsError && error.details?.code === 'lock-lost'

/**
 * Whether the revocation of a disable is on record: Auth's tokensValidAfterTime (one-second
 * resolution) is at or after the second of the profile write that disabled the account, which
 * step 4 revokes after. An earlier value, or none, means a revokeRefreshTokens failed after its
 * updateUser succeeded, so the reconcile runs it again. An unknown or missing value revokes.
 */
const toSeconds = (ms) => Math.floor(ms / 1000)
const tokensRevokedSince = (user, updatedAt) =>
  toSeconds(Date.parse(user.tokensValidAfterTime ?? '')) >= toSeconds(updatedAt?.toMillis?.() ?? 0)

/** The step-4 signal that the lease was lost after an Auth write: the one re-acquire attempt. */
class LostAfterAuthWrite extends Error {}

/** A failure the reconcile repaired keeps its code and says so; a raw error becomes internal. */
function reconciled(error, state) {
  const extra = { reconciled: true, status: state.status, authDisabled: state.authDisabled }
  if (error instanceof HttpsError) {
    return new HttpsError(error.code, error.message, { ...error.details, ...extra })
  }
  return new HttpsError('internal', 'The access change did not complete.', extra)
}

export async function handleAdminSetUserAccess(
  request,
  {
    now = () => Date.now(),
    auth = adminAuth,
    runtime = { isEmulated, projectId },
    newHolderId = () => randomUUID(),
  } = {},
) {
  const caller = await requireCaller(request, { roles: ADMIN_ROLES })
  assertLiveWriteAllowed({ ...runtime, allowLiveAdmin: isLiveAdminAllowed() })
  const data = requestData(request)
  const uid = assertId(data.uid, 'uid')
  const role =
    data.role === undefined || data.role === null ? null : assertEnum(data.role, ROLES, 'role')
  const status =
    data.status === undefined || data.status === null
      ? null
      : assertEnum(data.status, STATUSES, 'status')
  const expectedRevision = assertNonNegativeInt(data.expectedRevision, 'expectedRevision')
  if (uid === caller.uid) {
    throw new HttpsError('permission-denied', 'You cannot change your own access.')
  }

  const userRef = db.collection('users').doc(uid)
  const lockRef = db.collection('accessLocks').doc(uid)
  if (!(await userRef.get()).exists) throw new HttpsError('not-found', 'User not found.')

  const holderId = newHolderId()
  // The last states this execution saw, for a needs-recovery answer.
  const known = { status: null, authDisabled: null }
  let authCalled = false

  const holds = (lock) =>
    lock.exists && lock.get('holderId') === holderId && lock.get('expiresAt').toMillis() > now()

  // Step 1 (and step 4's re-acquire): create the lease only if none is live; else the wait left.
  const acquire = () =>
    db.runTransaction(async (tx) => {
      const lock = await tx.get(lockRef)
      const at = now()
      if (lock.exists && lock.get('expiresAt').toMillis() > at) {
        return lock.get('expiresAt').toMillis() - at
      }
      tx.set(lockRef, {
        holderId,
        callerUid: caller.uid,
        createdAt: Timestamp.fromMillis(at),
        expiresAt: Timestamp.fromMillis(at + LOCK_LEASE_MS),
      })
      return 0
    })

  const stillHeld = () => db.runTransaction(async (tx) => holds(await tx.get(lockRef)))

  // Step 6: a lease that expired and was taken by another execution is left alone.
  const release = () =>
    db.runTransaction(async (tx) => {
      const lock = await tx.get(lockRef)
      if (lock.exists && lock.get('holderId') === holderId) tx.delete(lockRef)
    })

  // Step 3: the fenced profile write (lease held, revision unmoved), revision + 1.
  const writeProfile = (fields) =>
    db.runTransaction(async (tx) => {
      const [lock, snapshot] = await tx.getAll(lockRef, userRef)
      if (!holds(lock)) throw lockLost()
      const profile = snapshot.data()
      const currentRevision = profile.revision ?? 0
      if (currentRevision !== expectedRevision) throw revisionMismatch(currentRevision)
      tx.update(userRef, {
        ...fields,
        revision: currentRevision + 1,
        updatedAt: Timestamp.fromMillis(now()),
        ...(Array.isArray(profile.savedServiceIds) ? {} : { savedServiceIds: [] }),
      })
    })

  // Step 4: one Auth write between two lease checks; a lost lease before it skips the write.
  const authWrite = async (write, disabled) => {
    if (!(await stillHeld())) throw lockLost()
    authCalled = true
    await write()
    known.authDisabled = disabled
    if (!(await stillHeld())) throw new LostAfterAuthWrite()
  }
  const setAuthDisabled = async (disabled) => {
    await authWrite(() => auth.updateUser(uid, { disabled }), disabled)
    if (disabled) await authWrite(() => auth.revokeRefreshTokens(uid), true)
  }

  // Step 5: Auth follows the profile; the answer comes from these reads. A disabled profile whose
  // Auth account is disabled but whose tokens were not revoked since the disable (a failed
  // revokeRefreshTokens after a successful updateUser) gets the revocation here, under the lease.
  const reconcile = async () => {
    const profile = (await userRef.get()).data()
    known.status = profile.status
    authCalled = true
    const user = await auth.getUser(uid)
    known.authDisabled = user.disabled
    const disabled = profile.status === 'disabled'
    if (known.authDisabled !== disabled) await setAuthDisabled(disabled)
    else if (disabled && !tokensRevokedSince(user, profile.updatedAt)) {
      await authWrite(() => auth.revokeRefreshTokens(uid), true)
    }
    return {
      uid,
      role: profile.role,
      status: profile.status,
      revision: profile.revision ?? 0,
      authDisabled: known.authDisabled,
    }
  }

  // After an Auth call, reconcile before giving up; a failing reconcile needs a Check.
  const reconcileOrRecover = async () => {
    try {
      return await reconcile()
    } catch (error) {
      if (isLockLost(error) || error instanceof LostAfterAuthWrite) throw lockLost()
      throw needsRecovery(known)
    }
  }

  const retryAfterMs = await acquire()
  if (retryAfterMs > 0) throw inProgress(retryAfterMs)
  try {
    try {
      // A Check (neither role nor status) runs only the reconcile of step 5.
      if (role !== null || status !== null) {
        // Step 2: nothing has been written to Auth yet.
        const profile = (await userRef.get()).data()
        known.status = profile.status
        const currentRevision = profile.revision ?? 0
        if (currentRevision !== expectedRevision) throw revisionMismatch(currentRevision)
        const roleChanges = role !== null && role !== profile.role
        const statusChanges = status !== null && status !== profile.status
        // The same target state again (an idempotent retry) writes nothing.
        if (roleChanges || statusChanges) {
          const fields = { ...(role ? { role } : {}), ...(status ? { status } : {}) }
          // Enable: Auth first, then the profile; disable: the profile first, then Auth. A
          // role-only change touches Auth not at all.
          if (statusChanges && status === 'active') await setAuthDisabled(false)
          await writeProfile(fields)
          if (statusChanges && status === 'disabled') await setAuthDisabled(true)
        }
      }
      return await reconcile()
    } catch (error) {
      if (error instanceof LostAfterAuthWrite) {
        // Step 4: one create-only re-acquire; under it, reconcile and release; else stop here.
        if ((await acquire()) > 0) throw lockLost()
        const state = await reconcileOrRecover()
        throw lockLost({ reconciled: true, status: state.status, authDisabled: state.authDisabled })
      }
      if (isLockLost(error) || !authCalled) throw error
      throw reconciled(error, await reconcileOrRecover())
    }
  } finally {
    // Step 6 must not replace the answer: a release that fails leaves the lease to expire (90 s).
    try {
      await release()
    } catch (error) {
      logger.warn('adminSetUserAccess: lease release failed', { uid, reason: error.message })
    }
  }
}

export const adminSetUserAccess = onCall((request) => handleAdminSetUserAccess(request))
