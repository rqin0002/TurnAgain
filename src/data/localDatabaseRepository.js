import { assertValidDatabase } from './databaseSchema.js'

/**
 * Browser-side persistence adapter for TurnAgain's complete local database snapshot.
 *
 * The repository deliberately stores one validated JSON document rather than exposing
 * collection-specific CRUD operations. Its two public functions are:
 *
 * - `loadLocalDatabase`: fetch the public seed, reconcile it with local storage, and return it.
 * - `updateLocalDatabase`: run one mutation against an isolated copy, validate it, and save it.
 *
 * Data has two different owners during reconciliation:
 *
 * - The public seed owns dataset metadata and the service catalogue.
 * - The browser owns locally registered profiles, ratings, and password-derived auth records.
 * - Seeded `local-demo` profiles are reserved identities. They may be added when missing, but
 *   must never overwrite a locally registered identity or an existing demo's legacy email.
 *
 * Every database snapshot entering from fetch, storage, or a mutator is checked by
 * `databaseSchema.js`. Loads and updates are serialized within this JavaScript module, and
 * defensive clones prevent a caller from changing persisted data by retaining an object reference.
 */
export const LOCAL_DATABASE_KEY = 'turnagain.local-database.v2'

// Older storage locations are recovery inputs only. A valid legacy snapshot is copied to the
// current key on load, while the old key is intentionally left untouched as a recovery copy.
const LEGACY_LOCAL_DATABASE_KEYS = Object.freeze(['turnagain.local-database.v1'])

// Default request path for the public seed. In a Vite project it corresponds to the expected
// `public/data/turnagain.json` asset. Callers and tests can inject a different URL.
const DEFAULT_DATABASE_URL = '/data/turnagain.json'

// A module-scoped promise chain acts as a same-tab operation queue. It prevents two callers that
// use this module instance from interleaving read/merge/write cycles. It is not a cross-tab lock;
// concurrent tabs can still race through the browser's shared localStorage.
let databaseQueue = Promise.resolve()

/**
 * Copies data across a repository ownership boundary.
 *
 * `structuredClone` is preferred because it preserves values such as the `Date` supplied to a
 * mutator. The JSON fallback is sufficient for validated database snapshots, whose schema is
 * JSON-compatible. `undefined` is handled separately because it is a valid mutator result but
 * cannot be parsed from JSON.
 *
 * @template T
 * @param {T} value - Value that must no longer share mutable references with its caller.
 * @returns {T} An independent copy, or `undefined` when the input is `undefined`.
 */
