import { FieldPath, Timestamp, db, isEmulated, projectId } from './lib/admin.js'

import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { requireCaller } from './lib/authorize.js'
import { assertLiveWriteAllowed } from './lib/liveWriteGuard.js'
import { isLiveAdminAllowed } from './lib/params.js'
import { assertId, requestData } from './lib/validate.js'

/**
 * promoteNextBooking. Staff or admin only. The whole
 * decision runs in one Admin transaction on the session document, so two concurrent promotions
 * serialise: the second re-runs against the updated counters and either promotes the next person
 * or is refused with `no-free-place`. The earliest `waitlistedAt` wins and the document id breaks a
 * tie (the committed composite index). The writes match the member counter write of the rules
 * (status re-derived from the counters; `revision` and `cancellationNoticeAt` never written), so
 * every later member write on the session still passes the validator. It binds no secret: the
 * staff page asks sendBookingEmail for the `promoted` email afterwards.
 */

const STAFF_ROLES = ['staff', 'admin']
const OPEN_STATUSES = ['scheduled', 'full']

// The refusal code travels in details.code, where the client branches.
const refused = (code, message) => new HttpsError('failed-precondition', message, { code })

export async function handlePromoteNextBooking(
  request,
  { now = Timestamp.now(), runtime = { isEmulated, projectId } } = {},
) {
  await requireCaller(request, { roles: STAFF_ROLES })
  assertLiveWriteAllowed({ ...runtime, allowLiveAdmin: isLiveAdminAllowed() })
  const sessionId = assertId(requestData(request).sessionId, 'sessionId')
  const sessionRef = db.collection('activitySessions').doc(sessionId)

  return db.runTransaction(async (tx) => {
    const s = (await tx.get(sessionRef)).data()
    if (!s) throw new HttpsError('not-found', 'Session not found.')
    if (
      s.registrationType !== 'turnagain' ||
      !OPEN_STATUSES.includes(s.status) ||
      s.startsAt.toMillis() <= now.toMillis()
    ) {
      throw refused('session-not-open', 'This session is not open for promotion.')
    }
    if (s.bookedCount >= s.capacity) {
      throw refused('no-free-place', 'There is no free place in this session.')
    }
    if (s.waitlistCount <= 0) {
      throw refused('no-waitlist', 'Nobody is on the waitlist for this session.')
    }
    const next = await tx.get(
      db
        .collection('bookings')
        .where('sessionId', '==', sessionId)
        .where('status', '==', 'waitlisted')
        .orderBy('waitlistedAt', 'asc')
        .orderBy(FieldPath.documentId(), 'asc')
        .limit(1),
    )
    if (next.empty) {
      throw refused('counter-mismatch', 'The waitlist count does not match the bookings.')
    }
    const [booking] = next.docs
    const bookedCount = s.bookedCount + 1
    const waitlistCount = s.waitlistCount - 1
    tx.update(booking.ref, { status: 'confirmed', promotedAt: now, updatedAt: now })
    tx.update(sessionRef, {
      bookedCount,
      waitlistCount,
      status: bookedCount === s.capacity ? 'full' : 'scheduled',
      updatedAt: now,
    })
    return {
      bookingId: booking.id,
      reference: booking.get('reference'),
      bookedCount,
      waitlistCount,
    }
  })
}

// firebase-functions 7.4.0 calls the handler as handler(request, response); the arrow keeps the
// response object out of the injectable second parameter (`.run()` calls the same arrow).
export const promoteNextBooking = onCall((request) => handlePromoteNextBooking(request))
