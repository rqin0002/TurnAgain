<script>
/**
 * Chunk warm-up: the view calls this once the catalogue is ready and the
 * browser is online, so a later Map press while offline finds the Leaflet chunk in the browser
 * cache ("Map needs a connection" is then about tiles, never a missing chunk). This file stays
 * the only one that imports `leaflet` (a lazy chunk); failures are swallowed on purpose.
 */
export const warmUpMapChunks = () =>
  Promise.allSettled([import('leaflet'), import('leaflet/dist/leaflet.css')])
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/shared/components/AppButton.vue'

import {
  fromLeafletBounds,
  isFitBoundsNoop,
  isPanInsideNoop,
  isSetViewNoop,
  toLeafletBounds,
} from '../domain/mapIntent.js'
import { isMappableGeo } from '../domain/nearbyServices.js'
import { PLACES_ATTRIBUTION } from '../domain/postcodeCentroids.js'
import { formatAreaLine, formatDistance, formatPinName } from '../domain/resultsCopy.js'

/**
 * The one map: the results map and, with `single`, the Service Detail
 * mini-map. Leaflet is the only heavy import and is loaded lazily on mount. Every
 * pin is a class-only `divIcon` (no `style=` attribute, so `style-src 'self'` holds),
 * named "3. Mernda Repair Cafe, 4.2 km"; the selected pin alone is in the tab order (roving
 * tabindex) and the Previous/Next place buttons are the keyboard path. The
 * Service Detail pin is a picture (`role="img"`), unnumbered and out of the keyboard path.
 *
 * Programmatic-flag protocol: animations are off, every programmatic call passes
 * `animate: false` and runs inside `runProgrammatic`, so the one synchronous `moveend` Leaflet
 * fires (also for an unchanged view) is classified as that move's own. User intent is
 * read from the DOM: pointer, wheel, touch and key events on the container set
 * `userIntent`, which a user-attributed `moveend` consumes or a short grace timer clears. A
 * `moveend` with neither flag is never the user's. `setView`/`fitBounds` are skipped entirely
 * when their predicate says no-op, and `panInside` is the only silent Leaflet call.
 */
const props = defineProps({
  /** `useDiscoveryResults` `visible` entries: `{ service, distanceKm, index }` plus the view's `matchLabel`. */
  items: { type: Array, default: () => [] },
  origin: { type: Object, default: null },
  /** Kilometres; 0 draws no ring (the view passes 0 while a viewport is applied). */
  radiusKm: { type: Number, default: 0 },
  selectedId: { type: String, default: '' },
  /**
   * The view owns follow mode and its 300 ms debounce; the map does not read this prop.
   */
  follow: { type: Boolean, default: false },
  /** `[lat, lng]` pairs from the route result's `geometry`, or null. */
  route: { type: Array, default: null },
  single: { type: Boolean, default: false },
  /** False while the offline banner is up: the "Map needs a connection" line. */
  online: { type: Boolean, default: true },
  /** True while the view's geolocation request is in flight: the Use my location control is busy. */
  locating: { type: Boolean, default: false },
})
const emit = defineEmits([
  'select-service',
  'user-move-end',
  'programmatic-move-end',
  'request-location',
])
const router = useRouter()

const MELBOURNE = Object.freeze({ latitude: -37.8136, longitude: 144.9631 })
const MELBOURNE_ZOOM = 11
const RECENTRE_ZOOM = 13
const SINGLE_ZOOM = 15
const TOOLTIP_ZOOM = 13
const INTENT_GRACE_MS = 250
const FIT_OPTIONS = Object.freeze({ padding: [48, 48], maxZoom: 15 })
/** Room above the pin for its popup, and a margin on the other sides. */
const PAN_OPTIONS = Object.freeze({ paddingTopLeft: [48, 160], paddingBottomRight: [48, 48] })
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a> | Routing &copy; OpenStreetMap contributors, FOSSGIS | ' +
  PLACES_ATTRIBUTION
