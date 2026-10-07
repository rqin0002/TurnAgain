/**
 * The reserved-domain guard for undeliverable addresses: addresses under the reserved
 * top-level names never route, so neither email function ever hands one to Brevo and no bounce
 * reaches the free account. Runs only when the call is not a dry run, so the emulator's `.test`
 * demo accounts still get `dry-run`.
 */

export const UNDELIVERABLE_TLDS = Object.freeze(['test', 'invalid', 'example', 'localhost'])

/**
 * False for a non-string, an address without exactly one `@` (or an empty side) and a domain whose
 * last label is reserved; `member@example.com` is deliverable, `member@turnagain.test` is not.
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
