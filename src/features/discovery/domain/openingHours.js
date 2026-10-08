/**
 * Reads a service's published opening hours well enough to answer "is it open now?", and says
 * "unknown" whenever it cannot. Pure: no clock, no time zone; the caller passes the Melbourne
 * weekday and minute (`melbourneClock` in functions/shared/melbourneTime.js).
 *
 * The hours are free text written from each provider's page. The first line is the weekly
 * schedule; later lines are notes (holiday closures, a second facility's hours, the next dates)
 * and are not read. The schedule line is read as `;`-separated segments. A segment is either
 * comma-separated groups of "<days> <time range>" (either order), or one closure, "<days>
 * closed" or "closed <days>"; a closure joined to hours by a comma ("Mon-Fri 9am-5pm, Wed
 * closed") is not read, so the schedule becomes `null`. A later closure clears the day's hours.
 * After a group written days first, a list of days leads the next range ("Mon 9am-5pm, Tue, Wed
 * 10am-2pm": Tuesday has Wednesday's hours); a list with no range after it, or days on both sides
 * of one range ("Mon 9am-5pm and Tue"), may not share that range, so the schedule becomes `null`.
 * A day may hold two ranges only when they do not overlap (split hours, "Mon 9am-12pm, Mon
 * 1pm-5pm"); an overlapping range ("Mon-Fri 9am-5pm; Wed 9am-1pm") may be an exception day
 * rather than more hours, so the schedule becomes `null`. Days are a day ("Mon", "Tuesday",
 * "Sundays"), a range ("Mon-Fri", "Fri-Mon" wraps the week), a list joined by "," / "and" / "&",
 * "7 days", "daily", "weekdays" or "weekends"; public or school holidays inside a list are
 * skipped, and so is a segment that only says "open public / school / bank holidays". Times are
 * 12-hour with am/pm, minutes after "." or ":" ("8.30am", "9:30am").
 *
 * Parenthetical notes are read after the segments. A note that closes days ("(closed Tue,
 * Thu)", "(Wed closed)") closes them. A note that only moves a closing time later ("(Wed to
 * 8pm)") is dropped, which can only make a late hour read closed. A note that closes on public
 * holidays only ("(closed Christmas Day and New Year's Day)") is dropped, and so is a note about
 * something other than days or dates ("(green waste only)"). Any other closure ("(temporarily
 * closed)", "(closed until further notice)", "(closed 12pm-1pm)"), a note that names some weeks
 * ("(1st and 3rd)", "(every other)"), or a note about days, dates, seasons or holidays ("(Wed
 * from 1pm)", "(not January)") may narrow the hours, so it makes the schedule `null`. A leading
 * "<label>: " ("Transfer station: ") is skipped, unless the label is about days or dates
 * ("Winter: ") or names a closure or some weeks ("Temporarily closed: "): then the hours after it
 * may not hold today.
 *
 * Guarantees: any segment or group it cannot read makes the whole schedule `null`, so a monthly
 * pattern ("Third Saturday of the month"), a date or prose is `unknown`, never a guess. It does
 * not know public holidays, or a closure written on a later line, so an `open` answer means
 * "open by the weekly hours", nothing more.
 */

/** @typedef {'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'} Weekday */
/**
 * @typedef {Record<Weekday, Array<[number, number]>>} WeeklySchedule minutes since midnight,
 *   [open, close)
 */

export const WEEKDAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])