const DOM_INTENT_START = ['pointerdown', 'wheel', 'touchstart', 'keydown']
const DOM_INTENT_END = ['pointerup', 'pointercancel', 'touchend', 'keyup']

const container = ref(null)
const status = ref('loading')
const tileError = ref(false)
let leaflet
let map
let pins
let overlays
let resizeObserver
let disposed = false
let programmaticDepth = 0
let userIntent = false
let graceTimer
let openPopupMarker = null
/** The last view command issued before Leaflet loaded; `loadMap` applies it. */
let pendingView = null
/**
 * A view has been chosen: a fit of real points, a parent's `recentre`/`fitTo`/`focusPin`, or a
 * user move. Items that arrive later frame the map only while it is false.
 */
let framed = false
const markerById = new Map()

const mappable = computed(() => props.items.filter((entry) => isMappableGeo(entry.service.geo)))
// Previous/Next place step from pin to pin: an entry without a map position has
// no pin to focus, so the buttons skip it.
const position = computed(() =>
  mappable.value.findIndex((entry) => entry.service.id === props.selectedId),
)
const previousId = computed(() =>
  position.value > 0 ? mappable.value[position.value - 1].service.id : '',
)
const nextId = computed(() => {
  const index = position.value < 0 ? 0 : position.value + 1
  return index < mappable.value.length ? mappable.value[index].service.id : ''
})
const showConnectionLine = computed(() => !props.online || tileError.value)
// One status line stays mounted from loading to ready, so its changes are announced.
const statusText = computed(() => {
  if (showConnectionLine.value) return 'Map needs a connection. The list stays available.'
  return status.value === 'loading' ? 'Loading map…' : ''
})
// An area record's pin is the centre of its postcode area, never the venue.
const singleHelp = computed(() => {
  const service = props.items[0]?.service
  if (service?.geo?.precision !== 'area') return 'The pin marks this place.'
  const area = service.postcode ? `the ${service.postcode} area` : 'the area'
  return `The hollow pin marks the centre of ${area}; the exact venue is not published.`
})
// A device fix is "your approximate location"; a typed place is the centre of the search (its
// locality point), never the person's position.
const originTitle = computed(() =>
  props.origin?.source === 'typed'
    ? `Search centre: ${props.origin.label}`
    : 'Your approximate location',
)
const originSentence = computed(() => {
  if (!props.origin) return ''
  return props.origin.source === 'typed'
    ? `The shaded circle marks the search centre, ${props.origin.label}.`
    : 'The shaded circle is your approximate location.'
})

// Leaflet's tooltips and popups write a string with innerHTML (DivOverlay._updateContent), so
// every string handed to them goes through this first: a service name is data, never markup.
const escapeHtml = (value) =>
  String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')

// --- the programmatic-flag protocol -----------------------------------------------------------

const runProgrammatic = (fn) => {
  if (!map) return
  // A pan or zoom animation never runs (all animations are off), but a stale `moveend` from an
  // in-flight animation would steal the flag; stop it first and let it classify alone.
  if (map._panAnim?._inProgress || map._animatingZoom) map.stop()
  programmaticDepth += 1
  try {
    fn()
  } finally {
    programmaticDepth -= 1
  }
}
const onMoveEnd = () => {
  if (!map) return
  const bounds = fromLeafletBounds(map.getBounds())
  if (programmaticDepth > 0) {
    emit('programmatic-move-end', bounds)
    return
  }
  if (userIntent) {
    userIntent = false
    framed = true
    clearTimeout(graceTimer)
    emit('user-move-end', bounds)
    return
  }
  // Neither flag (a resize, Leaflet's own bookkeeping): never attributed to the user.
  emit('programmatic-move-end', bounds)
}
const markIntent = () => {
  userIntent = true
  clearTimeout(graceTimer)
}
const armGrace = () => {
  clearTimeout(graceTimer)
  graceTimer = setTimeout(() => {
    userIntent = false
  }, INTENT_GRACE_MS)
}
const onIntentStart = (event) => {
  markIntent()
  if (event.type === 'wheel') armGrace()
}
const onIntentEnd = () => {
  armGrace()
}

