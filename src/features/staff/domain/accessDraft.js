/**
 * The staff access checklist's draft and the lines it saves. A service stores its access
 * information as text lines; the form offers the common facts as ticks and keeps the specifics
 * (bus numbers, walking time, where the entrance is) as notes. Saving writes each ticked fact as
 * its phrase, in checklist order, then the notes; loading turns a line that is one of the phrases
 * (ignoring case and a final full stop) back into its tick and keeps every other line as a note,
 * in order, so nothing a record holds is lost. Pure.
 */

/** The common facts, as their saved phrases, in the order the checklist shows them. */
export const ACCESS_FACTS = Object.freeze([
  'Wheelchair accessible',
  'Step-free entrance',
  'Accessible toilet',
  'On-site parking',
  'Accessible parking',
  'Near a train station',
  'Near a bus or tram stop',
])

/** The bounds of the notes under the checklist. */
export const ACCESS_NOTES = Object.freeze({ minimum: 0, maximum: 6, entryMaximum: 200 })

/** The most access lines a service stores: every fact ticked plus the notes (the rules' bound). */
export const ACCESS_STORED_MAXIMUM = ACCESS_FACTS.length + ACCESS_NOTES.maximum

const entriesOf = (value) =>
  Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean) : []
const key = (line) => line.toLocaleLowerCase('en-AU').replace(/\.$/u, '').trim()
const FACT_BY_KEY = new Map(ACCESS_FACTS.map((fact) => [key(fact), fact]))

export function blankAccessDraft() {
  return { facts: [], notes: [] }
}

/** The draft for stored lines: the canonical phrases ticked, every other line a note. */
export function toAccessDraft(lines) {
  const facts = new Set()
  const notes = []
  for (const line of entriesOf(lines)) {
    const fact = FACT_BY_KEY.get(key(line))
    if (fact) facts.add(fact)
    else notes.push(line)
  }
  return { facts: ACCESS_FACTS.filter((fact) => facts.has(fact)), notes }
}

/** The lines a draft saves: the ticked phrases in checklist order, then the trimmed notes. */
export function accessDraftLines(draft) {
  return [...ACCESS_FACTS.filter((fact) => draft.facts.includes(fact)), ...entriesOf(draft.notes)]
}

/** The draft as the conflict list shows it: the lines it saves, or "(none)". */
export function describeAccess(draft) {
  const lines = accessDraftLines(draft)
  return lines.length > 0 ? lines.join(', ') : '(none)'
}
