/**
 * Reads a service's published opening hours well enough to answer "is it open now?", and says
 * "unknown" whenever it cannot. Pure: no clock, no time zone; the caller passes the Melbourne
 * weekday and minute (`melbourneClock` in functions/shared/melbourneTime.js).
 *
 * The hours are free text written from each provider's page. The first line is the weekly
 * schedule; later lines are notes (holiday closures, a second facility's hours, the next dates)
 * and are not read. The schedule line is read as `;`-separated segments of groups joined by ",",
 * "and" or "&". A group is "<days> <time range>" in either order ("Mon-Fri 9am-5pm", "9am-5pm
 * Mon, Tue", "Mon-Fri: 9am-5pm") or a closure ("Sun closed", "closed Sun-Mon", "except Wed"); a
 * leading "Open" adds nothing ("Open 7 days 9am-5pm"). Closures are applied after every range, so
 * a closed day stays closed wherever its closure stands in the line. After a group written days
 * first, a list of days leads the next range ("Mon 9am-5pm, Tue, Wed 10am-2pm": Tuesday has
 * Wednesday's hours); a list that could belong to either of two ranges ("Mon 9am-5pm and Tue",
 * "9am-5pm Mon, Tue, Wed 10am-2pm") makes the schedule `null`. A day may hold two ranges only
 * when they do not overlap (split hours, "Mon 9am-12pm, Mon 1pm-5pm"); an overlapping range
 * ("Mon-Fri 9am-5pm; Wed 9am-1pm") may be an exception day rather than more hours, so the
 * schedule becomes `null`. Days are a day ("Mon", "Tuesday", "Sundays"), a range ("Mon-Fri",
 * "Fri-Mon" wraps the week), a list, "7 days", "7 days a week", "daily", "every day", "weekdays"
 * or "weekends". A list item that is only a holiday phrase, a public or bank holiday after at most
 * one word ("public holidays", "most public holidays", even "Mon public holidays") or "school
 * holidays" alone, names no weekday: it adds no hours, and a closure of public or bank holidays
 * closes none of the weekly days. A closure of school holidays (whole weeks that may include
 * today) makes the schedule `null`, and so does any other item that names a holiday, such as a
 * closure item that mixes a day with a holiday ("closed Mondays except public holidays") or a word
 * before "school holidays" ("Mon-Fri 9am-3pm, during school holidays 10am-2pm"). A segment or a
 * note that only says "open public / school / bank holidays" is skipped.
 * Times are 12-hour with am/pm, minutes after "." or ":" ("8.30am", "9:30am"); a range may close
 * at midnight ("6pm-12am") but not later.
 *
 * Parenthetical notes are read after the segments. A note that closes days ("(closed Tue, Thu)",
 * "(Wed closed)") closes them. A note that moves a closing time later ("(Wed to 8pm)") moves it,
 * so the day only gets longer; one that would end a day earlier makes the schedule `null`. A note
 * that closes on public holidays only ("(closed Christmas Day and New Year's Day)") is dropped.
 * Any other closure or stop ("(temporarily closed)", "(shut until further notice)", "(not
 * operating)", "(service suspended)", "(closed 12pm-1pm)"), a note that names some weeks ("(1st
 * and 3rd)", "(every other)"), or a note about days, dates, seasons or holidays ("(Wed from
 * 1pm)", "(not January)") may narrow the hours, so it makes the schedule `null`. Every other note
 * is dropped, a note that gives only times among them ("(lunch 12pm-1pm)"): the place reads open
 * during such a break. A leading "<label>: " ("Transfer station: ") is skipped, unless the label
 * is about days or dates ("Winter: ") or names a closure or some weeks ("Temporarily closed: "):
 * then the hours after it may not hold today, so the schedule is `null`. A label made only of
 * days ("Mon-Fri: ", "Open Mon-Fri: ") is not skipped: it gives the days of the hours after it.
 *
 * Any segment or group it cannot read makes the whole schedule `null`, so a monthly pattern
 * ("Third Saturday of the month"), a date or prose is `unknown`. It does not know public holidays,
 * a closure written on a later line, a break given only as times, or a closure in words outside
 * the list above, so an `open` answer means "open by the weekly hours", nothing more.
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
const EVERY_DAY = /^(?:7 days(?: a week)?|daily|every day)$/u
// A list item that is only a holiday phrase: a public or bank holiday after at most one word
// ("public holidays", "most public holidays") or "school holidays" alone. "Mondays except public
// holidays" is not one, and nor is "closed school holidays": school holidays are whole weeks, so
// a word before them may change today's hours.
const HOLIDAY_PART = /^(?:(?:[a-z]+ )?(?:public|bank)|school) holidays?$/u
// School holidays are whole weeks of the year, so a closure that names them may close today.
const SCHOOL_HOLIDAYS = /\bschool holidays?\b/u
const DAY_RANGE = /^([a-z]+)\s*(?:-|–|—|to)\s*([a-z]+)$/u
const TIME_RANGE =
  /(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)\s*(?:-|–|—|to)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)/u
const CLOSED_BEFORE = /^(?:closed|excluding|except)\s+(.+)$/u
const CLOSED_AFTER = /^(.+?)\s+closed$/u
const OPEN_ON_HOLIDAYS = /^open (?:public|school|bank) holidays?$/u
// "Open Mon-Fri 9am-5pm": a leading "open" adds nothing to the days.
const LEADING_OPEN = /^open\s+/u
// "Wed to 8pm": a later closing time for some days.
const LATER_CLOSE = /^(.+?)\s+(?:to|until|till)\s+(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)$/u
// A closure or a stop, or hours that hold only on some weeks ("1st and 3rd", "every other"). A
// note or label that says this without naming days the parser can close may mean the hours do
// not hold today. Each word only ever turns an answer into "unknown", so a harmless note that
// uses one ("(bookings paused)") costs a place its "open" answer, never a false one.
const CLOSURE_OR_SOME_WEEKS = new RegExp(
  [
    '\\bclos(?:e|ed|es|ing|ure)\\b',
    '\\bshut\\b',
    '\\bsuspend',
    '\\bnot (?:open|operating|trading|available|currently)\\b',
    '\\bno longer\\b',
    '\\bceased?\\b',
    '\\bpaused?\\b',
    '\\bon hold\\b',
    '\\bunavailable\\b',
    '\\buntil further notice\\b',
    '\\btemporar',
    '\\b\\d+(?:st|nd|rd|th)\\b',
    '\\b(?:first|second|third|fourth|last|other|alternate)\\b',
  ].join('|'),
  'u',
)
// The holidays a closure note may name and still be dropped: the weekly hours never claim to
// cover public holidays.
const PUBLIC_HOLIDAY =
  /^(?:(?:[a-z]+ )?(?:public|bank) holidays?|christmas(?: day)?|boxing day|new year['’]s day|good friday|easter(?: (?:saturday|sunday|monday))?|anzac day)$/u
const LIST_SEPARATOR = /\s*,\s*|\s+and\s+|\s*&\s*/u
// The same separators, kept when a segment is split into pieces so a joined piece keeps its own.
const PIECE_SEPARATOR = /(\s*,\s*|\s+and\s+|\s*&\s*)/u
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

