/**
 * Control characters by code point: C0 (U+0000-U+001F), DEL (U+007F) and C1 (U+0080-U+009F). One
 * definition for the session email validation, the .ics builder and the booking form. A regex with
 * control-character escapes would trip ESLint's no-control-regex, so the test is numeric.
 * src/shared/domain/safeRedirect.js keeps its own C0-plus-DEL-plus-backslash test, because a
 * redirect path is a different policy. Pure.
 */

export const isControlCodePoint = (codePoint) =>
  codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)

/** Whether `text` holds a control character other than those listed in `allowed`. */
export const hasControlCharacter = (text, allowed = '') =>
  Array.from(text).some(
    (character) => !allowed.includes(character) && isControlCodePoint(character.codePointAt(0)),
  )
