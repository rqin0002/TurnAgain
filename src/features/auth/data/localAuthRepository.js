import {
  LocalDatabaseError,
  loadLocalDatabase,
  updateLocalDatabase,
} from '../../../data/localDatabaseRepository.js'
import { validateLoginInput, validateRegistrationInput } from '../domain/authValidation.js'
import { AuthError } from './AuthError.js'
import { DEMO_ACCOUNTS } from './demoAccounts.js'
import { hashPassword, verifyPassword } from './passwordCrypto.js'

/** Versioned key for the current browser tab's local authentication session. */
export const LOCAL_AUTH_SESSION_KEY = 'turnagain.local-session.v1'

const SESSION_SCHEMA_VERSION = 1
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000
const SESSION_KEYS = ['schemaVersion', 'uid', 'issuedAt', 'expiresAt']
const PROFILE_ROLES = new Set(['member', 'staff', 'admin'])
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const REGISTRATION_INPUT_KEYS = new Set([
  'displayName',
  'email',
  'password',
  'passwordConfirmation',
])
const DATABASE_INTEGRITY_ERROR_CODES = new Set([
  'invalid-mutation',
  'refresh-invalid',
  'seed-invalid',
  'storage-corrupt',
  'storage-invalid',
])

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCanonicalTimestamp = (value) => {
  if (typeof value !== 'string' || !ISO_UTC_TIMESTAMP_PATTERN.test(value)) {
    return false
  }

  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

const getDate = (clock) => {
  let value

  try {
    value = clock()
  } catch {
    throw new AuthError('unexpected')
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new AuthError('unexpected')
  }

  return new Date(value.getTime())
}

const getDefaultSessionStorage = () => {
  try {
    return globalThis.sessionStorage
  } catch {
    throw new AuthError('storage-unavailable')
  }
}

const assertSessionStorage = (storage) => {
  if (
    storage === null ||
    typeof storage !== 'object' ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    throw new AuthError('storage-unavailable')
  }

  return storage
}

const projectPublicUser = (profile) => ({
  uid: profile.uid,
  email: profile.email,
  displayName: profile.displayName,
  role: profile.role,
})

const isActiveProfile = (profile) =>
  isPlainObject(profile) &&
  profile.status === 'active' &&
  typeof profile.uid === 'string' &&
  typeof profile.email === 'string' &&
  typeof profile.displayName === 'string' &&
  PROFILE_ROLES.has(profile.role)

const createDefaultUid = () => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return `user-${globalThis.crypto.randomUUID()}`
    }

    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const bytes = new Uint8Array(16)
      globalThis.crypto.getRandomValues(bytes)
      const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
      bytes.fill(0)
      return `user-${suffix}`
    }
  } catch {
    throw new AuthError('crypto-unavailable')
  }

  throw new AuthError('crypto-unavailable')
}

const hasUnexpectedRegistrationInput = (input) =>
  isPlainObject(input) &&
  Reflect.ownKeys(input).some(
    (key) =>
      Object.prototype.propertyIsEnumerable.call(input, key) && !REGISTRATION_INPUT_KEYS.has(key),
  )

const createAvailableUid = (database, createUid) => {
  const occupied = new Set([
    ...database.collections.userProfiles.map(({ uid }) => uid),
    ...(database.localAuthAccounts ?? []).map(({ uid }) => uid),
  ])

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let candidate
    try {
      candidate = createUid()
    } catch (error) {
      if (error instanceof AuthError) {
        throw error
      }
      throw new AuthError('crypto-unavailable')
    }

    if (typeof candidate === 'string' && ID_PATTERN.test(candidate) && !occupied.has(candidate)) {
      return candidate
    }
  }

  throw new AuthError('unexpected')
}

const hasExactSessionShape = (session) => {
  if (!isPlainObject(session)) {
    return false
  }

  const keys = Object.keys(session)
  return (
    keys.length === SESSION_KEYS.length &&
    SESSION_KEYS.every((key) => Object.hasOwn(session, key)) &&
    keys.every((key) => SESSION_KEYS.includes(key))
  )
}

const isValidSession = (session, now) => {
  if (
    !hasExactSessionShape(session) ||
    session.schemaVersion !== SESSION_SCHEMA_VERSION ||
    typeof session.uid !== 'string' ||
    !ID_PATTERN.test(session.uid) ||
    !isCanonicalTimestamp(session.issuedAt) ||
    !isCanonicalTimestamp(session.expiresAt)
  ) {
    return false
  }

  const issuedAt = Date.parse(session.issuedAt)
  const expiresAt = Date.parse(session.expiresAt)
  return (
    expiresAt - issuedAt === SESSION_LIFETIME_MS &&
    issuedAt <= now.getTime() &&
    now.getTime() < expiresAt
  )
}