const cloneValue = (value) => {
  if (value === undefined) {
    return undefined
  }

  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

/**
 * Creates the repository's stable public error type.
 *
 * Error messages intentionally avoid leaking malformed stored data or authentication material;
 * callers should branch on `code` rather than parse the human-readable message.
 */
const createError = (message, code, details = {}) =>
  new LocalDatabaseError(message, { code, ...details })

/**
 * Resolves browser localStorage at call time.
 *
 * Merely accessing `globalThis.localStorage` can throw when storage is disabled by browser
 * policy, privacy settings, or an opaque origin, so property access belongs inside the guard.
 * Tests normally bypass this function by injecting a Storage-compatible object.
 */
const getDefaultStorage = () => {
  try {
    return globalThis.localStorage
  } catch {
    throw createError('The saved local database is unavailable.', 'storage-read')
  }
}

/**
 * Reads, parses, and schema-validates one complete snapshot from one storage key.
 *
 * `ignoreInvalid` is used only while searching recoverable storage generations: a corrupt or
 * obsolete candidate then behaves like a missing key so another generation or the seed can be
 * tried. Without it, parsing and schema failures remain distinguishable error codes.
 *
 * @param {Storage} storage - Storage-compatible dependency.
 * @param {string} key - Exact key to inspect.
 * @param {{ ignoreInvalid?: boolean }} [options]
 * @returns {object | null} The validated stored object, or `null` when no usable value exists.
 * @throws {LocalDatabaseError} For inaccessible, corrupt, or schema-invalid storage.
 */
const readStoredDatabase = (storage, key, { ignoreInvalid = false } = {}) => {
  let serialized

  try {
    serialized = storage.getItem(key)
  } catch {
    throw createError('The saved local database is unavailable.', 'storage-read')
  }

  if (serialized === null) {
    return null
  }

  let database
  try {
    database = JSON.parse(serialized)
  } catch {
    if (ignoreInvalid) {
      return null
    }
    throw createError('The saved local database is unavailable.', 'storage-corrupt')
  }

  try {
    return assertValidDatabase(database)
  } catch {
    if (ignoreInvalid) {
      return null
    }
    throw createError('The saved local database is unavailable.', 'storage-invalid')
  }
}

/**
 * Selects the first usable stored snapshot in priority order: current key, then legacy keys.
 *
 * Invalid candidates are skipped deliberately. If none is valid, the caller initializes a clean
 * current snapshot from the validated seed. `migratedFromLegacy` tells the load path to persist a
 * valid legacy value under the current key even when no data merge is otherwise required.
 *
 * @param {Storage} storage - Storage-compatible dependency.
 * @returns {{ database: object | null, migratedFromLegacy: boolean }} Selected snapshot metadata.
 */
const readAvailableStoredDatabase = (storage) => {
  const current = readStoredDatabase(storage, LOCAL_DATABASE_KEY, { ignoreInvalid: true })
  if (current !== null) {
    return { database: current, migratedFromLegacy: false }
  }

  for (const legacyKey of LEGACY_LOCAL_DATABASE_KEYS) {
    const legacy = readStoredDatabase(storage, legacyKey, { ignoreInvalid: true })
    if (legacy !== null) {
      return { database: legacy, migratedFromLegacy: true }
    }
  }

  return { database: null, migratedFromLegacy: false }
}

/**
 * Persists the entire snapshot under the current generation key.
 *
 * Serialization and `setItem` share one error boundary because quota, browser policy, or a
 * non-serializable unexpected value all mean the repository could not commit the snapshot.
 *
 * @param {Storage} storage - Storage-compatible dependency.
 * @param {object} database - Already validated snapshot to serialize.
 * @throws {LocalDatabaseError} With `storage-write` when the commit fails.
 */
const writeDatabase = (storage, database) => {
  try {
    storage.setItem(LOCAL_DATABASE_KEY, JSON.stringify(database))
  } catch {
    throw createError('The local database could not be saved.', 'storage-write')
  }
}

/**
 * Fetches and validates the public baseline database.
 *
 * Failure classes are kept separate so the UI can distinguish a network failure, a non-success
 * HTTP response, and malformed content. An AbortError is preserved unchanged because request
 * cancellation is expected control flow for callers that supplied an AbortSignal.
 *
 * The public asset must never contain `localAuthAccounts`: even schema-valid password-derived
 * records are private browser data and would be a deployment leak if bundled in the seed.
 *
 * @param {{ url: string, fetchImpl: typeof fetch, signal?: AbortSignal }} dependencies
 * @returns {Promise<object>} A schema-valid public seed.
 * @throws {LocalDatabaseError | DOMException} For fetch, HTTP, content, or cancellation failure.
 */
const fetchSeedDatabase = async ({ url, fetchImpl, signal }) => {
  let response

  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw createError('The local database seed could not be reached.', 'seed-network', {
      cause: error,
    })
  }

  if (!response?.ok) {
    throw createError('The local database seed is temporarily unavailable.', 'seed-http', {
      status: response.status,
    })
  }

  let seed
  try {
    seed = await response.json()
  } catch {
    throw createError('The local database seed is invalid.', 'seed-invalid')
  }

  if (seed !== null && typeof seed === 'object' && Object.hasOwn(seed, 'localAuthAccounts')) {
    throw createError('The local database seed is invalid.', 'seed-invalid')
  }

  try {
    return assertValidDatabase(seed)
  } catch {
    throw createError('The local database seed is invalid.', 'seed-invalid')
  }
}