const DAY_NAMES = Object.freeze({
  mon: 'mon',
  monday: 'mon',
  mondays: 'mon',
  tue: 'tue',
  tues: 'tue',
  tuesday: 'tue',
  tuesdays: 'tue',
  wed: 'wed',
  weds: 'wed',
  wednesday: 'wed',
  wednesdays: 'wed',
  thu: 'thu',
  thur: 'thu',
  thurs: 'thu',
  thursday: 'thu',
  thursdays: 'thu',
  fri: 'fri',
  friday: 'fri',
  fridays: 'fri',
  sat: 'sat',
  saturday: 'sat',
  saturdays: 'sat',
  sun: 'sun',
  sunday: 'sun',
  sundays: 'sun',
})
const EVERY_DAY = /^(?:7 days|daily|every day)$/u
const HOLIDAYS = /\b(?:public|school|bank) holidays?\b/u
const DAY_RANGE = /^([a-z]+)\s*(?:-|–|—|to)\s*([a-z]+)$/u
const TIME_RANGE =
  /(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)\s*(?:-|–|—|to)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)/u
const CLOSED_BEFORE = /^(?:closed|excluding|except)\s+(.+)$/u
const CLOSED_AFTER = /^(.+?)\s+closed$/u
const OPEN_ON_HOLIDAYS = /^open (?:public|school|bank) holidays?$/u
// "Wed to 8pm": a later closing time for some days.
const LATER_CLOSE = /^(.+?)\s+(?:to|until|till)\s+(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)$/u
// A closure, or hours that hold only on some weeks ("1st and 3rd", "every other"). A note or label
// that says this without naming days the parser can close may mean the hours do not hold today.
const CLOSURE_OR_SOME_WEEKS =
  /\bclos(?:e|ed|es|ing|ure)\b|\btemporar|\b\d+(?:st|nd|rd|th)\b|\b(?:first|second|third|fourth|last|other|alternate)\b/u
