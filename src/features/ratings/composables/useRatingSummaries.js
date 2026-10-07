import { onBeforeUnmount, shallowRef, toValue, watch } from 'vue'

import { fetchRatingSummaries, readCachedRatingSummaries } from '../data/ratingSummaryRepository.js'

/**
 * Rating summaries for the services a page shows (spec 6.4, 10.4); the view passes them down.
 * Stale-while-revalidate (spec 11): the persisted summaries for the requested ids paint first
 * with `freshness: 'cached'`, and the read replaces them. What a failed id shows depends on why
 * it failed: a transport failure (offline, unreachable) keeps the saved copy, while a summary the
 * server confirmed missing or invalid is removed and the id stays in `failedIds`, the incomplete
 * set, so a ranking never counts its coverage as complete because of it. The last results this
 * composable resolved for an id set are the other fallback: a refresh of the same ids that fails
 * while the storage copy is unavailable keeps them on screen, dated to when they were obtained,
 * and when both copies exist the newer one wins for the ids it holds and the other fills only the
 * ids it lacks, so an older stored envelope (readable, but the latest persist failed on quota)
 * never overwrites what this page resolved later. Superseding a request in flight and clearing
 * what is shown are separate: `load()` clears only when the id set differs from the one on screen.
 * A round merges into what is shown: a summary already on screen outranks the saved copy, a
 * transport failure or a failed read keeps it, and `savedAt` dates the oldest summary shown.
 *
 * Two ways to name the ids (exactly one): `services` (records, as Home passes them: a change
 * resets everything) or `ids` (the discovery candidate set, spec 6.4 D3: a change prunes only
 * the ids that left, so a pan in follow mode never blanks the summaries, M4-D10).
 *
 * @param {object} options
 * @param {import('vue').MaybeRefOrGetter<object[]>} [options.services]
 * @param {import('vue').MaybeRefOrGetter<string[]>} [options.ids]
 * @param {(ids: string[], options: object) => Promise<{ summariesById: object, failures: Array<{ id: string, reason: 'transport' | 'missing' | 'invalid' }> }>} [options.loader]
 * @param {(() => { value: object, savedAt: Date } | null) | null} [options.cached]
 */