/**
 * Adds missing reserved demo profiles from the seed without replacing stored profiles.
 *
 * A seed demo identity is considered reserved by both UID and canonical email. There are four
 * intentional outcomes for each seed demo:
 *
 * 1. Neither value exists locally: append the demo profile.
 * 2. UID and email identify the same local demo: keep the stored profile unchanged.
 * 3. The UID identifies a local demo but its old email differs: keep it so a later auth flow can
 *    rotate profile email and the matching auth record together.
 * 4. Any other UID/email collision: fail closed rather than overwrite or combine identities.
 *
 * Registered local profiles and non-demo seed profiles are not introduced or altered here.
 *
 * @param {object[]} seedProfiles - Profiles supplied by the newly fetched public seed.
 * @param {object[]} storedProfiles - Profiles currently owned by browser storage.
 * @returns {object[]} A cloned stored list with only safe missing demo profiles appended.
 * @throws {LocalDatabaseError} With `refresh-invalid` for an identity collision.
 */
const mergeSeedDemoProfiles = (seedProfiles, storedProfiles) => {
  const merged = cloneValue(storedProfiles)

  for (const seedProfile of seedProfiles.filter(({ dataClass }) => dataClass === 'local-demo')) {
    const uidIndex = merged.findIndex(({ uid }) => uid === seedProfile.uid)
    const emailIndex = merged.findIndex(({ email }) => email === seedProfile.email)

    if (uidIndex === -1 && emailIndex === -1) {
      merged.push(cloneValue(seedProfile))
      continue
    }

    // Preserve a legacy demo email until authentication can rotate its
    // matching profile and protected password together in one transaction.
    if (uidIndex !== -1 && emailIndex === -1 && merged[uidIndex].dataClass === 'local-demo') {
      continue
    }

    // A reserved demo UID and email must identify the same existing demo profile.
    // Conflicts fail closed instead of overwriting a locally registered identity.
    if (
      uidIndex === -1 ||
      emailIndex === -1 ||
      uidIndex !== emailIndex ||
      merged[uidIndex].dataClass !== 'local-demo'
    ) {
      throw createError('The local database refresh is invalid.', 'refresh-invalid')
    }
  }

  return merged
}

/**
 * Performs the minimal reconciliation used when the seed catalogue is not newer.
 *
 * Dataset metadata, services, ratings, auth records, and all existing profile fields stay from
 * storage. Only newly introduced, conflict-free demo identities may make this path report a
 * change. `mergeSeedDemoProfiles` can only append or throw, so a length comparison is sufficient.
 *
 * @param {object} seed - Newly fetched and validated public seed.
 * @param {object} stored - Valid snapshot selected from browser storage.
 * @returns {{ database: object, changed: boolean }} Reconciled snapshot and persistence signal.
 */
const synchronizeSeedDemoProfiles = (seed, stored) => {
  const synchronizedProfiles = mergeSeedDemoProfiles(
    seed.collections.userProfiles,
    stored.collections.userProfiles,
  )

  if (synchronizedProfiles.length === stored.collections.userProfiles.length) {
    return { database: stored, changed: false }
  }

  const synchronized = cloneValue(stored)
  synchronized.collections.userProfiles = synchronizedProfiles

  try {
    return { database: assertValidDatabase(synchronized), changed: true }
  } catch {
    throw createError('The local database refresh is invalid.', 'refresh-invalid')
  }
}

/**
 * Builds a refreshed snapshot when the public seed has a later dataset timestamp.
 *
 * Ownership rules for a refresh are explicit:
 *
 * - Start with the seed, replacing public dataset metadata and the service catalogue.
 * - Preserve every stored profile; append only safe missing demo profiles from the seed.
 * - Preserve all stored service ratings, which are user-created local content.
 * - Preserve private local auth accounts when that optional collection exists.
 *
 * The finished aggregate is validated again because independently valid seed and stored inputs
 * can still form invalid cross-record relationships after they are combined.
 *
 * @param {object} seed - Newer, validated public seed.
 * @param {object} stored - Valid browser-owned snapshot.
 * @returns {object} A valid refreshed snapshot ready to persist.
 * @throws {LocalDatabaseError} With `refresh-invalid` when the merged aggregate is invalid.
 */
