import { WEEKDAYS, parseOpeningHours } from './openingHours.js'

/**
 * Writes and summarises a weekly schedule, the counterpart of the opening-hours parser
 * (openingHours.js). A service stores its hours as text lines whose first line is the weekly
 * schedule; the staff hours editor writes that line with `formatWeeklyLine`, in a shape the parser
 * reads back to the same week, and the pages turn the stored lines into what a visitor reads: the
 * week as a table (`readServiceHours`) and today's state on a card ("Open now · closes 6pm",
 * `formatHoursToday`). Pure: no clock; the caller passes the Melbourne weekday and minute
 * (`melbourneClock` in functions/shared/melbourneTime.js). Times are minutes since midnight, a
 * closing time of 1440 being midnight at the end of the day, as the parser gives them.
 */

/** The weekdays as a table names them. */
export const DAY_LABELS = Object.freeze({
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
})

/** The weekdays as the weekly line and the card write them. */
export const DAY_SHORT = Object.freeze({
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
})

const MIDNIGHT = 24 * 60

/** 540 -> "9am", 570 -> "9:30am", 720 -> "12pm"; 0 and 1440 (midnight) -> "12am". */
export function formatClock(minutes) {
  const inDay = minutes % MIDNIGHT
  const hour = Math.floor(inDay / 60)
  const minute = inDay % 60
  const shown = hour % 12 === 0 ? 12 : hour % 12
  const meridiem = hour < 12 ? 'am' : 'pm'
  return minute === 0
    ? `${shown}${meridiem}`
    : `${shown}:${String(minute).padStart(2, '0')}${meridiem}`
}

const formatRange = ([opens, closes]) => `${formatClock(opens)}-${formatClock(closes)}`

/**
 * One time of a day as a table shows it: "9:30am – 6pm", "6pm – midnight" for a 12am close, and
 * "Open 24 hours" for the whole day.
 *
 * @param {[number, number]} range - minutes since midnight, [open, close)
 */
export function formatOpenRange([opens, closes]) {
  if (opens === 0 && closes === MIDNIGHT) return 'Open 24 hours'
  return `${formatClock(opens)} – ${closes === MIDNIGHT ? 'midnight' : formatClock(closes)}`
}
const byOpening = (ranges) => [...ranges].sort((left, right) => left[0] - right[0])

/**
 * The weekly line of a schedule: each run of neighbouring days with the same hours once, Monday
 * first, joined by "; " ("Mon-Tue 9:30am-6pm; Wed 9:30am-8pm; Sat 10am-4pm; Sun closed"). A day
 * with two times names its days before each ("Mon-Fri 9am-12pm, Mon-Fri 1pm-5pm"), the split
 * hours shape the parser reads. With `closedDays: false` the closed runs are left out, which the
 * parser reads the same way (a day it is not told about is closed) and which is shorter. An empty
 * string for a week with no open day: such a week has no weekly line.
 *
 * @param {import('./openingHours.js').WeeklySchedule} schedule
 * @param {{ closedDays?: boolean }} [options]
 */
export function formatWeeklyLine(schedule, { closedDays = true } = {}) {
  if (!WEEKDAYS.some((day) => schedule[day]?.length > 0)) return ''
  const runs = []
  for (const day of WEEKDAYS) {
    const ranges = byOpening(schedule[day] ?? [])
    const key = JSON.stringify(ranges)
    const last = runs[runs.length - 1]
    if (last && last.key === key) last.to = day
    else runs.push({ from: day, to: day, key, ranges })
  }
  return runs
    .filter((run) => closedDays || run.ranges.length > 0)
    .map((run) => {
      const days =
        run.from === run.to ? DAY_SHORT[run.from] : `${DAY_SHORT[run.from]}-${DAY_SHORT[run.to]}`
      if (run.ranges.length === 0) return `${days} closed`
      return run.ranges.map((times) => `${days} ${formatRange(times)}`).join(', ')
    })
    .join('; ')
}

// The same line however it was punctuated: case, spacing, a final full stop, "9.30" or "9:30",
// and the kind of dash do not change what it says.
const normalise = (line) =>
  line
    .toLowerCase()
    .replace(/[–—]/gu, '-')
    .replace(/(\d)\.(\d{2})/gu, '$1:$2')
    .replace(/\s+/gu, ' ')
    .replace(/[\s.]+$/u, '')
    .trim()

/**
 * Whether a line says only its weekly schedule, written as formatWeeklyLine writes it (with or
 * without the closed days): such a line loses nothing when a page shows it as a week. False for a
 * line it cannot read, and for one that says more (a note in brackets, a label, holiday hours).
 */
