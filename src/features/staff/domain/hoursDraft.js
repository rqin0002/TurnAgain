import { WEEKDAYS, parseOpeningHours } from '@/features/discovery/domain/openingHours.js'
import {
  DAY_LABELS,
  formatWeeklyLine,
  isWeeklyLine,
} from '@/features/discovery/domain/weeklyHours.js'

/**
 * The staff hours editor's draft and the lines it saves. A service stores its opening hours as
 * text lines (at most 8 of 100 characters): the first is the weekly schedule the "Open now" check
 * reads (openingHours.js), the rest are notes. The editor holds a week instead: for each day open
 * or closed, with one opening and closing time or two (a break), as "HH:MM" from a time input, a
 * closing "00:00" meaning midnight at the end of the day; whether the place is closed on public
 * holidays; notes; and `listed`, the stored first line when the editor cannot stand in for it.
 *
 * Saving writes the week as the canonical weekly line (weeklyHours.js `formatWeeklyLine`, without
 * the closed days when the full line would pass 100 characters), the holiday tick as the line
 * "Closed public holidays", then the notes. A stored line is never dropped without the person
 * changing the hours: a line the parser cannot read (or a week the editor cannot hold, three times
 * on one day) stays listed and saved as it is until a day is set open or the person removes it; a
 * readable line that says more than its week ("Mon-Fri 9am-5pm (rear entrance)") fills the week
 * and is saved as written until the week or the holiday tick changes. Pure.
 */

/** The bounds of the notes under the week: 8 stored lines less the weekly line and the holiday line. */
export const HOURS_NOTES = Object.freeze({ minimum: 0, maximum: 6, entryMaximum: 100 })
/** The note line the "Closed on public holidays" tick saves. */
export const HOLIDAY_NOTE = 'Closed public holidays'
/** The longest stored hours line (the rules' bound). */
export const WEEKLY_LINE_MAXIMUM = 100

const HOLIDAY_LINE = /^closed (?:on )?public holidays\.?$/iu
// A closure of public holidays inside a weekly line: "closed public holidays", "closed Sundays and
// public holidays", "excluding public holidays".
const HOLIDAY_CLOSURE =
  /\b(?:closed|excluding|except)\b[^;()]*\bpublic holidays?\b|\bpublic holidays? closed\b/iu
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u

const blankRange = () => ({ opens: '', closes: '' })
const closedDay = () => ({ open: false, ranges: [blankRange()] })
const entriesOf = (value) =>
  Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean) : []

export function blankHoursDraft() {
  return {
    days: Object.fromEntries(WEEKDAYS.map((day) => [day, closedDay()])),
    holidaysClosed: false,
    notes: [],
    listed: null,
  }
}

/** "09:30" -> 570; a closing "00:00" -> 1440 (midnight); null for an empty or malformed time. */
const toMinutes = (time, { closing = false } = {}) => {
  const match = TIME.exec(time ?? '')
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return closing && minutes === 0 ? 24 * 60 : minutes
}
const toTime = (minutes) => {
  const inDay = minutes % (24 * 60)
  return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`
}
const closesHolidays = (line) => HOLIDAY_CLOSURE.test(line)

/**
 * The first problem of each open day the person must fix before saving, keyed by day:
 * `{ range, kind, message }`, where `range` is 0 or 1 (the first or the second time) and `kind`
 * is `missing`, `order` or `overlap`. A closed day has none, whatever times it still holds.
 */
export function hoursProblems(draft) {
  const problems = {}
  for (const day of WEEKDAYS) {
    const { open, ranges } = draft.days[day]
    if (!open) continue
    const name = DAY_LABELS[day]
    const read = ranges.map(({ opens, closes }) => [
      toMinutes(opens),
      toMinutes(closes, { closing: true }),
    ])
    const problem = (range, kind, message) => {
      problems[day] = { range, kind, message }
    }
    const [first, second] = read
    if (first[0] === null || first[1] === null) {
      problem(0, 'missing', `Enter the opening and closing times for ${name}.`)
    } else if (first[1] <= first[0]) {
      problem(
        0,
        'order',
        `${name}'s closing time must be after its opening time. For midnight, use 12:00 am.`,
      )
    } else if (second && (second[0] === null || second[1] === null)) {
      problem(1, 'missing', `Enter ${name}'s second opening and closing times, or remove them.`)
    } else if (second && second[1] <= second[0]) {
      problem(
        1,
        'order',
        `${name}'s second closing time must be after its opening time. For midnight, use 12:00 am.`,
      )
    } else if (second && second[0] < first[1] && first[0] < second[1]) {
      problem(1, 'overlap', `${name}'s two times overlap.`)
    }
  }
  return problems
}

/** The week the draft gives: each open day's readable times in opening order, closed days empty. */
export function draftSchedule(draft) {
  return Object.fromEntries(
    WEEKDAYS.map((day) => {
      const { open, ranges } = draft.days[day]
      if (!open) return [day, []]
      const times = ranges
        .map(({ opens, closes }) => [toMinutes(opens), toMinutes(closes, { closing: true })])
        .filter(([opens, closes]) => opens !== null && closes !== null && closes > opens)
        .sort((left, right) => left[0] - right[0])
      return [day, times]
    }),
  )
}

