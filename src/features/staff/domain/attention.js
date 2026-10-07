import { withActivityTitles } from '@/features/activities/domain/activityCatalogue.js'
import { isLimited } from '@/features/bookings/domain/bookingRules.js'
import { CORRECTION_FIELD_LABELS } from '@/features/discovery/domain/correctionValidation.js'
import { compareText } from '@/shared/domain/tableQuery.js'
import { formatDate } from '@/shared/domain/formatDate.js'

import { daysSinceChecked, isStaleSource } from './registerColumns.js'

/**
 * The Overview's "Needs attention" panel (spec 8.6 L1005, R11, R17): ordered groups of the
 * records a staff member should act on, each with its count, up to five item links and a deep
 * link into the register that lists them all. Pure: the catalogue's lists and `now` in, groups
 * out. A cancelled session leaves its group only when `cancellationNoticeAt` is set (an email log
 * proves only that some recipients were attempted, so `emailLogs` never clears an item).
 */

export const NEAR_CAPACITY_DAYS = 14
export const ATTENTION_ITEM_LIMIT = 5

const DAY_MS = 24 * 60 * 60 * 1000
const OPEN_STATUSES = Object.freeze(['scheduled', 'full'])

const startMs = (session) => Date.parse(session.startsAt)
const isOpen = (session) => OPEN_STATUSES.includes(session.status)
const notStarted = (session, now) => startMs(session) > now.getTime()
const isTurnAgain = (session) => session.registrationType === 'turnagain'
const bySoonest = (left, right) => startMs(left) - startMs(right)

const sessionItem = (session, to) => ({
  id: session.id,
  label: `${session.activityTitle}, ${formatDate(session.startsAt, { dateStyle: 'medium' })}`,
  to,
})

const group = ({ id, title, records, toItem, viewAll, action = null }) => ({
  id,
  title,
  count: records.length,
  items: records.slice(0, ATTENTION_ITEM_LIMIT).map(toItem),
  viewAll,
  action,
})

/**
 * @param {{ services: object[], activities: object[], sessions: object[], corrections: object[], emailLogs: object[], now: Date }} input
 * @returns {Array<{ id: string, title: string, count: number, items: Array<{ id: string, label: string, to: string }>, viewAll: string, action: null | 'email' | 'mark-completed' | 'promote' }>}
 */
export function buildAttentionList({ services, activities, sessions, corrections, now }) {
  const titled = withActivityTitles(sessions, activities)
  const nowMs = now.getTime()
  const published = (services ?? []).filter((service) => service.status === 'published')

  const groups = [
    group({
      id: 'open-corrections',
      title: 'Open corrections',
      records: (corrections ?? [])
        .filter((correction) => correction.status === 'open')
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
      toItem: (correction) => ({
        id: correction.id,
        label: `${correction.serviceName}: ${CORRECTION_FIELD_LABELS[correction.field] ?? correction.field}`,
        to: `/staff/services/${correction.serviceId}/edit?correction=${correction.id}`,
      }),
      viewAll: '/staff/corrections?status=open',
    }),
    group({
      id: 'unnotified-cancellations',
      title: 'Cancelled sessions whose participants have not been told',
      records: titled
        .filter(
          (session) =>
            session.status === 'cancelled' &&
            (session.bookedCount ?? 0) + (session.waitlistCount ?? 0) > 0 &&
            session.cancellationNoticeAt === null,
        )
        .sort(bySoonest),
      toItem: (session) => sessionItem(session, `/staff/sessions/${session.id}#session-email`),
      viewAll: '/staff/sessions?status=cancelled',
      action: 'email',
    }),
    group({
      id: 'past-open-sessions',
      title: 'Sessions past their end still open',
      records: titled
        .filter((session) => isOpen(session) && Date.parse(session.endsAt) <= nowMs)
        .sort(bySoonest),
      toItem: (session) => sessionItem(session, `/staff/sessions/${session.id}`),
      viewAll: '/staff/sessions?sort=date:asc',
      action: 'mark-completed',
    }),
    group({
      id: 'promotable-sessions',
      title: 'Free places with a waitlist',
      records: titled
        .filter(
          (session) =>
            isTurnAgain(session) &&
            isOpen(session) &&
            notStarted(session, now) &&
            session.waitlistCount > 0 &&
            session.bookedCount < session.capacity,
        )
        .sort(bySoonest),
      toItem: (session) => sessionItem(session, `/staff/sessions/${session.id}`),
      viewAll: '/staff/sessions?status=scheduled',
      action: 'promote',
    }),
    group({
      id: 'filling-sessions',
      title: `Full or nearly full in the next ${NEAR_CAPACITY_DAYS} days`,
      records: titled
        .filter(
          (session) =>
            isTurnAgain(session) &&
            notStarted(session, now) &&
            startMs(session) <= nowMs + NEAR_CAPACITY_DAYS * DAY_MS &&
            (session.status === 'full' || (session.status === 'scheduled' && isLimited(session))),
        )
        .sort(bySoonest),
      toItem: (session) => sessionItem(session, `/staff/sessions/${session.id}`),
      // The register's Status select takes one value, so no query names "full or nearly full":
      // the link is the TurnAgain sessions by date, which holds both kinds (status=full would
      // miss the nearly full ones the count includes).
      viewAll: '/staff/sessions?type=turnagain&sort=date:asc',
    }),
    group({
      id: 'stale-sources',
      title: 'Sources not checked in 180 days',
      records: published
        .filter((service) => isStaleSource(service, now))
        .sort(
          (left, right) =>
            daysSinceChecked(right.source.checkedAt, now) -
              daysSinceChecked(left.source.checkedAt, now) || compareText(left.name, right.name),
        ),
      toItem: (service) => ({
        id: service.id,
        label: service.name,
        to: `/staff/services/${service.id}/edit`,
      }),
      viewAll: '/staff/services?sort=checked:asc',
    }),
    group({
      id: 'services-without-geo',
      title: 'Published services not on the map',
      records: published
        .filter((service) => service.geo === null)
        .sort((left, right) => compareText(left.name, right.name)),
      toItem: (service) => ({
        id: service.id,
        label: service.name,
        to: `/staff/services/${service.id}/edit`,
      }),
      viewAll: '/staff/services?onmap=no',
    }),
  ]
  return groups.filter((entry) => entry.count > 0)
}

/**
 * The three staff tiles (spec 8.6): open corrections, upcoming TurnAgain sessions and the
 * participant emails sent in the last 30 days.
 */
export function overviewTiles({ corrections, sessions, emailLogs, now }) {
  const nowMs = now.getTime()
  return {
    openCorrections: (corrections ?? []).filter((correction) => correction.status === 'open')
      .length,
    upcomingSessions: (sessions ?? []).filter(
      (session) => isTurnAgain(session) && isOpen(session) && notStarted(session, now),
    ).length,
    emailsLast30Days: (emailLogs ?? []).filter((log) => {
      const sentMs = Date.parse(log.sentAt)
      return sentMs > nowMs - 30 * DAY_MS && sentMs <= nowMs
    }).length,
  }
}
