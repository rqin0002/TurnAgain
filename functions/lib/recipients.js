/**
 * Recognises addresses under the reserved top-level names (.test, .invalid, .example,
 * .localhost), which never route. The email functions apply it only on a real send and skip such
 * an address instead of handing it to Brevo; a dry run keeps them, so the emulator's .test demo
 * accounts still record dry-run. Passing it does not show that the mailbox exists or accepts
 * mail.
 */

export const UNDELIVERABLE_TLDS = Object.freeze(['test', 'invalid', 'example', 'localhost'])

/**
 * False for a non-string, an address without exactly one '@' (or with an empty side), or a domain
 * whose last label is reserved. Only the last label is checked: member@example.com passes,
 * member@turnagain.test does not.
 */
export function isDeliverableAddress(email) {
  if (typeof email !== 'string') return false
  const parts = email.trim().split('@')
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return false
  const labels = parts[1].toLowerCase().replace(/\.$/u, '').split('.')
  return !UNDELIVERABLE_TLDS.includes(labels.at(-1))
}

/** Splits items by their address; `getEmail` reads it from an item (a booking, a caller...). */
export function splitDeliverable(items, getEmail = (item) => item) {
  const deliverable = []
  const skipped = []
  for (const item of items) {
    if (isDeliverableAddress(getEmail(item))) {
      deliverable.push(item)
    } else {
      skipped.push(item)
    }
  }
  return { deliverable, skipped }
}
