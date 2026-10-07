import { shallowRef } from 'vue'

import { isCoordinate } from '../domain/nearbyServices.js'
import { resolveTypedOrigin } from '../domain/postcodeCentroids.js'

export { placeLookupFailedCopy, unknownPlaceCopy } from '../domain/postcodeCentroids.js'

/**
 * The search origin: one module-level state for the page session, memory only. It
 * survives View details -> Back and disappears on reload, which is the one reading that keeps
 * "never stored" literally true; nothing here is cleared on unmount. Coordinates are rounded to
 * 3 dp before they enter state and the device accuracy is floored at 150 m. `requestLocation`
 * must be called from the user's click (the prompt appears on the call); `restoreIfGranted`
 * re-acquires silently only when the permission is already granted and never prompts on load.
 *
 * `status` and `error` describe the effective origin; the device's own answer is `deviceStatus`,
 * because a failed request never takes down a typed place: the typed origin
 * stays `ready` and the view still learns that the device said no. `resolvingTyped` is true while
 * the latest typed lookup runs (the places chunk may still be loading), so the view can wait for
 * it before judging `sort=nearest`.
 *
 * Find nearby keeps a device origin only while its URL says `near=me`, and a failed
 * request with no typed place clears it, so `denied` or `unavailable` never sits beside a
 * stale device fix.
 *
 * Who started a request decides a typed place's fate: behind a request the person started
 * (`requestLocation`, from a click) the place waits as the fallback; a place the person
 * submits while the silent restore of a `near=me` reload runs wins, because that restore was not
 * the person's act, and the restore's request is retired so its late answer is discarded.
 */

export const LOCATION_COPY = Object.freeze({
  denied: 'Location permission was denied. Type a suburb or postcode instead.',
  timeout: 'Location request timed out. Try again or type a suburb or postcode.',
  unavailable: 'Your location is unavailable. Type a suburb or postcode instead.',
  unsupported: 'Location is unavailable on this device. Type a suburb or postcode instead.',
})
export const GEOLOCATION_LABEL = 'your location'

const origin = shallowRef(null)
const status = shallowRef('idle')
const error = shallowRef('')
/** @type {import('vue').ShallowRef<null | 'granted' | 'denied' | 'timeout' | 'unavailable' | 'unsupported'>} */
const deviceStatus = shallowRef(null)
const resolvingTyped = shallowRef(false)
// `epoch` counts clearOrigin and requestLocation calls: a geolocation answer is used only while
// its request is current. `lookups` counts typed lookups: only the latest one is used. `clearedAt`
// is the epoch of the last clearOrigin. `fallback` is the typed origin that a geolocation request
// in flight superseded; it becomes the origin if that request fails.
// `silentRequestEpoch` is the epoch of the request restoreIfGranted started, or 0 once the person
// adopted it with requestLocation; it names the current request only while it equals
// `epoch`.
let epoch = 0
let lookups = 0
let clearedAt = 0
let fallback = null
let silentRequestEpoch = 0

const round3 = (value) => Math.round(value * 1000) / 1000

/**
 * @param {object} [options]
 * @param {Geolocation | undefined} [options.geolocation]
 * @param {Permissions | undefined} [options.permissions]
 * @param {(text: string) => Promise<{ latitude: number, longitude: number, label: string } | null>} [options.resolvePlace]
 */
