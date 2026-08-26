import { AuthError } from './AuthError.js'

const PASSWORD_ALGORITHM = 'PBKDF2-SHA-256'
const PBKDF2_HASH = 'SHA-256'
const DEFAULT_ITERATIONS = 210000
const MAX_ITERATIONS = 1000000
const SALT_BYTE_LENGTH = 16
const HASH_BIT_LENGTH = 256
const HASH_BYTE_LENGTH = HASH_BIT_LENGTH / 8
const PASSWORD_RECORD_KEYS = ['algorithm', 'iterations', 'saltBase64', 'hashBase64']
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

const getOptions = (options) =>
  typeof options === 'object' && options !== null && !Array.isArray(options) ? options : {}

const getCryptoDependency = (options) =>
  Object.hasOwn(options, 'cryptoImpl') ? options.cryptoImpl : globalThis.crypto

const assertPassword = (password) => {
  if (typeof password !== 'string') {
    throw new AuthError('invalid-input')
  }
}

const getIterations = (options) => {
  const iterations = Object.hasOwn(options, 'iterations') ? options.iterations : DEFAULT_ITERATIONS

  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new AuthError('invalid-input')
  }

  return iterations
}

const hasRequiredCrypto = (cryptoImpl, { random }) =>
  cryptoImpl !== null &&
  typeof cryptoImpl === 'object' &&
  (!random || typeof cryptoImpl.getRandomValues === 'function') &&
  cryptoImpl.subtle !== null &&
  typeof cryptoImpl.subtle === 'object' &&
  typeof cryptoImpl.subtle.importKey === 'function' &&
  typeof cryptoImpl.subtle.deriveBits === 'function'

const bytesToBase64 = (bytes) => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const base64ToBytes = (value) => {
  if (typeof value !== 'string' || !value || !BASE64_PATTERN.test(value)) {
    return null
  }

  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return bytesToBase64(bytes) === value ? bytes : null
  } catch {
    return null
  }
}

const decodePasswordRecord = (record) => {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    throw new AuthError('invalid-password-record')
  }

  const keys = Object.keys(record)
  const hasExactKeys =
    keys.length === PASSWORD_RECORD_KEYS.length &&
    PASSWORD_RECORD_KEYS.every((key) => Object.hasOwn(record, key)) &&
    keys.every((key) => PASSWORD_RECORD_KEYS.includes(key))

  if (
    !hasExactKeys ||
    record.algorithm !== PASSWORD_ALGORITHM ||
    !Number.isInteger(record.iterations) ||
    record.iterations < 1 ||
    record.iterations > MAX_ITERATIONS
  ) {
    throw new AuthError('invalid-password-record')
  }

  const salt = base64ToBytes(record.saltBase64)
  const hash = base64ToBytes(record.hashBase64)
  if (salt?.length !== SALT_BYTE_LENGTH || hash?.length !== HASH_BYTE_LENGTH) {
    throw new AuthError('invalid-password-record')
  }

  return { salt, hash }
}

const derivePasswordBytes = async (password, salt, iterations, cryptoImpl) => {
  const passwordBytes = new TextEncoder().encode(password)

  try {
    const key = await cryptoImpl.subtle.importKey('raw', passwordBytes, { name: 'PBKDF2' }, false, [
      'deriveBits',
    ])
    const bits = await cryptoImpl.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: PBKDF2_HASH,
        iterations,
        salt,
      },
      key,
      HASH_BIT_LENGTH,
    )
    const derived = new Uint8Array(bits)

    if (derived.length !== HASH_BYTE_LENGTH) {
      throw new Error('Unexpected PBKDF2 output length')
    }

    return derived
  } finally {
    // Clear the temporary raw encoding after import; no plaintext bytes cross this boundary.
    passwordBytes.fill(0)
  }
}

const constantWorkEqual = (left, right) => {
  let difference = 0

  // Valid records and derivations are fixed-length; accumulate every byte before deciding.
  for (let index = 0; index < HASH_BYTE_LENGTH; index += 1) {
    difference |= left[index] ^ right[index]
  }

  return difference === 0
}

/**
 * @typedef {object} PasswordRecord
 * @property {'PBKDF2-SHA-256'} algorithm
 * @property {number} iterations
 * @property {string} saltBase64
 * @property {string} hashBase64
 */

/**
 * Derives a salted PBKDF2-SHA-256 password record through Web Crypto.
 *
 * @param {string} password - Exact password text; never trimmed or returned.
 * @param {object} [options]
 * @param {number} [options.iterations=210000] - Injectable lower count for focused tests.
 * @param {Crypto} [options.cryptoImpl=globalThis.crypto] - Injectable Web Crypto dependency.
 * @returns {Promise<PasswordRecord>} Base64-serialized salt and derived hash metadata.
 * @throws {AuthError} With `crypto-unavailable` when Web Crypto cannot protect the password.
 */
export async function hashPassword(password, options = {}) {
  assertPassword(password)
  const settings = getOptions(options)
  const iterations = getIterations(settings)
  const cryptoImpl = getCryptoDependency(settings)

  if (!hasRequiredCrypto(cryptoImpl, { random: true })) {
    throw new AuthError('crypto-unavailable')
  }

  const salt = new Uint8Array(SALT_BYTE_LENGTH)
  let hash

  try {
    cryptoImpl.getRandomValues(salt)
    hash = await derivePasswordBytes(password, salt, iterations, cryptoImpl)

    return {
      algorithm: PASSWORD_ALGORITHM,
      iterations,
      saltBase64: bytesToBase64(salt),
      hashBase64: bytesToBase64(hash),
    }
  } catch {
    throw new AuthError('crypto-unavailable')
  } finally {
    hash?.fill(0)
  }
}

/**
 * Verifies a password against a validated PBKDF2 record without early byte exits.
 *
 * @param {string} password - Exact candidate password; never trimmed or returned.
 * @param {unknown} record - Candidate serialized password record from local storage.
 * @param {object} [options]
 * @param {Crypto} [options.cryptoImpl=globalThis.crypto] - Injectable Web Crypto dependency.
 * @returns {Promise<boolean>} Whether every derived hash byte matches.
 * @throws {AuthError} For malformed records or unavailable Web Crypto.
 */
export async function verifyPassword(password, record, options = {}) {
  assertPassword(password)
  const decoded = decodePasswordRecord(record)
  const settings = getOptions(options)
  const cryptoImpl = getCryptoDependency(settings)

  if (!hasRequiredCrypto(cryptoImpl, { random: false })) {
    throw new AuthError('crypto-unavailable')
  }

  let candidate
  try {
    candidate = await derivePasswordBytes(password, decoded.salt, record.iterations, cryptoImpl)
    return constantWorkEqual(candidate, decoded.hash)
  } catch {
    throw new AuthError('crypto-unavailable')
  } finally {
    candidate?.fill(0)
  }
}
