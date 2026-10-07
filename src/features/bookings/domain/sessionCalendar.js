import { melbourneDayKey } from '@shared/melbourneTime.js'

import { hasKnownCapacity } from '@/features/activities/domain/sessionSchema.js'
import { formatTime } from '@/shared/domain/formatDate.js'

import {
  hasStarted,
  isFullOrQueued,
  isLimited,
  isLiveBooking,
  remainingPlaces,
  WAITLIST_LIMIT,
} from './bookingRules.js'

/**
 * Sessions as FullCalendar events. Pure: the component passes the
 * result to `@fullcalendar/vue3`, which this module never imports (domain-pure bans it). Titles
 * carry the meaning ("10:00 am, 3 left"); the tone classes only style it. A calendar of several
 * activities names the activity too ("10:00 am, Repair Cafe Clayton, 3 left"),
 * so its events are not identical to a screen reader or in the list view. `start` and `end` stay
 * full ISO instants, so the calendar's `timeZone: 'Australia/Melbourne'` places a session after
 * midnight on its Melbourne day.
 */

// The started, full and limited tests are bookingRules.js's, so an event agrees with its row: a
// waitlist holding WAITLIST_LIMIT reads "Waitlist full", as the row's "The waitlist is full" does.
const describeEvent = (session, booking, now) => {
  // The organiser's cancel leaves the member's booking live, so it comes first.
  if (session.status === 'cancelled') return { suffix: 'Cancelled', tone: 'cancelled' }
  // A waitlist place is not a booked place: the title says which one the member holds.
  if (booking) {
    return booking.status === 'waitlisted'
      ? { suffix: 'On waitlist', tone: 'booked' }
      : { suffix: 'Booked', tone: 'booked' }
  }
  if (session.registrationType === 'provider')
    return { suffix: 'Provider booking', tone: 'external' }
  if (session.registrationType === 'drop-in' || !hasKnownCapacity(session)) {
    return { suffix: 'Drop-in', tone: 'external' }
  }
  if (hasStarted(session, now)) return { suffix: 'Started', tone: 'closed' }
  if (isFullOrQueued(session)) {
    return session.waitlistCount < WAITLIST_LIMIT
      ? { suffix: 'Full', tone: 'full' }
      : { suffix: 'Waitlist full', tone: 'closed' }
  }
  return {
    suffix: `${remainingPlaces(session)} left`,
    tone: isLimited(session) ? 'limited' : 'open',
  }
}

/**
 * @param {object[]} sessions projected sessions
 * @param {Map<string, object>} activitiesById the activities whose sessions may show
 * @param {object[]} myBookings the signed-in member's bookings (empty when signed out)
 * @param {Date} now
 * @param {{ withActivityTitle?: boolean }} [options] true where one calendar shows many activities
 */
export function toCalendarEvents(
  sessions,
  activitiesById,
  myBookings,
  now,
  { withActivityTitle = false } = {},
) {
  const liveBySession = new Map(
    (Array.isArray(myBookings) ? myBookings : [])
      .filter(isLiveBooking)
      .map((booking) => [booking.sessionId, booking]),
  )
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session.status !== 'completed' && activitiesById?.has(session.activityId))
    .map((session) => {
      const { suffix, tone } = describeEvent(session, liveBySession.get(session.id), now)
      const activityTitle = withActivityTitle
        ? `${activitiesById.get(session.activityId).title}, `
        : ''
      return {
        id: session.id,
        title: `${formatTime(session.startsAt)}, ${activityTitle}${suffix}`,
        start: session.startsAt,
        end: session.endsAt,
        // FullCalendar 7 reads one `className` string; v6's `classNames` array is ignored.
        className: `session-event session-event--${tone}`,
        extendedProps: { activityId: session.activityId, tone },
      }
    })
}

/**
 * The Melbourne day of the first event that has not started yet, else of `now`. It
 * takes toCalendarEvents' output, so it never opens on a month whose only session the calendar
 * leaves out, and it shares the rows' started test, so an event starting now has started.
 *
 * @param {{ start: string }[]} events toCalendarEvents' output
 * @param {Date} now
 */
export function initialCalendarDate(events, now) {
  const upcoming = (Array.isArray(events) ? events : [])
    .filter((event) => !hasStarted({ startsAt: event.start }, now))
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
  return melbourneDayKey(upcoming[0]?.start ?? now)
}