// A command that arrives while the Leaflet chunk is still loading (the view switches to the map
// and recentres in the same tick) is kept and applied by `loadMap`, never dropped.
const recentre = ({ latitude, longitude }, zoom = RECENTRE_ZOOM) => {
  if (!map) {
    pendingView = { kind: 'view', run: () => recentre({ latitude, longitude }, zoom) }
    return
  }
  framed = true
  const center = { lat: latitude, lng: longitude }
  if (isSetViewNoop(map, center, zoom)) return
  runProgrammatic(() => map.setView(center, zoom, { animate: false }))
}
const fitTo = (bounds) => {
  if (!map) {
    pendingView = { kind: 'view', run: () => fitTo(bounds) }
    return
  }
  framed = true
  if (isFitBoundsNoop(map, bounds, FIT_OPTIONS)) return
  runProgrammatic(() => map.fitBounds(toLeafletBounds(bounds), { ...FIT_OPTIONS, animate: false }))
}
// "Show on map" from a card below the map: the pin is of no use focused while the canvas is off
// screen or under the sticky band, so the canvas is brought to the middle of the window first.
const revealCanvas = (revealTop) => {
  const rect = container.value?.getBoundingClientRect?.()
  if (!rect) return
  const viewportBottom = window.innerHeight || document.documentElement.clientHeight
  if (rect.top >= revealTop && rect.bottom <= viewportBottom) return
  container.value.scrollIntoView?.({ block: 'center' })
}
/**
 * Brings a pin into view and opens its popup; `focus: false` leaves focus where it is (the
 * Previous/Next place buttons keep it so a person can keep stepping). `revealTop` is the bottom,
 * in viewport pixels, of whatever sticky band covers the top of the window (the view's chip row
 * below 992 px, the header height from 992 px). The map does not know the page layout, so
 * the view measures it.
 */
const focusPin = (id, { focus = true, revealTop = 0 } = {}) => {
  if (!map) {
    pendingView = { kind: 'pin', run: () => focusPin(id, { focus, revealTop }) }
    return
  }
  framed = true
  const marker = markerById.get(id)
  if (!marker) return
  if (focus) revealCanvas(revealTop)
  const latlng = marker.getLatLng()
  if (!isPanInsideNoop(map, latlng, PAN_OPTIONS)) {
    runProgrammatic(() => map.panInside(latlng, { ...PAN_OPTIONS, animate: false }))
  }
  if (focus) marker.getElement()?.focus({ preventScroll: true })
  marker.openPopup()
}
defineExpose({ recentre, fitTo, focusPin })

// --- the Use my location control ------------------------------------------------------------

const LOCATE_LABEL = 'Use my location'
const LOCATE_BUSY_LABEL = 'Finding your location…'
let locateButton = null
const syncLocateButton = () => {
  if (!locateButton) return
  locateButton.textContent = props.locating ? LOCATE_BUSY_LABEL : LOCATE_LABEL
  if (props.locating) locateButton.setAttribute('aria-busy', 'true')
  else locateButton.removeAttribute('aria-busy')
}
/**
 * The site's one device-location request: a real button in a Leaflet bar at the top right, under
 * the zoom control, so it sits in the map's own control container and in its tab order. It asks
 * the view (`request-location`), which runs the prompt flow the form's pill used to start. The
 * click is no map gesture: the bar swallows it as Leaflet's own zoom bar does, and the
 * recentre a fix ends on is a programmatic move. While the request is in flight the button reads
 * busy and swallows clicks, as AppButton does.
 */