export function useLocationOrigin({
  geolocation = globalThis.navigator?.geolocation,
  permissions = globalThis.navigator?.permissions,
  resolvePlace = resolveTypedOrigin,
} = {}) {
  const applyTyped = (typed) => {
    origin.value = typed
    status.value = 'ready'
    error.value = ''
  }

  const clearOrigin = () => {
    epoch += 1
    clearedAt = epoch
    fallback = null
    origin.value = null
    status.value = 'idle'
    error.value = ''
    deviceStatus.value = null
    // A lookup still running is discarded when it lands, so nothing is resolving any more.
    resolvingTyped.value = false
  }

  const fail = (code, copy) => {
    status.value = code
    error.value = copy
  }

  /**
   * The device said no (`denied`, `timeout`, `unavailable`, `unsupported`). The outcome is always
   * reported in `deviceStatus`; a typed place (the one the request superseded, or the one already
   * applied) stays the origin with `ready`; otherwise the origin is cleared and the status and the
   * copy carry the failure.
   */
  const failLocating = (outcome) => {
    deviceStatus.value = outcome
    const typed = fallback ?? (origin.value?.source === 'typed' ? origin.value : null)
    fallback = null
    if (typed) {
      applyTyped(typed)
      return
    }
    origin.value = null
    fail(outcome === 'denied' ? 'denied' : 'unavailable', LOCATION_COPY[outcome])
  }

  /** The silent restore's request is the current one and still waiting for the device. */
  const silentRequestPending = () =>
    silentRequestEpoch !== 0 && silentRequestEpoch === epoch && status.value === 'pending'

  const startRequest = ({ silent }) => {
    if (status.value === 'pending') {
      // A click on Use my location while the silent restore runs adopts that request: the person
      // asked for the device now, so a place submitted afterwards waits behind it.
      if (!silent) silentRequestEpoch = 0
      return
    }
    epoch += 1
    const request = epoch
    silentRequestEpoch = silent ? request : 0
    error.value = ''
    deviceStatus.value = null
    if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
      failLocating('unsupported')
      return
    }
    status.value = 'pending'
    geolocation.getCurrentPosition(
      (position) => {
        if (request !== epoch) return
        const coords = position?.coords
        if (!isCoordinate(coords)) {
          failLocating('unavailable')
          return
        }
        fallback = null
        deviceStatus.value = 'granted'
        origin.value = {
          latitude: round3(coords.latitude),
          longitude: round3(coords.longitude),
          accuracyM: Number.isFinite(coords.accuracy) ? Math.max(coords.accuracy, 150) : null,
          source: 'geolocation',
          label: GEOLOCATION_LABEL,
        }
        status.value = 'ready'
        error.value = ''
      },
      (failure) => {
        if (request !== epoch) return
        if (failure?.code === 1) failLocating('denied')
        else if (failure?.code === 3) failLocating('timeout')
        else failLocating('unavailable')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    )
  }

  const requestLocation = () => startRequest({ silent: false })

  /**
   * A typed suburb or postcode. Resolves whether the text names a place (false: the form shows
   * the error, the state is untouched). Only the latest typed lookup is used, and never after a
   * `clearOrigin` issued while it ran. A geolocation request (in flight when the lookup started,
   * or issued while it ran) wins: the typed place waits behind it and becomes the origin only if
   * that request fails (denied, timeout, unavailable, unsupported), so a reload of
   * `near=me&location=…` ends on the device position whichever answer lands first (the URL's
   * place starts its lookup before the restore asks the device). The exception: a lookup
   * started while the silent restore's request was waiting is the person's own submission, so its
   * place becomes the origin when it resolves and that request is retired (its late answer is
   * discarded); a fix that landed first is replaced, and the device's answer stays reported. A
   * click on Use my location before the place resolves adopts the request, and the place waits behind it again.
   * `resolvingTyped` is true from the call until the latest lookup's answer is applied, discarded
   * or fails (a rejected places chunk still rejects to the caller), or until `clearOrigin`.
   */
  const setTypedOrigin = async (text) => {
    lookups += 1
    const lookup = lookups
    const started = epoch
    const behindLocating = status.value === 'pending'
    const duringSilentRestore = silentRequestPending()
    fallback = null
    resolvingTyped.value = true
    try {
      const place = await resolvePlace(text)
      if (!place) return false
      if (lookup !== lookups || clearedAt > started) return true
      const typed = {
        latitude: round3(place.latitude),
        longitude: round3(place.longitude),
        accuracyM: null,
        source: 'typed',
        label: place.label,
      }
      // Still the restore's request (waiting, or answered since) and not adopted by a click on Use
      // my location since: the person's place wins. A click adopts it, so the place waits behind it.
      if (duringSilentRestore && epoch === started && silentRequestEpoch === started) {
        if (status.value === 'pending') {
          epoch += 1
          silentRequestEpoch = 0
        }
        fallback = null
        applyTyped(typed)
        return true
      }
      const located = behindLocating || epoch !== started
      // Behind a request in flight: keep it as the fallback. Otherwise apply it, unless the
      // geolocation request it waited behind found the device. That is the device's answer, not
      // `status`: a refusal that re-applied an older typed place is `ready` as well.
      if (status.value === 'pending') fallback = typed
      else if (!located || deviceStatus.value !== 'granted') applyTyped(typed)
      return true
    } finally {
      if (lookup === lookups) resolvingTyped.value = false
    }
  }

  /**
   * On a load with `near=me`: re-acquire only when already granted; never prompt. A `clearOrigin`
   * while the permission query runs wins: the answer is `'cleared'` and nothing is requested.
   *
   * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unsupported' | 'cleared'>}
   */
  const restoreIfGranted = async () => {
    const startedAt = epoch
    let state
    try {
      if (!permissions || typeof permissions.query !== 'function') return 'unsupported'
      state = (await permissions.query({ name: 'geolocation' })).state
    } catch {
      return 'unsupported'
    }
    if (clearedAt > startedAt) return 'cleared'
    if (state === 'granted') {
      startRequest({ silent: true })
      return 'granted'
    }
    if (state === 'denied') {
      failLocating('denied')
      return 'denied'
    }
    // At prompt the device has not answered in this page session: a stale refusal is forgotten.
    deviceStatus.value = null
    return 'prompt'
  }

  return {
    origin,
    status,
    error,
    deviceStatus,
    resolvingTyped,
    requestLocation,
    setTypedOrigin,
    clearOrigin,
    restoreIfGranted,
  }
}