const mergeNewerSeed = (seed, stored) => {
  const refreshed = cloneValue(seed)
  // This is defense in depth after `fetchSeedDatabase` has already rejected the property.
  delete refreshed.localAuthAccounts
  refreshed.collections.userProfiles = mergeSeedDemoProfiles(
    seed.collections.userProfiles,
    stored.collections.userProfiles,
  )
  refreshed.collections.serviceRatings = cloneValue(stored.collections.serviceRatings)

  if (Object.hasOwn(stored, 'localAuthAccounts')) {
    refreshed.localAuthAccounts = cloneValue(stored.localAuthAccounts)
  }

  try {
    return assertValidDatabase(refreshed)
  } catch {
    throw createError('The local database refresh is invalid.', 'refresh-invalid')
  }
}

/**
 * Adds one load or update to the module-local FIFO promise chain.
 *
 * Both fulfillment and rejection start the next operation, so one failure never poisons the
 * queue. The stored tail absorbs rejection to avoid an unhandled promise while the original
 * `queued` promise still reports that failure to its own caller. This ordering prevents a public
 * refresh in the same module instance from overtaking or rolling back a preceding local write.
 *
 * @template T
 * @param {() => T | Promise<T>} operation - Work to start after the prior operation settles.
 * @returns {Promise<T>} This operation's independently observable result.
 */
const enqueueDatabaseOperation = (operation) => {
  const queued = databaseQueue.then(operation, operation)
  databaseQueue = queued.catch(() => undefined)
  return queued
}

/**
 * Typed error for local database transport, persistence, reconciliation, and validation failures.
 *
 * Stable codes currently belong to these groups:
 *
 * - `storage-*`: localStorage access, content, schema, or write failure.
 * - `seed-*`: public seed network, HTTP, or content failure.
 * - `refresh-invalid`: seed and local data could not be reconciled safely.
 * - `invalid-mutator`, `invalid-mutation`, `clone-failed`: update contract failure.
 *
 * A `status` is present only for an HTTP seed failure, and `cause` is retained only where an
 * underlying exception is useful and safe to expose to application diagnostics.
 */
