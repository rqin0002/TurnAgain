import { computed, nextTick, ref, toValue, watch } from 'vue'

import { LOCATION_COPY } from './useLocationOrigin.js'

const MAP_NOTICE_TEXT =
  'Showing central Melbourne. Your location was not shared. Type a suburb or postcode to search near it.'

/**
 * The location prompt flows of Find nearby: Use my location (the
 * map's control and the pending location chip), Nearest and Map ask the device from the person's
 * click, and each flow finishes on the device's answer. The view owns the map, so it passes the
 * moves a flow ends on (`recentreOnOrigin`, `showMelbourne`).
 *
 * A prompt flow ends on the device's answer, not on the origin's status:
 * a typed place stays the origin when the device says no, and the person still hears
 * why. A fix completes the intent. A failure ends it with the device's copy; nearest and the map
 * then use a typed place that stayed, and Map without one shows central Melbourne. The canonical
 * watcher drops near=me. A fix names its source in the URL: its patch drops the typed
 * place (`location: ''`); the item stays whatever the URL already carries.
 *
 * @param {{ locationOrigin: ReturnType<typeof import('./useLocationOrigin.js').useLocationOrigin>, update: (patch: object) => Promise<void>, isMapView: import('vue').MaybeRefOrGetter<boolean>, recentreOnOrigin: () => Promise<void> | void, showMelbourne: () => Promise<void> | void }} options
 */
export function useLocationPrompts({
  locationOrigin,
  update,
  isMapView,
  recentreOnOrigin,
  showMelbourne,
}) {
  const { status: originStatus, deviceStatus } = locationOrigin
  const pendingIntent = ref(null)
  const locationMessage = ref('')
  const mapNotice = ref(false)
  const mapNoticeText = computed(() => (mapNotice.value ? MAP_NOTICE_TEXT : ''))

  const focusWhereField = async () => {
    await nextTick()
    document.getElementById('location-search')?.focus()
  }

  const finishLocating = async (device) => {
    const intent = pendingIntent.value
    if (!intent || device === null) return
    pendingIntent.value = null
    if (device === 'granted') {
      const patch = { near: true, location: '' }
      if (intent === 'nearest') await update({ ...patch, sort: 'nearest' })
      else if (intent === 'map') await update({ ...patch, view: 'map' })
      else await update(patch)
      await recentreOnOrigin()
      return
    }
    const typedKept = originStatus.value === 'ready'
    if (intent === 'map' && !typedKept) {
      mapNotice.value = true
      if (!toValue(isMapView)) await update({ view: 'map' })
      await showMelbourne()
      return
    }
    locationMessage.value = LOCATION_COPY[device]
    if (intent === 'map') {
      if (!toValue(isMapView)) await update({ view: 'map' })
      await recentreOnOrigin()
      return
    }
    if (intent === 'nearest' && typedKept) await update({ sort: 'nearest' })
    await focusWhereField()
  }
  watch(deviceStatus, finishLocating)

  const requestLocation = (intent) => {
    pendingIntent.value = intent
    locationMessage.value = ''
    locationOrigin.requestLocation()
    // A device without geolocation answers inside the call, possibly with the value it already had,
    // which no watcher hears; the browser's own answers, a fix included, arrive through the watcher.
    const device = deviceStatus.value
    if (device !== null && device !== 'granted') void finishLocating(device)
  }
  const dismissMapNotice = () => {
    mapNotice.value = false
  }

  return { locationMessage, mapNotice, mapNoticeText, requestLocation, dismissMapNotice }
}