// The holidays a closure note may name and still be dropped: the weekly hours never claim to
// cover public holidays.
const PUBLIC_HOLIDAY =
  /^(?:(?:[a-z]+ )?(?:public|bank) holidays?|christmas(?: day)?|boxing day|new year['’]s day|good friday|easter(?: (?:saturday|sunday|monday))?|anzac day)$/u
const LIST_SEPARATOR = /\s*,\s*|\s+and\s+|\s*&\s*/u
// "Transfer station: ..." – a short label before ": " (a time's colon has no space after it).
const LABEL = /^([^:;]{1,60}):\s+(.+)$/u
// Words that name weekdays.
const DAY_WORDS = [
  ...Object.keys(DAY_NAMES),
  'daily',
  '7 days',
  'every day',
  'weekdays',
  'weekends',
]
const NAMES_DAYS = new RegExp(`\\b(?:${DAY_WORDS.join('|')})\\b`, 'u')
// Words that tie a note or a label to particular days or dates. "May" is left out: as a lone word
// it is far more often the verb ("bookings may be needed").
const WHEN_WORDS = [
  ...DAY_WORDS,
  'holidays?',
  'terms?',
  'weeks?',
  'weekly',
  'fortnight(?:ly)?',
  'months?',
  'monthly',
  'summer',
  'autumn',
  'winter',
  'spring',
  'jan(?:uary)?',
  'feb(?:ruary)?',
  'mar(?:ch)?',
  'apr(?:il)?',
  'june?',
  'july?',
  'aug(?:ust)?',
  'sep(?:t|tember)?',
  'oct(?:ober)?',
  'nov(?:ember)?',
  'dec(?:ember)?',
]
const NAMES_WHEN = new RegExp(`\\b(?:${WHEN_WORDS.join('|')})\\b`, 'u')

/** "8.30" "am" -> 510; null for an hour outside 1-12 or minutes past 59. */
function toMinutes(hour, minute, meridiem) {
  const h = Number(hour)
  const m = Number(minute ?? 0)
  if (h < 1 || h > 12 || m > 59) return null
  return ((h % 12) + (meridiem === 'pm' ? 12 : 0)) * 60 + m
}

/** The days from `from` to `to` inclusive, wrapping past Sunday ("fri-mon"). */
function dayRange(from, to) {
  const start = WEEKDAYS.indexOf(from)
  const days = []
  for (let step = 0; step < WEEKDAYS.length; step += 1) {
    const day = WEEKDAYS[(start + step) % WEEKDAYS.length]
    days.push(day)
    if (day === to) break
  }
  return days
}

/** The weekdays a day expression names; [] for holidays only; null when any part is unreadable. */
function readDays(expression) {
  const text = expression.replace(/^[\s,]+|[\s,.]+$/gu, '')
  if (text === '') return null
  if (EVERY_DAY.test(text)) return [...WEEKDAYS]
  const days = new Set()
  for (const raw of text.split(LIST_SEPARATOR)) {
    const part = raw.trim()
    if (part === '' || HOLIDAYS.test(part)) continue
    let named
    if (part === 'weekdays') named = WEEKDAYS.slice(0, 5)
    else if (part === 'weekends') named = ['sat', 'sun']
    else if (DAY_NAMES[part]) named = [DAY_NAMES[part]]
    else {
      const range = DAY_RANGE.exec(part)
      if (!range || !DAY_NAMES[range[1]] || !DAY_NAMES[range[2]]) return null
      named = dayRange(DAY_NAMES[range[1]], DAY_NAMES[range[2]])
    }
    for (const day of named) days.add(day)
  }
  return [...days]
}

/** The text before and after a group's time range, without the spaces and commas next to it. */
function aroundRange(group, time) {
  const trim = (text) => text.replace(/^[\s,]+|[\s,]+$/gu, '')
  return [trim(group.slice(0, time.index)), trim(group.slice(time.index + time[0].length))]
}

/**
 * Whether a piece that names only days, after a group written days first ("Mon 9am-5pm"), leads
 * the next time range instead of sharing that group's hours: in "Mon 9am-5pm, Tue, Wed 10am-2pm"
 * a reader gives Tuesday Wednesday's hours.
 */
function leadsNextRange(group, piece) {
  const time = TIME_RANGE.exec(group)
  if (!time) return false
  const [before, after] = aroundRange(group, time)
  return before !== '' && after === '' && readDays(piece)?.length > 0
}

/**
 * A segment's comma-separated groups: commas also separate the days of a list ("Mon, Fri and
 * Sat 8.30am-4pm"), so a piece joins the text before it unless both hold a time range, or the
 * piece names only days that lead the next range (see leadsNextRange).
 */
function splitGroups(segment) {
  const groups = []
  let current = ''
  for (const piece of segment.split(',')) {
    const startsGroup = TIME_RANGE.test(piece)
      ? TIME_RANGE.test(current)
      : leadsNextRange(current, piece)
    if (current !== '' && startsGroup) {
      groups.push(current.trim())
      current = piece
    } else {
      current = current === '' ? piece : `${current},${piece}`
    }
  }
  if (current.trim() !== '') groups.push(current.trim())
  return groups
}

/** Whether a note closes on public holidays only ("closed Christmas Day and New Year's Day"). */
function closesOnHolidaysOnly(note) {
  const closed = CLOSED_BEFORE.exec(note) ?? CLOSED_AFTER.exec(note)
  if (!closed) return false
  return closed[1]
    .replace(/[\s,.]+$/u, '')
    .split(LIST_SEPARATOR)
    .every((name) => PUBLIC_HOLIDAY.test(name.trim()))
}

/**
 * Applies a parenthetical note to the schedule (see the module comment for which notes are read
 * and which are dropped). False when the note may narrow the hours in a way the parser cannot
 * read, so the caller answers "unknown" rather than risk reading a closed hour as open.
 */
function applyNote(schedule, note) {
  if (OPEN_ON_HOLIDAYS.test(note)) return true
  const closed = CLOSED_BEFORE.exec(note) ?? CLOSED_AFTER.exec(note)
  const closedDays = closed ? readDays(closed[1]) : null
  if (closedDays) {
    for (const day of closedDays) schedule[day] = []
    return true
  }
  if (CLOSURE_OR_SOME_WEEKS.test(note)) return closesOnHolidaysOnly(note)
  if (!NAMES_WHEN.test(note)) return true
  const later = LATER_CLOSE.exec(note)
  const days = later ? readDays(later[1]) : null
  const closes = later ? toMinutes(later[2], later[3], later[4]) : null
  if (!days || closes === null) return false
  return days.every((day) => schedule[day].every(([, close]) => close <= closes))
}

/**
 * The weekly schedule of a service's opening-hours lines, or null when the schedule line is
 * missing or cannot be read (see the module comment for the shapes it reads).
 *
 * @param {unknown} lines - `service.openingHours`
 * @returns {WeeklySchedule | null}
 */
export function parseOpeningHours(lines) {
  if (!Array.isArray(lines) || typeof lines[0] !== 'string') return null
  const notes = []
  let text = lines[0]
    .toLowerCase()
    .replace(/\(([^)]*)\)/gu, (_, note) => {
      notes.push(note.replace(/\s+/gu, ' ').trim())
      return ' '
    })
    .replace(/\s+/gu, ' ')
    .trim()
  const labelled = LABEL.exec(text)
  if (labelled) {
    if (NAMES_WHEN.test(labelled[1]) || CLOSURE_OR_SOME_WEEKS.test(labelled[1])) return null
    text = labelled[2]
  }
  const schedule = Object.fromEntries(WEEKDAYS.map((day) => [day, []]))
  let hasHours = false
  const segments = text
    .replace(/[\s.]+$/u, '')
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
  for (const segment of segments) {
    // Only that holiday note is skipped: "open by appointment only" stays unreadable (null).
    if (OPEN_ON_HOLIDAYS.test(segment)) continue
    const closedFirst = TIME_RANGE.test(segment) ? null : CLOSED_BEFORE.exec(segment)
    if (closedFirst) {
      const days = readDays(closedFirst[1])
      if (days === null) return null
      for (const day of days) schedule[day] = []
      continue
    }
    for (const group of splitGroups(segment)) {
      const time = TIME_RANGE.exec(group)
      if (!time) {
        const closed = CLOSED_AFTER.exec(group)
        const days = closed ? readDays(closed[1]) : null
        if (days === null) return null
        for (const day of days) schedule[day] = []
        continue
      }
      const opens = toMinutes(time[1], time[2], time[3])
      const closes = toMinutes(time[4], time[5], time[6])
      if (opens === null || closes === null || closes <= opens) return null
      const [before, after] = aroundRange(group, time)
      // "Mon 9am-5pm and Tue": the later days may have hours of their own.
      if (NAMES_DAYS.test(before) && NAMES_DAYS.test(after)) return null
      const days = readDays(group.replace(time[0], ' '))
      if (days === null) return null
      for (const day of days) {
        // An overlapping second range may be an exception to the first (a shorter day), not more
        // hours, so adding it could read a closed hour as open. Split hours do not overlap.
        if (schedule[day].some(([open, close]) => opens < close && open < closes)) return null
        schedule[day].push([opens, closes])
        hasHours = true
      }
    }
  }
  for (const note of notes) {
    if (!applyNote(schedule, note)) return null
  }
  return hasHours ? schedule : null
}

/**
 * Whether a service is open at a Melbourne weekday and minute by its published weekly hours.
 *
 * @param {unknown} lines - `service.openingHours`
 * @param {{ weekday: Weekday, minutes: number } | null} clock - from `melbourneClock(now)`
 * @returns {'open' | 'closed' | 'unknown'} 'unknown' for no hours, unreadable hours or no clock
 */
export function openingStatus(lines, clock) {
  const schedule = parseOpeningHours(lines)
  if (schedule === null || !clock || !WEEKDAYS.includes(clock.weekday)) return 'unknown'
  const open = schedule[clock.weekday].some(
    ([opens, closes]) => clock.minutes >= opens && clock.minutes < closes,
  )
  return open ? 'open' : 'closed'
}
