import { nextTick } from 'vue'

/**
 * Keeps keyboard focus on the page when the control just activated removes or disables itself.
 * A native button that leaves the document, or becomes disabled, drops focus to <body>, and the
 * next Tab then starts from the top of the page (WCAG 2.4.3 Focus Order). This runs `action`,
 * waits for it and for one DOM tick, and only then looks: when the element that had focus before
 * the action is no longer in the document (or is now disabled) and focus has fallen to <body> (or
 * still sits on that disabled element), the element `target()` returns is focused.
 *
 * Inputs: `action` is what the control does; it is awaited when it returns a promise, so an owner
 * that waits for a URL update can be wrapped as a whole. `target` is read after the action and
 * returns the stable element to focus, or null when the page has none, in which case nothing
 * moves. Guarantees: focus that the action itself moved to a live element is left alone; a control
 * that stays in the document and enabled keeps focus; with nothing focused before the action (a
 * mouse user on a browser that does not focus buttons on click) nothing moves. It never throws for
 * a missing target.
 *
 * @param {() => unknown} action
 * @param {() => (Element | null | undefined)} target
 * @returns {Promise<void>}
 */
export async function focusAfterAction(action, target) {
  const pressed = typeof document === 'undefined' ? null : document.activeElement
  await action()
  await nextTick()
  if (pressed === null || pressed === document.body) return
  const lost = !pressed.isConnected || pressed.disabled === true
  if (!lost) return
  const active = document.activeElement
  if (active === document.body || active === pressed) target()?.focus()
}