export class LocalDatabaseError extends Error {
  /**
   * @param {string} message - Non-sensitive, stable error message.
   * @param {{ code?: string, status?: number, cause?: unknown }} [details] - Stable failure details.
   */
  constructor(message, { code, status, cause } = {}) {
    super(message)
    this.name = 'LocalDatabaseError'
    this.code = code

    if (status !== undefined) {
      this.status = status
    }

    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

/**
 * Implements the load decision tree without entering the public operation queue.
 *
 * This private form is used by `updateLocalDatabase` while that update already owns its queue
 * position; calling the queued public loader from inside an update would deadlock behind itself.
 * A successful seed fetch is required on every load, including when a valid stored snapshot is
 * available, because the repository must compare dataset versions and synchronize demo profiles.
 *
 * Decision table:
 *
 * - No valid stored snapshot: initialize and persist a clone of the seed.
 * - Seed timestamp is equal/older: retain storage, adding only missing safe demo profiles.
 * - Seed timestamp is newer: refresh seed-owned data while preserving browser-owned data.
 *
 * @param {object} [options]
 * @param {string} [options.url]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Storage} [options.localStorage]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} A defensive clone of the selected and persisted snapshot.
 */
async function loadLocalDatabaseInternal({
  url = DEFAULT_DATABASE_URL,
  fetchImpl = globalThis.fetch,
  localStorage = getDefaultStorage(),
  signal,
} = {}) {
  const seed = await fetchSeedDatabase({ url, fetchImpl, signal })
  const { database: stored, migratedFromLegacy } = readAvailableStoredDatabase(localStorage)

  // First run, or recovery from only invalid stored generations: seed a clean current key.
  if (stored === null) {
    const initialized = cloneValue(seed)
    writeDatabase(localStorage, initialized)
    return cloneValue(initialized)
  }

  // ISO UTC timestamps use a lexicographically sortable canonical format enforced by the schema.
  if (seed.dataset.updatedAt <= stored.dataset.updatedAt) {
    // Demo identities are part of the local authentication contract, not the
    // public catalogue version. Synchronize newly introduced demo profiles even
    // when a user's stored catalogue timestamp is equal to or newer than seed.
    const synchronized = synchronizeSeedDemoProfiles(seed, stored)
    if (migratedFromLegacy || synchronized.changed) {
      writeDatabase(localStorage, synchronized.database)
    }
    return cloneValue(synchronized.database)
  }

  // A strictly newer seed becomes the public-data baseline; local ownership survives the merge.
  const refreshed = mergeNewerSeed(seed, stored)
  writeDatabase(localStorage, refreshed)
  return cloneValue(refreshed)
}

/**
 * Loads the validated local snapshot, initializing or refreshing it from the public seed.
 *
 * The returned object never aliases the stored or queued working snapshot. Mutating it has no
 * persistence effect; callers must use `updateLocalDatabase` to commit changes. Because the seed
 * is fetched on every call, this function is not an offline-only localStorage read.
 *
 * @param {object} [options]
 * @param {string} [options.url] - Versioned public seed endpoint.
 * @param {typeof fetch} [options.fetchImpl] - Injectable fetch implementation.
 * @param {Storage} [options.localStorage] - Injectable persistent storage.
 * @param {AbortSignal} [options.signal] - Optional request cancellation signal.
 * @returns {Promise<object>} A defensive clone of the valid database snapshot.
 * @throws {LocalDatabaseError} When seed, storage, or validation operations fail.
 */
export function loadLocalDatabase(options = {}) {
  return enqueueDatabaseOperation(() => loadLocalDatabaseInternal(options))
}

/**
 * Applies one serialized mutation to a complete local snapshot and persists it after validation.
 *
 * Mutation commit order is: load -> clone -> mutate -> validate -> clone result -> write. The
 * candidate mutation is not written if the mutator throws, produces an invalid database, or
 * returns a value that cannot satisfy the defensive-clone return contract. The preceding load can
 * still persist first-run initialization, legacy-key migration, or a seed refresh. Side effects
 * performed inside the caller's mutator are outside this repository and cannot be rolled back.
 *
 * @template T
 * @param {(database: object, context: { now: Date }) => T | Promise<T>} mutator - Receives an isolated mutable clone.
 * @param {object} [options] - Same dependency options accepted by {@link loadLocalDatabase}.
 * @param {() => Date} [options.clock] - Injectable mutation-time source for feature repositories.
 * @returns {Promise<{ database: object, result: T }>} Defensive copies of the persisted snapshot and result.
 * @throws {LocalDatabaseError} When the mutator is invalid or produces an invalid snapshot.
 */
export function updateLocalDatabase(mutator, options = {}) {
  // Reject before taking a queue position because no repository state needs to be inspected.
  if (typeof mutator !== 'function') {
    return Promise.reject(createError('A local database mutation is required.', 'invalid-mutator'))
  }

  return enqueueDatabaseOperation(async () => {
    // Use the unqueued loader: this update already owns the current queue position.
    const current = await loadLocalDatabaseInternal(options)

    // The mutator receives an isolated working copy and one shared timestamp for all records it
    // changes. Its return value is independent metadata for the caller, not part of the database.
    const candidate = cloneValue(current)
    const now = cloneValue((options.clock ?? (() => new Date()))())
    const result = await mutator(candidate, { now })

    // Validate the whole aggregate so record limits, uniqueness, and cross-record references are
    // checked together before any persistent state changes.
    try {
      assertValidDatabase(candidate)
    } catch {
      throw createError('The local database update is invalid.', 'invalid-mutation')
    }

    let persistedDatabase
    let returnedResult
    try {
      // Clone both values before the write. This prevents committing successfully and only then
      // discovering that the function cannot honor its defensive-copy return contract.
      persistedDatabase = cloneValue(candidate)
      returnedResult = cloneValue(result)
    } catch {
      throw createError('The local database update could not be saved.', 'clone-failed')
    }

    const storage = options.localStorage ?? getDefaultStorage()

    // This setItem is the candidate mutation's commit point; its validation and cloning are done.
    writeDatabase(storage, persistedDatabase)

    return {
      database: persistedDatabase,
      result: returnedResult,
    }
  })
}