/** A closing time: as toMinutes, except that "12am" closes at midnight at the end of the day. */
function toClosingMinutes(hour, minute, meridiem) {
  const minutes = toMinutes(hour, minute, meridiem)
  return minutes === 0 ? 24 * 60 : minutes
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

/**
 * The weekdays a day expression names ("Mon-Fri", "Sat, Sun and public holidays", "Mon-Fri:");
 * [] for holidays only; null when any part is unreadable.
 */
function readDays(expression) {
  const text = expression.replace(/^[\s,]+|[\s,.:]+$/gu, '')
  if (text === '') return null
  if (EVERY_DAY.test(text)) return [...WEEKDAYS]
  const days = new Set()
  for (const raw of text.split(LIST_SEPARATOR)) {
    const part = raw.trim()
    if (part === '' || HOLIDAY_PART.test(part)) continue
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

/**
 * The weekdays a closure closes: "closed <days>", "<days> closed", "except <days>" or "excluding
 * <days>". A public or bank holiday in the list closes no weekday ("closed Sundays and public
 * holidays" closes Sunday). Null when the text is not a closure, when its days are unreadable,
 * or when it names school holidays.
 */
function readClosure(text) {
  const closed = CLOSED_BEFORE.exec(text.trim()) ?? CLOSED_AFTER.exec(text.trim())
  if (!closed || SCHOOL_HOLIDAYS.test(closed[1])) return null
  return readDays(closed[1])
}

/** The text before and after a group's time range, without the spaces and commas next to it. */
function aroundRange(group, time) {
  const trim = (text) => text.replace(/^[\s,]+|[\s,]+$/gu, '')
  return [trim(group.slice(0, time.index)), trim(group.slice(time.index + time[0].length))]
}

/** Whether a group is written time first ("9am-5pm Mon"). */
function startsWithRange(group) {
  const time = TIME_RANGE.exec(group)
  return time !== null && aroundRange(group, time)[0] === ''
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
 * A segment's groups. Commas, "and" and "&" both join the days of a list ("Mon, Fri and Sat
 * 8.30am-4pm") and separate groups ("Mon-Fri 9am-5pm & Sat 10am-2pm"), so a piece joins the text
 * before it unless both hold a time range, the piece is a closure after a range ("Mon-Fri
 * 9am-5pm, Sun closed"), or, after a comma, the piece names only days that lead the next range
 * (see leadsNextRange). Null when a list of days joined a group written time first and a later
 * piece starts a group: in "9am-5pm Mon, Tue, Wed 10am-2pm" Tuesday may have either range.
 */
function splitGroups(segment) {
  const groups = []
  const [first, ...rest] = segment.split(PIECE_SEPARATOR)
  let current = first
  let daysJoinedTimeFirst = false
  for (let index = 0; index < rest.length; index += 2) {
    const separator = rest[index]
    const piece = rest[index + 1]
    const hasRange = TIME_RANGE.test(piece)
    let startsGroup
    if (hasRange || readClosure(piece) !== null) startsGroup = TIME_RANGE.test(current)
    else startsGroup = separator.trim() === ',' && leadsNextRange(current, piece)
    if (current.trim() !== '' && startsGroup) {
      if (daysJoinedTimeFirst) return null
      groups.push(current.trim())
      current = piece
    } else {
      if (!hasRange && readDays(piece)?.length > 0 && startsWithRange(current)) {
        daysJoinedTimeFirst = true
      }
      current = `${current}${separator}${piece}`
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
  const closedDays = readClosure(note)
  if (closedDays) {
    for (const day of closedDays) schedule[day] = []
    return true
  }
  if (CLOSURE_OR_SOME_WEEKS.test(note)) return closesOnHolidaysOnly(note)
  if (!NAMES_WHEN.test(note)) return true
  const later = LATER_CLOSE.exec(note)
  const days = later ? readDays(later[1]) : null
  const closes = later ? toClosingMinutes(later[2], later[3], later[4]) : null
  if (!days || closes === null) return false
  if (!days.every((day) => schedule[day].every(([, close]) => close <= closes))) return false
  // The note can only lengthen a day: the range that closes last moves to the later time, and a
  // day without hours stays closed.
  for (const day of days) {
    const last = schedule[day].reduce(
      (latest, range) => (latest !== null && latest[1] >= range[1] ? latest : range),
      null,
    )
    if (last !== null) last[1] = closes
  }
  return true
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
  // "Mon-Fri: 9am-5pm" is days and hours, not a label: readDays drops the colon.
  if (labelled && !(readDays(labelled[1].replace(LEADING_OPEN, ''))?.length > 0)) {
    if (NAMES_WHEN.test(labelled[1]) || CLOSURE_OR_SOME_WEEKS.test(labelled[1])) return null
    text = labelled[2]
  }
  const schedule = Object.fromEntries(WEEKDAYS.map((day) => [day, []]))
  // Closures are applied once every range is read, so "Closed Wed; Mon-Fri 9am-5pm" keeps
  // Wednesday closed.
  const closedDays = new Set()
  let hasHours = false
  const segments = text
    .replace(/[\s.]+$/u, '')
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
  for (const written of segments) {
    // Only that holiday note is skipped: "open by appointment only" stays unreadable (null).
    if (OPEN_ON_HOLIDAYS.test(written)) continue
    const segment = written.replace(LEADING_OPEN, '')
    const closedFirst = TIME_RANGE.test(segment) ? null : readClosure(segment)
    if (closedFirst) {
      for (const day of closedFirst) closedDays.add(day)
      continue
    }
    const groups = splitGroups(segment)
    if (groups === null) return null
    for (const group of groups) {
      const time = TIME_RANGE.exec(group)
      if (!time) {
        const days = readClosure(group)
        if (days === null) return null
        for (const day of days) closedDays.add(day)
        continue
      }
      const opens = toMinutes(time[1], time[2], time[3])
      const closes = toClosingMinutes(time[4], time[5], time[6])
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
  for (const day of closedDays) schedule[day] = []
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