const mapDatabaseError = (error) => {
  if (error instanceof AuthError) {
    throw error
  }
  // Schema, seed, refresh, and mutation integrity failures make stored identity data untrustworthy.
  if (error instanceof LocalDatabaseError && DATABASE_INTEGRITY_ERROR_CODES.has(error.code)) {
    throw new AuthError('storage-corrupt')
  }
  throw new AuthError('storage-unavailable')
}

/**
 * Creates the local Firebase-ready authentication boundary.
 *
 * @param {object} [dependencies]
 * @param {(options?: object) => Promise<object>} [dependencies.loadDatabase] - Injectable local database loader.
 * @param {(mutator: Function, options?: object) => Promise<{database: object, result: unknown}>} [dependencies.updateDatabase] - Injectable atomic database updater.
 * @param {(password: string) => Promise<object>} [dependencies.hashPassword] - Injectable Web Crypto password hasher.
 * @param {(password: string, record: unknown) => Promise<boolean>} [dependencies.verifyPassword] - Injectable Web Crypto password verifier.
 * @param {Storage} [dependencies.sessionStorage] - Current-tab persistence boundary.
 * @param {() => Date} [dependencies.clock] - Injectable session and record clock.
 * @param {() => string} [dependencies.createUid] - Injectable collision-resistant UID source.
 * @param {object} [dependencies.databaseOptions] - Shared local database dependencies.
 * @returns {{
 *   initialize: () => Promise<null | {uid: string, email: string, displayName: string, role: string}>,
 *   register: (input: unknown) => Promise<{uid: string, email: string, displayName: string, role: string}>,
 *   login: (input: unknown) => Promise<{uid: string, email: string, displayName: string, role: string}>,
 *   logout: () => Promise<null>,
 *   restoreSession: () => Promise<null | {uid: string, email: string, displayName: string, role: string}>
 * }} Repository operations exposing public users only.
 */
