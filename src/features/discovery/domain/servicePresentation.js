const ACTION_LABELS = Object.freeze({
  repair: 'Repair',
  reuse: 'Reuse or donate',
  recycle: 'Recycle',
})

/**
 * Converts a stable action code into user-facing copy. Unknown future codes
 * remain readable, which prevents a new catalogue value from rendering blank.
 *
 * @param {string} action
 * @returns {string}
 */
export function formatActionType(action) {
  if (ACTION_LABELS[action]) {
    return ACTION_LABELS[action]
  }

  const words = String(action ?? '')
    .replace(/[-_]+/gu, ' ')
    .trim()

  return words ? `${words[0].toLocaleUpperCase('en-AU')}${words.slice(1)}` : ''
}

/**
 * Formats a source-check date without replacing unknown source text with a
 * guessed date. The caller remains responsible for the surrounding label.
 *
 * @param {string} value ISO calendar date (`YYYY-MM-DD`) or source text.
 * @returns {string}
 */
export function formatCheckedDate(value) {
  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
