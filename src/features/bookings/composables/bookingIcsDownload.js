import { bookingIcsFileName, buildBookingIcs } from '@shared/ics.js'

import { downloadTextFile } from '@/shared/composables/downloadFile.js'

/** Shown beside the button when the browser could not build or offer the file (R-5c.36). */
export const ICS_UNAVAILABLE_MESSAGE =
  'The calendar file could not be created here. Your booking is unchanged.'

/**
 * "Add to calendar (.ics)" (spec 7.2, 7.7): the booking's file built in the browser from the same
 * `@shared/ics.js` the confirmation email attaches, offered as a download through the shared
 * `downloadTextFile` (Blob, temporary link, 40-second revoke). The time and venue come from the
 * current session when it loaded (L956), else from the booking's snapshot.
 *
 * @param {object} booking the projected booking (ISO instants)
 * @param {object | null} session the current session, or null when it did not load
 * @returns {boolean} whether the download was offered; it never throws into a click handler
 */
export function downloadBookingIcs(booking, session = null) {
  try {
    offerIcs(booking, session)
    return true
  } catch {
    return false
  }
}

function offerIcs(booking, session) {
  const current = session
    ? {
        ...booking,
        venueName: session.venueName,
        address: session.address,
        suburb: session.suburb,
        postcode: session.postcode,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      }
    : booking
  const text = buildBookingIcs(current, { stamp: new Date() })
  const offered = downloadTextFile({
    text,
    fileName: bookingIcsFileName(booking.reference),
    type: 'text/calendar;charset=utf-8',
  })
  if (!offered) {
    throw new Error('The calendar file could not be offered')
  }
}
