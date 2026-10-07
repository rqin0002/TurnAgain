/**
 * The one written form of a venue's place: the booking email's Where line and the LOCATION of both
 * calendar files read it from here, so the email and its attachment always describe the same place.
 * Pure. A part that is absent or blank is left out together with its separator, because a stored
 * venue may lack a field and the word "undefined" must never reach a member's inbox or calendar.
 */

const partText = (part) => String(part ?? '').trim()

/** "Clayton Community Centre, 9-15 Cooke Street, Clayton 3168"; empty when no part is present. */
export function formatVenueLine({ venueName, address, suburb, postcode }) {
  const locality = [suburb, postcode].map(partText).filter(Boolean).join(' ')
  return [partText(venueName), partText(address), locality].filter(Boolean).join(', ')
}