export function createLocalAuthRepository(dependencies = {}) {
  const settings = isPlainObject(dependencies) ? dependencies : {}
  const loadDatabase = settings.loadDatabase ?? loadLocalDatabase
  const updateDatabase = settings.updateDatabase ?? updateLocalDatabase
  const hashPasswordImpl = settings.hashPassword ?? hashPassword
  const verifyPasswordImpl = settings.verifyPassword ?? verifyPassword
  const clock = settings.clock ?? (() => new Date())
  const createUid = settings.createUid ?? createDefaultUid
  const databaseOptions = isPlainObject(settings.databaseOptions) ? settings.databaseOptions : {}

  const getSessionStorage = () =>
    assertSessionStorage(
      Object.hasOwn(settings, 'sessionStorage')
        ? settings.sessionStorage
        : getDefaultSessionStorage(),
    )

  const clearSession = () => {
    try {
      getSessionStorage().removeItem(LOCAL_AUTH_SESSION_KEY)
    } catch (error) {
      if (error instanceof AuthError) {
        throw error
      }
      throw new AuthError('storage-unavailable')
    }
  }

  const writeSession = (uid) => {
    const issued = getDate(clock)
    const session = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      uid,
      issuedAt: issued.toISOString(),
      expiresAt: new Date(issued.getTime() + SESSION_LIFETIME_MS).toISOString(),
    }

    try {
      getSessionStorage().setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify(session))
    } catch (error) {
      if (error instanceof AuthError) {
        throw error
      }
      throw new AuthError('storage-unavailable')
    }
  }

  const readSession = () => {
    let serialized
    try {
      serialized = getSessionStorage().getItem(LOCAL_AUTH_SESSION_KEY)
    } catch (error) {
      if (error instanceof AuthError) {
        throw error
      }
      throw new AuthError('storage-unavailable')
    }

    if (serialized === null) {
      return null
    }

    let session
    try {
      session = JSON.parse(serialized)
    } catch {
      clearSession()
      return null
    }

    if (!isValidSession(session, getDate(clock))) {
      clearSession()
      return null
    }

    return session
  }

  const runLoad = async () => {
    try {
      return await loadDatabase(databaseOptions)
    } catch (error) {
      return mapDatabaseError(error)
    }
  }

  const runUpdate = async (mutator) => {
    try {
      return await updateDatabase(mutator, { ...databaseOptions, clock })
    } catch (error) {
      return mapDatabaseError(error)
    }
  }

  const restoreSession = async () => {
    const session = readSession()
    if (session === null) {
      return null
    }

    const database = await runLoad()
    const profile = database.collections.userProfiles.find(({ uid }) => uid === session.uid)
    const account = (database.localAuthAccounts ?? []).find(({ uid }) => uid === session.uid)

    // A tab token carries no authority: every restore re-reads the current profile and role.
    if (
      !isActiveProfile(profile) ||
      account === undefined ||
      account.emailCanonical !== profile.email
    ) {
      clearSession()
      return null
    }

    return projectPublicUser(profile)
  }

  const initialize = async () => {
    await runUpdate(async (database, { now }) => {
      database.localAuthAccounts ??= []

      for (const demo of DEMO_ACCOUNTS) {
        const profile = database.collections.userProfiles.find(({ uid }) => uid === demo.uid)
        if (
          profile === undefined ||
          profile.role !== demo.role ||
          profile.dataClass !== 'local-demo'
        ) {
          throw new AuthError('storage-corrupt')
        }

        const accountByUid = database.localAuthAccounts.find(({ uid }) => uid === demo.uid)
        const accountByEmail = database.localAuthAccounts.find(
          ({ emailCanonical }) => emailCanonical === demo.email,
        )

        if (profile.email !== demo.email) {
          if (
            accountByEmail !== undefined ||
            (accountByUid !== undefined && accountByUid.emailCanonical !== profile.email)
          ) {
            throw new AuthError('storage-corrupt')
          }

          const timestamp = getDate(() => now).toISOString()
          profile.email = demo.email
          profile.updatedAt = profile.updatedAt > timestamp ? profile.updatedAt : timestamp

          if (accountByUid !== undefined) {
            // Rotate the reserved identity and its hash atomically; real users
            // and existing rating ownership keep their original stable UIDs.
            accountByUid.emailCanonical = demo.email
            accountByUid.password = await hashPasswordImpl(demo.password)
            accountByUid.updatedAt =
              accountByUid.updatedAt > timestamp ? accountByUid.updatedAt : timestamp
            continue
          }
        }

        if (accountByUid || accountByEmail) {
          if (
            accountByUid === undefined ||
            accountByEmail === undefined ||
            accountByUid !== accountByEmail
          ) {
            throw new AuthError('storage-corrupt')
          }
          continue
        }

        const protectedPassword = await hashPasswordImpl(demo.password)
        const timestamp = getDate(() => now).toISOString()
        database.localAuthAccounts.push({
          uid: demo.uid,
          emailCanonical: demo.email,
          password: protectedPassword,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }
    })

    return restoreSession()
  }

  const register = async (input) => {
    if (hasUnexpectedRegistrationInput(input)) {
      throw new AuthError('invalid-input')
    }

    const validation = validateRegistrationInput(input)
    if (!validation.isValid) {
      throw new AuthError('invalid-input')
    }

    const password = input.password
    const { result: user } = await runUpdate(async (database, { now }) => {
      database.localAuthAccounts ??= []
      const duplicateProfile = database.collections.userProfiles.some(
        ({ email }) => email === validation.values.email,
      )
      const duplicateAccount = database.localAuthAccounts.some(
        ({ emailCanonical }) => emailCanonical === validation.values.email,
      )
      if (duplicateProfile || duplicateAccount) {
        throw new AuthError('email-in-use')
      }

      const timestamp = getDate(() => now).toISOString()
      const uid = createAvailableUid(database, createUid)
      const profile = {
        uid,
        email: validation.values.email,
        displayName: validation.values.displayName,
        role: 'member',
        status: 'active',
        dataClass: 'registered-local',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const protectedPassword = await hashPasswordImpl(password)

      // Profile and credential metadata cross the schema validator in one persisted mutation.
      database.collections.userProfiles.push(profile)
      database.localAuthAccounts.push({
        uid,
        emailCanonical: profile.email,
        password: protectedPassword,
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      return projectPublicUser(profile)
    })

    writeSession(user.uid)
    return user
  }

  const login = async (input) => {
    const validation = validateLoginInput(input)
    if (!validation.isValid) {
      throw new AuthError('invalid-credentials')
    }

    const database = await runLoad()
    const account = (database.localAuthAccounts ?? []).find(
      ({ emailCanonical }) => emailCanonical === validation.values.email,
    )
    const profile = account
      ? database.collections.userProfiles.find(({ uid }) => uid === account.uid)
      : undefined

    if (!account || !isActiveProfile(profile) || profile.email !== account.emailCanonical) {
      throw new AuthError('invalid-credentials')
    }

    let matches
    try {
      matches = await verifyPasswordImpl(input.password, account.password)
    } catch (error) {
      if (error instanceof AuthError && error.code === 'crypto-unavailable') {
        throw error
      }
      throw new AuthError('invalid-credentials')
    }

    if (!matches) {
      throw new AuthError('invalid-credentials')
    }

    const user = projectPublicUser(profile)
    writeSession(user.uid)
    return user
  }

  const logout = async () => {
    clearSession()
    return null
  }

  return Object.freeze({ initialize, register, login, logout, restoreSession })
}
