import { computed, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue'

import { getRoute } from '../data/routeRepository.js'
import { distanceKm, isCoordinate, isVenueGeo } from '../domain/nearbyServices.js'
import { estimateTrip } from '../domain/trip.js'

/**
 * The trip state of Service Detail (spec 6.5, D1): `estimate` is the straight-line fallback for
 * a venue (never for an `area` record), `request(mode)` asks FOSSGIS once per click, and the
 * status says what the panel renders: `ready` with a route (or, for public transport, the links
 * alone), `estimated` after a refusal or a failed fetch (the estimate plus the links, with
 * `retryAfterMs` when the rate gate refused), `offline` when the fetch rejected while the device
 * said it was offline. A new origin or destination resets.
 *
 * @param {{ origin: import('vue').MaybeRefOrGetter<object | null>, destination: import('vue').MaybeRefOrGetter<object | null>, serviceId: import('vue').MaybeRefOrGetter<string>, loader?: typeof getRoute }} options
 */
export function useTripRoute({ origin, destination, serviceId, loader = getRoute }) {
  const status = ref('idle')
  const mode = ref('walking')
  const route = shallowRef(null)
  const error = shallowRef(null)
  const retryAfterMs = ref(0)
  let controller = null
  let sequence = 0

  const estimate = computed(() => {
    const from = toValue(origin)
    const to = toValue(destination)
    if (!isCoordinate(from) || !isVenueGeo(to)) return null
    return estimateTrip(distanceKm(from, to), mode.value)
  })

  // Every request and every reset retires the request in flight, including a switch to public
  // transport, so a late walking route never lands under another mode or a new origin.
  const cancelPending = () => {
    sequence += 1
    controller?.abort()
    controller = null
    return sequence
  }

  // The rate gate's wait outlives a reset: a mode change must not re-enable Directions before the
  // window the router asked for has passed (decision M4-D11).
  const reset = () => {
    cancelPending()
    status.value = 'idle'
    route.value = null
    error.value = null
  }

  const request = async (nextMode) => {
    const current = cancelPending()
    mode.value = nextMode
    route.value = null
    error.value = null
    if (nextMode === 'transit') {
      status.value = 'ready'
      return
    }
    const from = toValue(origin)
    const to = toValue(destination)
    if (!isCoordinate(from) || !isVenueGeo(to)) {
      status.value = 'idle'
      return
    }
    // Only a request that reaches the router clears the gate's wait; public transport and a
    // missing origin make none, so they must leave Directions disabled until the window passes.
    retryAfterMs.value = 0
    controller = new AbortController()
    status.value = 'loading'
    try {
      const result = await loader(
        { origin: from, destination: to, mode: nextMode, serviceId: toValue(serviceId) },
        { signal: controller.signal },
      )
      if (current !== sequence) return
      route.value = result
      status.value = 'ready'
    } catch (caught) {
      if (current !== sequence || caught?.name === 'AbortError') return
      error.value = caught
      retryAfterMs.value = Number.isFinite(caught?.details?.retryAfterMs)
        ? caught.details.retryAfterMs
        : 0
      status.value = caught?.code === 'offline' ? 'offline' : 'estimated'
    }
  }

  watch([() => toValue(origin), () => toValue(destination)], reset)
  // Leaving the page abandons a route still loading rather than letting it finish unseen.
  onScopeDispose(cancelPending)

  return { status, mode, route, estimate, error, retryAfterMs, request, reset }
}