const addLocateControl = () => {
  const LocateControl = leaflet.Control.extend({
    onAdd: () => {
      const bar = document.createElement('div')
      bar.className = 'leaflet-bar nearby-map__locate'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'nearby-map__locate-button'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        if (!props.locating) emit('request-location')
      })
      bar.append(button)
      leaflet.DomEvent.disableClickPropagation(bar)
      locateButton = button
      syncLocateButton()
      return bar
    },
    onRemove: () => {
      locateButton = null
    },
  })
  new LocateControl({ position: 'topright' }).addTo(map)
}
watch(() => props.locating, syncLocateButton)

// --- pins, overlays and the initial view -----------------------------------------------------

const boundsOf = (points) => ({
  south: Math.min(...points.map((point) => point.latitude)),
  west: Math.min(...points.map((point) => point.longitude)),
  north: Math.max(...points.map((point) => point.latitude)),
  east: Math.max(...points.map((point) => point.longitude)),
})
const popupHtml = (entry) => {
  const { service, distanceKm: distance, matchLabel = '' } = entry
  const line = service.geo.precision === 'area' ? formatAreaLine(service) : formatDistance(distance)
  const href = router.resolve({ name: 'service-detail', params: { serviceId: service.id } }).href
  return (
    `<p class="nearby-pin__popup-name">${escapeHtml(service.name)}</p>` +
    (matchLabel ? `<p class="nearby-pin__popup-match">${escapeHtml(matchLabel)}</p>` : '') +
    (line ? `<p class="nearby-pin__popup-line">${escapeHtml(line)}</p>` : '') +
    `<a class="nearby-pin__popup-link" href="${escapeHtml(href)}" data-service-id="${escapeHtml(service.id)}">View details</a>`
  )
}
const applySelection = () => {
  if (props.single) return
  for (const [id, marker] of markerById) {
    const element = marker.getElement()
    if (!element) continue
    const selected = id === props.selectedId
    element.classList.toggle('nearby-pin--selected', selected)
    element.tabIndex = selected ? 0 : -1
  }
}
// A results pin is a control: a click or Enter/Space selects its service, and its popup links to
// the service's page. The Service Detail pin is a picture of where the place is and gets none.
const bindPinControls = (marker, entry) => {
  const { service } = entry
  marker.on('click', () => emit('select-service', service.id, 'pin'))
  marker.on('keydown', ({ originalEvent }) => {
    if (originalEvent.key === 'Enter' || originalEvent.key === ' ') {
      originalEvent.preventDefault()
      emit('select-service', service.id, 'keyboard')
    }
  })
  marker.on('popupopen', ({ popup }) => {
    openPopupMarker = marker
    const link = popup.getElement()?.querySelector('a[data-service-id]')
    link?.addEventListener('click', (event) => {
      event.preventDefault()
      void router.push({ name: 'service-detail', params: { serviceId: service.id } })
    })
  })
  marker.on('popupclose', () => {
    if (openPopupMarker === marker) openPopupMarker = null
  })
  marker.bindPopup(popupHtml(entry), { autoPan: false, className: 'nearby-pin__popup' })
}
const buildPins = () => {
  if (!map) return
  pins.clearLayers()
  markerById.clear()
  openPopupMarker = null
  for (const entry of mappable.value) {
    const { service, index, distanceKm: distance } = entry
    const area = service.geo.precision === 'area'
    const selected = !props.single && service.id === props.selectedId
    // The pin's name is its aria-label alone: a native title would add a second, mouse-only name.
    const pinName = formatPinName({
      index: props.single ? null : index,
      name: service.name,
      distanceKm: distance,
      area,
    })
    const marker = leaflet.marker([service.geo.latitude, service.geo.longitude], {
      icon: leaflet.divIcon({
        className:
          'nearby-pin' +
          (area ? ' nearby-pin--area' : '') +
          (selected ? ' nearby-pin--selected' : ''),
        html: `<span class="nearby-pin__label" aria-hidden="true">${props.single ? '' : index}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
      interactive: !props.single,
      keyboard: selected,
      autoPanOnFocus: false,
    })
    // The permanent tooltip repeats the name; it is decoration for sighted users only.
    marker.on('tooltipopen', ({ tooltip }) => {
      tooltip.getElement()?.setAttribute('aria-hidden', 'true')
      marker.getElement()?.removeAttribute('aria-describedby')
    })
    marker.bindTooltip(escapeHtml(service.name), {
      permanent: true,
      direction: 'top',
      offset: [0, -14],
      className: 'nearby-pin__tooltip',
    })
    if (!props.single) bindPinControls(marker, entry)
    marker.addTo(pins)
    const element = marker.getElement()
    if (element) {
      element.setAttribute('aria-label', pinName)
      if (props.single) {
        element.setAttribute('role', 'img')
      } else {
        element.setAttribute('role', 'button')
        element.tabIndex = selected ? 0 : -1
      }
    }
    markerById.set(service.id, marker)
  }
}
const buildOverlays = () => {
  if (!map) return
  overlays.clearLayers()
  if (props.origin) {
    const centre = [props.origin.latitude, props.origin.longitude]
    // The circle takes no pointer events, so a hover tooltip could never open: its title is a
    // permanent label, shown at every zoom, in the overlay pane so pins and their names stay on
    // top. The help sentence carries the same meaning for assistive technology.
    leaflet
      .circle(centre, {
        // Radius: the device's reported accuracy clamped to 150-800 m; a typed place has no
        // accuracy and gets 150 m. The circle marks the origin, not its full error: a fix worse
        // than 800 m is drawn smaller than its real uncertainty.
        radius: Math.max(150, Math.min(props.origin.accuracyM ?? 150, 800)),
        className: 'nearby-origin',
        interactive: false,
      })
      .on('tooltipopen', ({ tooltip }) => {
        tooltip.getElement()?.setAttribute('aria-hidden', 'true')
      })
      .bindTooltip(escapeHtml(originTitle.value), {
        permanent: true,
        direction: 'top',
        pane: 'overlayPane',
        className: 'nearby-origin__label',
      })
      .addTo(overlays)
    if (props.radiusKm > 0) {
      leaflet
        .circle(centre, {
          radius: props.radiusKm * 1000,
          className: 'nearby-radius',
          interactive: false,
        })
        .addTo(overlays)
    }
  }
  if (Array.isArray(props.route) && props.route.length > 1) {
    leaflet.polyline(props.route, { className: 'nearby-route', interactive: false }).addTo(overlays)
  }
}
const updateLabelsClass = () => {
  container.value?.classList.toggle('nearby-map__canvas--labels', map.getZoom() >= TOOLTIP_ZOOM)
}
const showInitialView = () => {
  const points = mappable.value.map((entry) => entry.service.geo)
  if (props.origin) points.push(props.origin)
  if (props.single) {
    if (points.length > 1) fitTo(boundsOf(points))
    else if (points.length === 1) recentre(points[0], SINGLE_ZOOM)
    return
  }
  if (points.length > 1) fitTo(boundsOf(points))
  else if (points.length === 1) recentre(points[0], RECENTRE_ZOOM)
}

const closePopupWithEscape = (event) => {
  if (event.key !== 'Escape' || !openPopupMarker) return
  event.preventDefault()
  const marker = openPopupMarker
  marker.closePopup()
  marker.getElement()?.focus({ preventScroll: true })
}
const moveWithKeyboard = (event) => {
  if (!map || event.target !== container.value) return
  const offsets = {
    ArrowLeft: [-80, 0],
    ArrowRight: [80, 0],
    ArrowUp: [0, -80],
    ArrowDown: [0, 80],
  }
  if (offsets[event.key]) {
    event.preventDefault()
    map.panBy(offsets[event.key], { animate: false })
  } else if (['+', '=', '-'].includes(event.key)) {
    event.preventDefault()
    const next = map.getZoom() + (event.key === '-' ? -1 : 1)
    // Leaflet clamps the zoom and still fires moveend, which would report a move that never
    // happened; the intent the keydown armed is dropped instead.
    if (next < map.getMinZoom() || next > map.getMaxZoom()) {
      userIntent = false
      return
    }
    map.setZoom(next, { animate: false })
  }
}

const loadMap = async () => {
  status.value = 'loading'
  tileError.value = false
  framed = false
  try {
    const module = await import('leaflet')
    await import('leaflet/dist/leaflet.css')
    if (disposed) return
    leaflet = module.default ?? module
    const wide =
      typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 992px)').matches
    map = leaflet.map(container.value, {
      zoomControl: false,
      scrollWheelZoom: wide && !props.single,
      keyboard: false,
      inertia: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    })
    const element = map.getContainer()
    for (const type of DOM_INTENT_START) element.addEventListener(type, onIntentStart, true)
    for (const type of DOM_INTENT_END) element.addEventListener(type, onIntentEnd, true)
    element.addEventListener('keydown', closePopupWithEscape, true)
    map.on('moveend', onMoveEnd)
    map.on('zoomend', updateLabelsClass)
    // Leaflet needs a view before any getCenter(); the first one is a programmatic move too.
    runProgrammatic(() =>
      map.setView([MELBOURNE.latitude, MELBOURNE.longitude], MELBOURNE_ZOOM, { animate: false }),
    )
    leaflet
      .tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION })
      .on('tileerror', () => {
        tileError.value = true
      })
      // One failed tile (a 429, a brief drop-out) must not leave the line up for the session.
      .on('tileload', () => {
        tileError.value = false
      })
      .addTo(map)
    // The zoom control at the top right and the Use my location control under it; the
    // Service Detail mini-map keeps its zoom there too and gets no location control.
    leaflet.control.zoom({ position: 'topright' }).addTo(map)
    if (!props.single) addLocateControl()
    overlays = leaflet.layerGroup().addTo(map)
    pins = leaflet.layerGroup().addTo(map)
    buildOverlays()
    buildPins()
    // A recentre or fit asked for during the load is the first view; a pin focus still needs one.
    const queued = pendingView
    pendingView = null
    if (queued?.kind !== 'view') showInitialView()
    queued?.run()
    updateLabelsClass()
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        if (map) runProgrammatic(() => map.invalidateSize({ animate: false }))
      })
      resizeObserver.observe(container.value)
    }
    status.value = 'ready'
  } catch (error) {
    // Development only: a chunk or Leaflet fault the owner should see; the page shows the alert.
    if (import.meta.env.DEV) console.warn('[turnagain] the map could not load', error)
    map?.remove()
    map = null
    if (!disposed) status.value = 'error'
  }
}

// The catalogue or a typed place's results can arrive after Leaflet loaded: the first real points
// frame the map, unless a view was already chosen.
watch(
  () => props.items,
  () => {
    buildPins()
    if (map && !framed && mappable.value.length > 0) showInitialView()
  },
)
watch(() => props.selectedId, applySelection)
watch([() => props.origin, () => props.radiusKm, () => props.route], buildOverlays)
onMounted(loadMap)
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(graceTimer)
  resizeObserver?.disconnect()
  markerById.clear()
  locateButton = null
  map?.remove()
  map = null
})
</script>

<template>
  <section
    class="nearby-map"
    :class="{ 'nearby-map--single': single }"
    :aria-labelledby="single ? undefined : 'nearby-map-heading'"
    :aria-label="single ? 'Map of this location' : undefined"
  >
    <header v-if="!single" class="nearby-map__header">
      <h2 id="nearby-map-heading" tabindex="-1">Map of these results</h2>
      <div class="nearby-map__nav">
        <AppButton
          variant="secondary"
          :disabled="previousId === ''"
          @click="emit('select-service', previousId, 'keyboard')"
        >
          Previous place
        </AppButton>
        <AppButton
          variant="secondary"
          :disabled="nextId === ''"
          @click="emit('select-service', nextId, 'keyboard')"
        >
          Next place
        </AppButton>
      </div>
    </header>
    <p :id="single ? 'nearby-map-help-single' : 'nearby-map-help'" class="nearby-map__help">
      <template v-if="single">{{ singleHelp }} {{ originSentence }}</template>
      <template v-else
        >Numbered pins match the list. Use Previous place and Next place to move between pins, arrow
        keys to move the map and + or − to zoom. {{ originSentence }}</template
      >
    </p>
    <div v-if="status === 'error'" class="nearby-map__error">
      <p role="alert">The map could not load. The full results list is still available.</p>
      <AppButton variant="text" @click="loadMap">Retry map</AppButton>
    </div>
    <div
      ref="container"
      class="nearby-map__canvas"
      role="region"
      aria-label="Service locations map"
      :aria-describedby="single ? 'nearby-map-help-single' : 'nearby-map-help'"
      tabindex="0"
      @keydown="moveWithKeyboard"
    ></div>
    <p
      class="nearby-map__status"
      :class="{ 'nearby-map__connection': showConnectionLine }"
      role="status"
    >
      {{ statusText }}
    </p>
  </section>
</template>

<style scoped>
.nearby-map {
  margin-bottom: 1.5rem;
}

.nearby-map__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.nearby-map__header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.nearby-map__nav {
  display: flex;
  gap: 0.5rem;
}

.nearby-map p {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.nearby-map__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.nearby-map__help {
  margin: 0 0 0.75rem;
}

/* Never display: none, which would remove the live region; an empty line only loses its margin. */
.nearby-map__status:empty {
  margin: 0;
}

.nearby-map__canvas {
  height: clamp(18rem, 50vh, 30rem);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  z-index: 0;
  background: var(--color-surface-muted);
  margin-bottom: 0.75rem;
}

.nearby-map--single .nearby-map__canvas {
  height: clamp(14rem, 40vh, 22rem);
}

/* Tiles follow the theme through one token: never inverted. */
.nearby-map__canvas :deep(.leaflet-tile-pane) {
  filter: var(--map-tile-filter);
}

/* Pins: the circle is a pseudo-element so the selected scale never fights Leaflet's inline
   transform on the icon element itself (CSSOM positioning). */
.nearby-map__canvas :deep(.nearby-pin) {
  display: grid;
  place-items: center;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.nearby-map__canvas :deep(.nearby-pin)::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px solid var(--color-on-brand);
  border-radius: 50%;
  background: var(--color-brand);
  box-shadow: 0 1px 3px rgb(0 0 0 / 35%);
  transition: transform var(--duration-fast);
}

.nearby-map--single .nearby-map__canvas :deep(.nearby-pin) {
  cursor: default;
}

.nearby-map__canvas :deep(.nearby-pin--area)::before {
  border: 2px dashed var(--color-brand);
  background: var(--color-surface);
}

.nearby-map__canvas :deep(.nearby-pin__label) {
  position: relative;
  color: var(--color-on-brand);
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1;
}

.nearby-map__canvas :deep(.nearby-pin--area .nearby-pin__label) {
  color: var(--color-brand-strong);
}

.nearby-map__canvas :deep(.nearby-pin--selected)::before {
  transform: scale(1.25);
  outline: 3px solid var(--color-heading);
  outline-offset: 2px;
}

.nearby-map__canvas :deep(.nearby-pin:focus-visible) {
  outline: 3px solid var(--color-focus);
  outline-offset: 4px;
}

.nearby-map__canvas :deep(.nearby-pin__tooltip) {
  display: none;
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.8125rem;
}

.nearby-map__canvas--labels :deep(.nearby-pin__tooltip) {
  display: block;
}

/* Leaflet paints the arrow white; it follows the tooltip's surface in both themes. */
.nearby-map__canvas :deep(.leaflet-tooltip-top.nearby-pin__tooltip)::before {
  border-top-color: var(--color-surface);
}

.nearby-map__canvas :deep(.nearby-pin__popup .leaflet-popup-content-wrapper),
.nearby-map__canvas :deep(.nearby-pin__popup .leaflet-popup-tip) {
  background: var(--color-surface);
  color: var(--color-text);
}

.nearby-map__canvas :deep(.nearby-pin__popup .leaflet-popup-content-wrapper) {
  border-radius: var(--radius-small);
}

.nearby-map__canvas :deep(.leaflet-popup-close-button) {
  color: var(--color-text-muted);
}

.nearby-map__canvas :deep(.leaflet-popup-close-button:hover),
.nearby-map__canvas :deep(.leaflet-popup-close-button:focus-visible) {
  color: var(--color-text);
}

.nearby-map__canvas :deep(.nearby-pin__popup-name) {
  margin: 0 0 0.25rem;
  color: var(--color-heading);
  font-weight: 650;
}

.nearby-map__canvas :deep(.nearby-pin__popup-match),
.nearby-map__canvas :deep(.nearby-pin__popup-line) {
  margin: 0 0 0.25rem;
  color: var(--color-text-muted);
}

.nearby-map__canvas :deep(.nearby-pin__popup-link) {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  color: var(--color-link);
  font-weight: 600;
}

.nearby-map__canvas :deep(.nearby-origin) {
  fill: var(--color-brand);
  fill-opacity: 0.18;
  stroke: var(--color-brand);
  stroke-width: 1.5;
}

.nearby-map__canvas :deep(.nearby-origin__label) {
  border-color: var(--color-brand);
  background: var(--color-surface);
  color: var(--color-heading);
  font-size: 0.75rem;
  font-weight: 600;
  box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
}

/* Leaflet paints the arrow white; it follows the label's own border in both themes. */
.nearby-map__canvas :deep(.leaflet-tooltip-top.nearby-origin__label)::before {
  border-top-color: var(--color-brand);
}

.nearby-map__canvas :deep(.nearby-radius) {
  fill: none;
  stroke: var(--color-brand);
  stroke-width: 1.5;
  stroke-dasharray: 6 6;
}

.nearby-map__canvas :deep(.nearby-route) {
  fill: none;
  stroke: var(--color-brand-strong);
  stroke-width: 5;
  stroke-opacity: 0.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nearby-map__canvas :deep(.leaflet-control-attribution) {
  max-width: 100%;
  background: var(--color-surface);
  color: var(--color-text);
}

/* Underlined so the credit links are told apart from the surrounding text by more than colour. */
.nearby-map__canvas :deep(.leaflet-control-attribution a) {
  color: var(--color-brand-strong);
  text-decoration: underline;
}

.nearby-map__canvas :deep(.leaflet-bar a) {
  background: var(--color-surface);
  color: var(--color-text);
  border-bottom-color: var(--color-border);
}

.nearby-map__canvas :deep(.leaflet-bar a.leaflet-disabled) {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  cursor: default;
}

/* The Use my location control: a real button in a Leaflet bar, themed like the zoom bar. */
.nearby-map__canvas :deep(.nearby-map__locate-button) {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  border: 0;
  border-radius: inherit;
  background: var(--color-surface);
  padding: 0 0.75rem;
  color: var(--color-text);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
}

.nearby-map__canvas :deep(.nearby-map__locate-button:hover) {
  background: var(--color-surface-muted);
}

.nearby-map__canvas :deep(.nearby-map__locate-button:focus-visible) {
  outline: 3px solid var(--color-focus);
  outline-offset: -3px;
}

.nearby-map__canvas :deep(.nearby-map__locate-button[aria-busy='true']) {
  color: var(--color-text-muted);
  cursor: progress;
}
</style>
