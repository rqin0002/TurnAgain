/**
 * Validation of the staff session email (the callable sendSessionEmail and the
 * ParticipantEmailForm share it). Lengths are counted in code points after trimming; the body may
 * hold line breaks (CRLF and CR are normalised to LF first) and nothing else from the control
 * ranges; the subject holds none. Pure.
 */

import { hasControlCharacter } from './controlCharacters.js'

export const SESSION_EMAIL_LIMITS = Object.freeze({
  maxRecipients: 99,
  subjectMin: 3,
  subjectMax: 120,
  bodyMin: 10,
  bodyMax: 2000,
})

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u

const codePoints = (text) => Array.from(text).length

function checkText(raw, { min, max, allowed }) {
  if (typeof raw !== 'string') {
    return { value: '', error: 'required' }
  }
  const value = raw.replace(/\r\n?/gu, '\n').trim()
  if (value === '') return { value, error: 'required' }
  if (hasControlCharacter(value, allowed)) return { value, error: 'control-characters' }
  if (codePoints(value) < min) return { value, error: 'too-short' }
  if (codePoints(value) > max) return { value, error: 'too-long' }
  return { value, error: null }
}

function checkRecipients(raw, copyToSender) {
  if (!Array.isArray(raw)) return { value: [], error: 'not-a-list' }
  if (raw.length > SESSION_EMAIL_LIMITS.maxRecipients) return { value: [], error: 'too-many' }
  if (!raw.every((id) => typeof id === 'string' && ID_PATTERN.test(id))) {
    return { value: [], error: 'invalid-id' }
  }
  if (new Set(raw).size !== raw.length) return { value: [], error: 'duplicate' }
  if (raw.length === 0 && copyToSender !== true) return { value: [], error: 'empty-without-copy' }
  return { value: [...raw], error: null }
}

/**
 * `{ isValid, errors, values }`: `errors` maps a field to one code ('not-a-list' | 'invalid-id' |
 * 'duplicate' | 'too-many' | 'empty-without-copy' for the ids; 'required' | 'too-short' |
 * 'too-long' | 'control-characters' for subject and body; 'not-boolean' for the two flags);
 * `values` holds the trimmed text and the two flags (false when not a boolean). A null or
 * undefined input is answered with every field refused.
 */
export function validateSessionEmail(input) {
  const { recipientBookingIds, subject, body, copyToSender, attachParticipants } = input ?? {}
  const errors = {}
  const recipients = checkRecipients(recipientBookingIds, copyToSender)
  const subjectCheck = checkText(subject, {
    min: SESSION_EMAIL_LIMITS.subjectMin,
    max: SESSION_EMAIL_LIMITS.subjectMax,
    allowed: '',
  })
  const bodyCheck = checkText(body, {
    min: SESSION_EMAIL_LIMITS.bodyMin,
    max: SESSION_EMAIL_LIMITS.bodyMax,
    allowed: '\n',
  })
  if (recipients.error) errors.recipientBookingIds = recipients.error
  if (subjectCheck.error) errors.subject = subjectCheck.error
  if (bodyCheck.error) errors.body = bodyCheck.error
  if (typeof copyToSender !== 'boolean') errors.copyToSender = 'not-boolean'
  if (typeof attachParticipants !== 'boolean') errors.attachParticipants = 'not-boolean'
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      recipientBookingIds: recipients.value,
      subject: subjectCheck.value,
      body: bodyCheck.value,
      copyToSender: copyToSender === true,
      attachParticipants: attachParticipants === true,
    },
  }
}
