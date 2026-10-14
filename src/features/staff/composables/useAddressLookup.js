import { onScopeDispose, shallowRef, watch } from 'vue'
import { melbourneDayKey } from '@shared/melbourneTime.js'

import { resolveTypedOrigin } from '@/features/discovery/domain/postcodeCentroids.js'
import { isAbortError } from '@/shared/data/RepositoryError.js'

import { searchAddress } from '../data/addressLookupRepository.js'
import {
  areaGeo,
  areaPointFor,
  isLookupReady,
  isPositionCurrent,
  locationKey,
  lookupQuery,
  toCandidates,
  venueGeo,
} from '../domain/serviceLocation.js'

/** How long typing must pause before the address is looked up (also the provider's 1 s spacing). */
export const LOOKUP_PAUSE_MS = 1000

/**
 * Finds the map position for the service form's address and hands it to the form. A lookup runs
 * only while Show on map is ticked, the suburb and a four-digit postcode are there and the draft
 * has no position for the address as it now reads; it waits for `LOOKUP_PAUSE_MS` after the last
 * change, or runs at once on `flush()` (a place field was left). One exact place is taken (`adopt`
 * with the position and the address key it belongs to); several wait for `choose` or `chooseArea`;
 * none, or no street address, takes the area point of the typed suburb and postcode. Only the
 * latest lookup counts: a change of the address, of Show on map or of the record (`recordKey`), and
 * the end of the form's scope, abort the request in flight and drop its answer. A failure leaves
 * the draft untouched and names its kind for the status line; the repository's one-a-second gate
 * is waited out without a failure. Nothing is kept beyond this visit.
 *
 * @param {{ location: () => object, recordKey: () => string, adopt: (geo: object, matchedFor: string) => void }} options
 */
export function useAddressLookup({ location, recordKey, adopt }) {
  const phase = shallowRef('idle')
  const failure = shallowRef('')
  const note = shallowRef('')
  const matchedLabel = shallowRef('')
  const candidates = shallowRef([])

  let sequence = 0
  let timer = null
  let controller = null
  let choiceKey = ''

  /** Ends whatever is waiting or in flight: its answer, when it comes, changes nothing. */
  const stop = () => {
    sequence += 1
    clearTimeout(timer)
    timer = null
    controller?.abort()
    controller = null
  }
  // An answer counts only while it is the latest lookup and the draft still needs a position for
  // the same address with Show on map ticked.
  const stillWanted = (started, key) => {
    const current = location()
    return (
      started === sequence &&
      current.showOnMap &&
      locationKey(current) === key &&
      !isPositionCurrent(current)
    )
  }
  const today = () => melbourneDayKey(new Date())
  const fail = (kind) => {
    candidates.value = []
    failure.value = kind
    phase.value = 'failed'
  }
  const take = (geo, key, { label = '', reason = '' } = {}) => {
    candidates.value = []
    failure.value = ''
    matchedLabel.value = label
    note.value = reason
    phase.value = 'idle'
    adopt(geo, key)
  }
  const schedule = (delay) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void run()
    }, delay)
  }

  async function takeArea(started, key, reason) {
    const current = location()
    const postcode = current.postcode.trim()
    const point = areaPointFor(
      await resolveTypedOrigin(`${current.suburb.trim()} ${postcode}`),
      postcode,
    )
    if (!stillWanted(started, key)) return
    if (point === null) {
      fail('not-found')
    } else {
      take(areaGeo(point, today()), key, { reason })
    }
  }

  async function run() {
    const current = location()
    if (!current.showOnMap || isPositionCurrent(current) || !isLookupReady(current)) return
    stop()
    const started = sequence
    const key = locationKey(current)
    controller = new AbortController()
    const { signal } = controller
    candidates.value = []
    failure.value = ''
    phase.value = 'locating'
    try {
      const query = lookupQuery(current)
      const matches =
        query === '' ? [] : toCandidates(await searchAddress(query, { signal }), current.postcode)
      if (!stillWanted(started, key)) return
      if (matches.length === 1) {
        take(venueGeo(matches[0], today()), key, { label: matches[0].label })
      } else if (matches.length > 1) {
        choiceKey = key
        candidates.value = matches
        phase.value = 'choose'
      } else {
        await takeArea(started, key, query === '' ? 'no-street' : 'no-exact-match')
      }
    } catch (error) {
      if (isAbortError(error) || !stillWanted(started, key)) return
      const code = error?.details?.code
      if (code === 'too-soon') {
        phase.value = 'pending'
        schedule(error.details.retryAfterMs)
      } else if (error?.code === 'offline') {
        fail('offline')
      } else {
        fail(code === 'rate-limited' ? 'busy' : 'unavailable')
      }
    }
  }

  /** After a change of the address, of Show on map or of the record: wait for a pause, or rest. */
  const evaluate = ({ addressChanged }) => {
    if (addressChanged) {
      note.value = ''
      matchedLabel.value = ''
    }
    stop()
    candidates.value = []
    failure.value = ''
    const current = location()
    if (!current.showOnMap || isPositionCurrent(current) || !isLookupReady(current)) {
      phase.value = 'idle'
      return
    }
    phase.value = 'pending'
    schedule(LOOKUP_PAUSE_MS)
  }

  watch(
    [
      () => location().showOnMap,
      () => locationKey(location()),
      () => isPositionCurrent(location()),
    ],
    ([, key], [, previousKey] = []) =>
      evaluate({ addressChanged: previousKey !== undefined && previousKey !== key }),
    { immediate: true },
  )
  watch(recordKey, () => evaluate({ addressChanged: true }))
  onScopeDispose(stop)

  /** A place field was left: a lookup waiting for the pause runs now. */
  function flush() {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    void run()
  }

  /** Asks again after a failed lookup. */
  function retry() {
    if (phase.value === 'failed') void run()
  }

  /** Takes one of the offered places, while the address is the one they were offered for. */
  function choose(candidate) {
    if (phase.value !== 'choose' || !candidates.value.includes(candidate)) return
    const key = locationKey(location())
    if (key !== choiceKey) return
    take(venueGeo(candidate, today()), key, { label: candidate.label })
  }

  /** Takes the area of the typed suburb and postcode instead of any offered place. */
  async function chooseArea() {
    if (phase.value !== 'choose' || locationKey(location()) !== choiceKey) return
    stop()
    const started = sequence
    const key = choiceKey
    candidates.value = []
    phase.value = 'locating'
    try {
      await takeArea(started, key, 'area-chosen')
    } catch {
      if (stillWanted(started, key)) fail('unavailable')
    }
  }

  return { phase, failure, note, matchedLabel, candidates, flush, retry, choose, chooseArea }
}