export function isWeeklyLine(line) {
  if (typeof line !== 'string') return false
  const schedule = parseOpeningHours([line])
  if (schedule === null) return false
  const written = normalise(line)
  return [true, false].some(
    (closedDays) => normalise(formatWeeklyLine(schedule, { closedDays })) === written,
  )
}

/**
 * A service's hours as a page shows them: `schedule`, the week read from the first line (null
 * when there are no lines or the first cannot be read); `listed`, the first line as the provider
 * wrote it whenever it is not a plain weekly line (unreadable, or readable but saying more than
 * the week), so a page never hides what it says; `notes`, the later lines.
 *
 * @param {unknown} lines - `service.openingHours`
 * @returns {{ schedule: import('./openingHours.js').WeeklySchedule | null, listed: string | null, notes: string[] }}
 */
export function readServiceHours(lines) {
  if (!Array.isArray(lines) || typeof lines[0] !== 'string') {
    return { schedule: null, listed: null, notes: [] }
  }
  const [first, ...rest] = lines
  const schedule = parseOpeningHours([first])
  return {
    schedule,
    listed: schedule !== null && isWeeklyLine(first) ? null : first,
    notes: rest.filter((line) => typeof line === 'string'),
  }
}

/** The end of the open stretch that holds `minute`, carried over back-to-back times. */
function closingAfter(ranges, minute) {
  let closes = null
  for (const [opens, end] of byOpening(ranges)) {
    if (closes === null ? minute >= opens && minute < end : opens <= closes) {
      closes = closes === null ? end : Math.max(closes, end)
    }
  }
  return closes
}

/**
 * Today's state by the published weekly hours at a Melbourne weekday and minute: open with the
 * minute it closes (1440 for midnight), or closed with the next opening (today, a later day, or
 * this weekday next week). Null when the hours cannot be read or there is no clock. It knows only
 * what the parser knows, so it says nothing about public holidays.
 *
 * @param {unknown} lines - `service.openingHours`
 * @param {{ weekday: string, minutes: number } | null} clock - from `melbourneClock(now)`
 * @returns {{ status: 'open', closes: number } | { status: 'closed', opens: { weekday: string, minutes: number, today: boolean } } | null}
 */
export function hoursToday(lines, clock) {
  const schedule = parseOpeningHours(lines)
  if (schedule === null || !clock || !WEEKDAYS.includes(clock.weekday)) return null
  const today = schedule[clock.weekday]
  const closes = closingAfter(today, clock.minutes)
  if (closes !== null) return { status: 'open', closes }
  const start = WEEKDAYS.indexOf(clock.weekday)
  for (let offset = 0; offset <= WEEKDAYS.length; offset += 1) {
    const weekday = WEEKDAYS[(start + offset) % WEEKDAYS.length]
    const later = byOpening(schedule[weekday]).find(
      ([opens]) => offset > 0 || opens > clock.minutes,
    )
    if (later) {
      return { status: 'closed', opens: { weekday, minutes: later[0], today: offset === 0 } }
    }
  }
  return null
}

/**
 * Today's state in two parts, so a page can set the state word on its own: `label` "Open now"
 * with `detail` "closes 6pm" ("closes midnight" for a 12am close), or "Closed" with "opens 10am"
 * (later today) or "opens Sat 10am"; `status` 'unknown' with the label "Hours not checked" and no
 * detail when the hours cannot be read, are missing, or there is no clock.
 *
 * @returns {{ status: 'open' | 'closed' | 'unknown', label: string, detail: string }}
 */
export function describeHoursToday(lines, clock) {
  const state = hoursToday(lines, clock)
  if (state === null) return { status: 'unknown', label: 'Hours not checked', detail: '' }
  if (state.status === 'open') {
    const closes = state.closes === MIDNIGHT ? 'midnight' : formatClock(state.closes)
    return { status: 'open', label: 'Open now', detail: `closes ${closes}` }
  }
  const { weekday, minutes, today } = state.opens
  const day = today ? '' : `${DAY_SHORT[weekday]} `
  return { status: 'closed', label: 'Closed', detail: `opens ${day}${formatClock(minutes)}` }
}

/**
 * Today's state as one line: "Open now · closes 6pm", "Closed · opens Sat 10am", or "Hours not
 * checked" (see describeHoursToday).
 */
export function formatHoursToday(lines, clock) {
  const { label, detail } = describeHoursToday(lines, clock)
  return detail ? `${label} · ${detail}` : label
}