export function useRatingSummaries({
  services,
  ids,
  loader = fetchRatingSummaries,
  cached = readCachedRatingSummaries,
}) {
  const status = shallowRef('idle')
  const summariesById = shallowRef({})
  /** The incomplete set: ids with no summary to show (transport failures without a copy, missing, invalid). */
  const failedIds = shallowRef([])
  const freshness = shallowRef('none')
  const savedAt = shallowRef(null)
  let controller
  let sequence = 0
  /** The id set the shown state belongs to. */
  let shownKey = null
  /** The last round that resolved, `{ key, byId, savedAt }`, kept across resets for its id set. */
  let lastGood = null

  const listIds = () =>
    ids === undefined ? toValue(services).map((service) => service.id) : [...toValue(ids)]
  const keyOf = (list) => [...new Set(list)].sort().join('\n')
  const olderOf = (a, b) => (a === null || (b !== null && b.getTime() < a.getTime()) ? b : a)
  /** When the oldest summary on screen was obtained; a fresh set dates from the read behind it. */
  const shownAt = () => {
    if (Object.keys(summariesById.value).length === 0) return null
    return freshness.value === 'fresh' ? lastGood.savedAt : savedAt.value
  }
  const invalidate = () => {
    ++sequence
    controller?.abort()
  }
  const clear = () => {
    summariesById.value = {}
    failedIds.value = []
    freshness.value = 'none'
    savedAt.value = null
    status.value = 'idle'
    shownKey = null
  }
  /** Supersedes any request in flight and clears the shown state; the last good results stay. */
  const reset = () => {
    invalidate()
    clear()
  }
  /** Keeps the summaries of the ids still listed and drops the ones that left (M4-D10). */
  const dropDeparted = (keep) => {
    const kept = new Set(keep)
    summariesById.value = Object.fromEntries(
      Object.entries(summariesById.value).filter(([id]) => kept.has(id)),
    )
    failedIds.value = failedIds.value.filter((id) => kept.has(id))
    if (Object.keys(summariesById.value).length === 0) {
      freshness.value = 'none'
      savedAt.value = null
    }
  }
  /** The `ids` watcher: a changed set supersedes the request in flight and prunes the departed. */
  const prune = () => {
    const list = listIds()
    if (keyOf(list) === shownKey) return
    invalidate()
    dropDeparted(list)
    status.value = 'idle'
    shownKey = null
  }
  const cachedFor = (list) => {
    const hit = cached ? cached() : null
    if (!hit) {
      return { entries: {}, savedAt: null }
    }
    const entries = {}
    for (const id of list) {
      if (Object.hasOwn(hit.value, id)) entries[id] = hit.value[id]
    }
    return Object.keys(entries).length > 0
      ? { entries, savedAt: hit.savedAt }
      : { entries: {}, savedAt: null }
  }
  /**
   * The storage copy for these ids and the last good results for the same id set, merged by
   * recency: the copy with the newer `savedAt` wins for the ids it holds (the last good results
   * on a tie), the other fills only the ids it lacks, and `savedAt` is the adopted copy's.
   */
  const fallbackFor = (list, key) => {
    const saved = cachedFor(list)
    const remembered = lastGood?.key === key ? lastGood : null
    if (!remembered) return saved
    if (saved.savedAt === null) return { entries: remembered.byId, savedAt: remembered.savedAt }
    const rememberedIsNewer = remembered.savedAt.getTime() >= saved.savedAt.getTime()
    const [adopted, other] = rememberedIsNewer
      ? [{ entries: remembered.byId, savedAt: remembered.savedAt }, saved]
      : [saved, { entries: remembered.byId, savedAt: remembered.savedAt }]
    return { entries: { ...other.entries, ...adopted.entries }, savedAt: adopted.savedAt }
  }
  const load = async () => {
    invalidate()
    const request = sequence
    controller = new AbortController()
    const list = listIds()
    const key = keyOf(list)
    if (shownKey !== key) {
      if (ids === undefined) clear()
      else dropDeparted(list)
    }
    shownKey = key
    status.value = 'loading'
    // What an earlier round left on screen (nothing after a clear) outranks the saved copy.
    const kept = summariesById.value
    const keptAt = shownAt()
    const fallback = fallbackFor(list, key)
    // Paint the saved copy for the ids not on screen yet (all of them after a clear).
    const missing = Object.fromEntries(
      Object.entries(fallback.entries).filter(([id]) => !Object.hasOwn(kept, id)),
    )
    if (Object.keys(missing).length > 0) {
      summariesById.value = { ...kept, ...missing }
      freshness.value = 'cached'
      savedAt.value = olderOf(keptAt, fallback.savedAt)
    }
    try {
      const result = await loader(list, { signal: controller.signal, concurrency: 4 })
      if (request !== sequence || controller.signal.aborted) return
      const byId = { ...result.summariesById }
      const failed = []
      let oldestCopyAt = null
      for (const { id, reason } of result.failures) {
        if (reason === 'transport' && Object.hasOwn(kept, id)) {
          byId[id] = kept[id]
          oldestCopyAt = olderOf(oldestCopyAt, keptAt)
        } else if (reason === 'transport' && Object.hasOwn(fallback.entries, id)) {
          byId[id] = fallback.entries[id]
          oldestCopyAt = olderOf(oldestCopyAt, fallback.savedAt)
        } else {
          failed.push(id)
        }
      }
      summariesById.value = byId
      failedIds.value = failed
      freshness.value = oldestCopyAt === null ? 'fresh' : 'cached'
      savedAt.value = oldestCopyAt
      status.value = 'ready'
      lastGood = { key, byId, savedAt: savedAt.value ?? new Date() }
    } catch (error) {
      if (request !== sequence || error?.name === 'AbortError') return
      // The shown set already holds the kept summaries and the saved copy for the rest.
      const shown = summariesById.value
      failedIds.value = list.filter((id) => !Object.hasOwn(shown, id))
      if (Object.keys(shown).length > 0) {
        savedAt.value = shownAt()
        freshness.value = 'cached'
        status.value = 'ready'
        return
      }
      status.value = 'error'
    }
  }
  // Invalidate before a consumer's queued catalogue-ready watcher starts the
  // next load. A queued reset could otherwise erase that fresh request.
  if (ids === undefined) watch(services, reset, { flush: 'sync' })
  else watch(() => toValue(ids), prune, { flush: 'sync' })
  onBeforeUnmount(reset)
  return { status, summariesById, failedIds, freshness, savedAt, load, retry: load, reset }
}