const hasOpenDay = (draft) => WEEKDAYS.some((day) => draft.days[day].open)
const sameSchedule = (left, right) =>
  left !== null &&
  WEEKDAYS.every(
    (day) =>
      JSON.stringify([...left[day]].sort((a, b) => a[0] - b[0])) === JSON.stringify(right[day]),
  )

/** The weekly line of the draft's week: with its closed days when that fits in 100 characters. */
const weeklyLineOf = (schedule) => {
  const full = formatWeeklyLine(schedule)
  return full.length <= WEEKLY_LINE_MAXIMUM
    ? full
    : formatWeeklyLine(schedule, { closedDays: false })
}

/**
 * Whether the stored first line is saved as written: an unreadable one while no day is open, a
 * readable one while the week and the holiday tick still say what it says.
 */
export function listedLineKept(draft) {
  const { listed } = draft
  if (!listed) return false
  if (!listed.readable) return !hasOpenDay(draft)
  return (
    sameSchedule(parseOpeningHours([listed.text]), draftSchedule(draft)) &&
    (draft.holidaysClosed || !closesHolidays(listed.text))
  )
}

/**
 * The lines a draft saves (see the file comment): the weekly line (or the kept listed line), the
 * holiday line unless a kept line already says it, then the notes trimmed with empty ones left out.
 */
export function hoursDraftLines(draft) {
  const kept = listedLineKept(draft)
  const first = kept ? draft.listed.text : weeklyLineOf(draftSchedule(draft))
  const holidayInLine = kept && draft.listed.readable && closesHolidays(draft.listed.text)
  return [
    first,
    draft.holidaysClosed && !holidayInLine ? HOLIDAY_NOTE : '',
    ...entriesOf(draft.notes),
  ].filter(Boolean)
}

/** The first problem with the week, as the form's message; '' when it can be saved. */
export function checkHoursDraft(draft) {
  const [first] = Object.values(hoursProblems(draft))
  if (first) return first.message
  if (listedLineKept(draft) || !hasOpenDay(draft)) return ''
  const line = weeklyLineOf(draftSchedule(draft))
  return line.length > WEEKLY_LINE_MAXIMUM
    ? `The week is too long to save as one line of hours (${line.length} of ${WEEKLY_LINE_MAXIMUM} characters). Give more days the same times, or put part of the hours in a note.`
    : ''
}

/** The editor's days for a week the parser read; null when a day has more than two times. */
const daysFrom = (schedule) => {
  if (WEEKDAYS.some((day) => schedule[day].length > 2)) return null
  return Object.fromEntries(
    WEEKDAYS.map((day) => {
      const times = [...schedule[day]].sort((left, right) => left[0] - right[0])
      if (times.length === 0) return [day, closedDay()]
      return [
        day,
        {
          open: true,
          ranges: times.map(([opens, closes]) => ({
            opens: toTime(opens),
            closes: toTime(closes),
          })),
        },
      ]
    }),
  )
}

/**
 * The draft for stored lines: the first line read into the week when the editor can hold it (and
 * kept as `listed` when it says more than the week), else kept as an unreadable `listed` line; a
 * holiday closure in the weekly line or a later "Closed public holidays" line ticks the holiday
 * box; every other later line is a note, in order.
 *
 * @param {unknown} lines - `service.openingHours`
 */
export function toHoursDraft(lines) {
  const entries = entriesOf(lines)
  const draft = blankHoursDraft()
  if (entries.length === 0) return draft
  const [first, ...rest] = entries
  const schedule = parseOpeningHours([first])
  const days = schedule === null ? null : daysFrom(schedule)
  let later = rest
  if (days !== null) {
    draft.days = days
    draft.listed = isWeeklyLine(first) ? null : { text: first, readable: true }
    draft.holidaysClosed = closesHolidays(first)
  } else if (HOLIDAY_LINE.test(first)) {
    later = entries
  } else {
    draft.listed = { text: first, readable: false }
  }
  const holiday = later.findIndex((line) => HOLIDAY_LINE.test(line))
  if (holiday >= 0) draft.holidaysClosed = true
  draft.notes = later.filter((_, index) => index !== holiday)
  return draft
}

/** The draft with Monday's state and times copied to Tuesday to Friday. */
export function copyMondayToWeekdays(draft) {
  const monday = draft.days.mon
  const copy = () => ({ open: monday.open, ranges: monday.ranges.map((range) => ({ ...range })) })
  return {
    ...draft,
    days: { ...draft.days, tue: copy(), wed: copy(), thu: copy(), fri: copy() },
  }
}

/** The draft as the conflict list shows it: the lines it saves, or "(none)". */
export function describeHours(draft) {
  const lines = hoursDraftLines(draft)
  return lines.length > 0 ? lines.join(' / ') : '(none)'
}
