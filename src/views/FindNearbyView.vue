<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { useActivityCatalogue } from '@/features/activities/composables/useActivityCatalogue.js'
import { selectRelatedActivities } from '@/features/activities/domain/activityCatalogue.js'
import DiscoveryChips from '@/features/discovery/components/DiscoveryChips.vue'
import NearbyMap, { warmUpMapChunks } from '@/features/discovery/components/NearbyMap.vue'
import RelatedActivities from '@/features/discovery/components/RelatedActivities.vue'
import SearchForm from '@/features/discovery/components/SearchForm.vue'
import SearchResults from '@/features/discovery/components/SearchResults.vue'
import { useDiscoveryResults } from '@/features/discovery/composables/useDiscoveryResults.js'
import { useFindNearbyQuery } from '@/features/discovery/composables/useFindNearbyQuery.js'
import { useFollowViewport } from '@/features/discovery/composables/useFollowViewport.js'
import { useItemCategories } from '@/features/discovery/composables/useItemCategories.js'
import { useLastSearch } from '@/features/discovery/composables/useLastSearch.js'
import {
  placeLookupFailedCopy,
  unknownPlaceCopy,
  useLocationOrigin,
} from '@/features/discovery/composables/useLocationOrigin.js'
import { useLocationPrompts } from '@/features/discovery/composables/useLocationPrompts.js'
import { useServiceCatalogue } from '@/features/discovery/composables/useServiceCatalogue.js'
import { boundsAround } from '@/features/discovery/domain/mapViewport.js'
import { isMappableGeo } from '@/features/discovery/domain/nearbyServices.js'
import { loadPlaces } from '@/features/discovery/domain/postcodeCentroids.js'
import { formatMatchLabel } from '@/features/discovery/domain/resultsCopy.js'
import { useRatingSummaries } from '@/features/ratings/composables/useRatingSummaries.js'
import AppButton from '@/shared/components/AppButton.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { focusAfterAction } from '@/shared/composables/focusAfterAction.js'
import { useMinuteClock } from '@/shared/composables/useMinuteClock.js'
import { useOnlineStatus } from '@/shared/composables/useOnlineStatus.js'

/**
 * Find nearby, the composition root of discovery: the URL is the
 * single truth (`useFindNearbyQuery`), the origin lives in the module-level
 * `useLocationOrigin`, the results pipeline is `useDiscoveryResults`, the rating summaries for
 * the candidate set come from the ratings feature here and go back in, and the
 * activities for RelatedActivities load here. `useLocationPrompts` runs the Use my location,
 * Nearest and Map prompt flows, and `useFollowViewport` holds the map viewport reducer and the
 * follow-mode debounce. Nothing redirects to Home: an invalid query key is dropped in memory and
 * the form shows the field error.
 *
 * The URL names the origin's source: `near=me` stands only for a device fix (or one
 * being restored) and `location=` only for a typed place. Submitting a place drops `near=me`, a
 * granted fix drops `location=`, and a URL with neither key keeps no origin. Reload states
 * are the exception: the next search or Use my location reconciles them.
 */
const MELBOURNE = Object.freeze({ latitude: -37.8136, longitude: 144.9631 })
const MELBOURNE_ZOOM = 11
const ORIGIN_ZOOM = 13

/** The box around some map positions; one position gives a zero-size box, which maxZoom caps. */
const boundsOfPoints = (points) => {
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  return {
    south: Math.min(...latitudes),
    west: Math.min(...longitudes),
    north: Math.max(...latitudes),
    east: Math.max(...longitudes),
  }
}

const catalogue = useServiceCatalogue()
// Categories an admin added are searched and labelled like the twelve.
const itemCategories = useItemCategories()
const locationOrigin = useLocationOrigin()
const { origin, status: originStatus, deviceStatus } = locationOrigin
// The URL is judged once a near=me reload has its permission answer (`restored`) and no
// typed lookup of the URL's place is running, so a cold load of
// location=3168&sort=nearest keeps nearest while the places table loads. The device's own answer
// goes in too: a failure drops near=me even behind a typed place that stays the origin.
const restored = ref(false)
const settled = () => restored.value && !locationOrigin.resolvingTyped.value
const { state, update } = useFindNearbyQuery({ originStatus, deviceStatus, settled })
const { remember } = useLastSearch()
const activities = useActivityCatalogue({ autoLoad: false })
const { online } = useOnlineStatus()

// "Open now" and each card's state for today compare the published hours with the clock, so the
// time is read again each minute on a page left open; the results pipeline reads it through a
// getter and the cards get the same reading.
const now = useMinuteClock()

// "Rating: high to low": the candidate ids go to the ratings feature from
// here and the summaries come back in. The ids are handed over only when the set itself changes
// (a new array of the same ids starts no read), and the pipeline sees 'loading', so it keeps the
// previous order, until the round for the ids listed now is ready; it also receives those ids as
// `ratingIds`, so a round covers only the candidates it was loaded for. In follow mode the ids
// move only when the 300 ms debounce of `onUserMove` applies the viewport.
const keyOf = (ids) => [...ids].sort().join('\n')
const rankedIds = shallowRef([])
const ranking = useRatingSummaries({ ids: rankedIds })
// `ratingStatus` is declared below and read lazily through the getter, because it needs
// `results.candidateIds`. `appliedViewport` is read lazily as well: `useFollowViewport` is
// called below, because the reframe its origin watcher asks for reads `results`.
const results = useDiscoveryResults({
  services: catalogue.services,
  state,
  origin,
  originStatus,
  appliedViewport: () => followViewport.appliedViewport.value,
  summariesById: ranking.summariesById,
  ratingStatus: () => ratingStatus.value,
  ratingIds: rankedIds,
  truncated: catalogue.truncated,
  categoryIndex: itemCategories.index,
  now: () => now.value,
})
const ratingStatus = computed(() =>
  keyOf(rankedIds.value) === keyOf(results.candidateIds.value) ? ranking.status.value : 'loading',
)

// The map and the moves the view commands on it.
const mapRef = ref(null)
const isMapView = computed(() => state.value.view === 'map')
const locating = computed(() => originStatus.value === 'pending')
// The Map | List button shows once a search has results: always in map view (it is the
// way back to the list), otherwise once the catalogue is ready and some place matches the item.
const showViewToggle = computed(
  () =>
    isMapView.value ||
    (catalogue.status.value === 'ready' && results.listState.value !== 'none-at-all'),
)
// Every numbered place is a pin: the primary block and, under a relaxed hint, Other options. With
// Open now on, a popup says "Hours not checked" for a place whose hours could not be read, the
// places the filter keeps without knowing they are open (its card says so at every time).
const mapItems = computed(() =>
  [...results.visible.value, ...results.otherOptions.value].map((entry) => ({
    ...entry,
    matchLabel: formatMatchLabel(results.matches.value[entry.service.id]),
    hoursUnchecked:
      results.openNow.value && results.openingById.value[entry.service.id] === 'unknown',
  })),
)
// The pill counts what the list shows: the numbered places of both blocks.
const listPill = computed(() => {
  const count = results.visible.value.length + results.otherOptions.value.length
  return `List, ${count} ${count === 1 ? 'place' : 'places'}`
})
// The card of the place selected on the map is marked only while the map is shown: in the list on
// its own the mark would point at nothing. The selection itself is kept, so the map and Previous
// place / Next place carry on from it when the map comes back. `isMapView` reads the URL, so the
// List button, a link and the browser's history all follow the same rule.
const listSelectedId = computed(() => (isMapView.value ? results.selectedId.value : ''))

const recentreOnOrigin = async (zoom = ORIGIN_ZOOM) => {
  await nextTick()
  if (origin.value) mapRef.value?.recentre(origin.value, zoom)
}
const showMelbourne = async () => {
  await nextTick()
  mapRef.value?.recentre(MELBOURNE, MELBOURNE_ZOOM)
}
// A radius frames its dashed ring; Any distance has no ring, so it recentres at the origin zoom.
const frameRadius = async (radius) => {
  await nextTick()
  if (!origin.value) return
  if (radius > 0) mapRef.value?.fitTo(boundsAround(origin.value, radius))
  else mapRef.value?.recentre(origin.value, ORIGIN_ZOOM)
}
// A typed origin frames its ring; a device fix keeps zoom 13.
const reframeOnOrigin = () =>
  origin.value?.source === 'typed' ? frameRadius(results.effectiveRadius.value) : recentreOnOrigin()

const {
  locationMessage,
  mapNotice,
  mapNoticeMessage,
  mapNoticeText,
  requestLocation,
  dismissMapNotice,
} = useLocationPrompts({
  locationOrigin,
  update,
  isMapView,
  recentreOnOrigin,
  showMelbourne,
})

// The view keeps the framing rule: a new origin reframes the map
// only in map view.
const followViewport = useFollowViewport({
  state,
  origin,
  onOriginMoved: () => {
    if (isMapView.value) void reframeOnOrigin()
  },
})
const {
  appliedViewport,
  searchAreaVisible,
  supersede: supersedeViewport,
  onUserMove,
  onProgrammaticMove,
  searchThisArea,
} = followViewport
const ringKm = computed(() => (appliedViewport.value ? 0 : results.effectiveRadius.value))

watch(
  results.candidateIds,
  (ids) => {
    if (keyOf(ids) !== keyOf(rankedIds.value)) rankedIds.value = ids
  },
  { immediate: true },
)
watch(
  [() => state.value.sort, rankedIds, catalogue.status],
  ([sort, ids, status]) => {
    if (sort === 'highest-rated' && status === 'ready' && ids.length > 0) void ranking.load()
  },
  { immediate: true },
)
const showRating = computed(() => state.value.sort === 'highest-rated')

// Searching the place already in the URL changes no key, so the lookup runs again from here:
// that is how a lookup that could not run is retried.
const onSearch = (values) => {
  const same = values.location !== '' && values.location === state.value.location
  void update({
    item: values.item,
    location: values.location,
    ...(values.location ? { near: false } : {}),
  })
  if (same) void lookUpPlace(values.location)
}
const onSort = (sort) => {
  if (sort === 'nearest' && originStatus.value !== 'ready') {
    requestLocation('nearest')
    return
  }
  void update({ sort })
}
const onView = async (view) => {
  if (view === 'list') {
    supersedeViewport({ type: 'view-changed', view: 'list' })
    await update({ view: 'list' })
    // The list with nothing to show (no match, or the catalogue still loading) has no Map button,
    // so the List button just pressed is gone: focus goes to the results heading, never <body>
    // (WCAG 2.4.3).
    await nextTick()
    if (!showViewToggle.value) document.getElementById('results-heading')?.focus()
    return
  }
  // The map opens before the request, both inside the click: a device that answers within
  // `requestLocation` (no geolocation) then navigates after this, so the prompt flow's own
  // navigation is the one that lands and its central Melbourne view reaches a mounted map.
  const opening = update({ view: 'map' })
  if (!origin.value) requestLocation('map')
  await opening
  // Framed as a new origin is: a typed place's whole radius ring; a device fix, or Any distance
  // (no ring), at zoom 13.
  await reframeOnOrigin()
}
// A control in the results column that leaves the page once its action lands (Try 20 km, Any
// distance, Show every distance, Clear map area, Retry rating summaries) sends focus to the
// results heading; one in the map column (Search this area, Dismiss) to the map heading. Both
// headings carry tabindex="-1" and stay mounted; without a target focus would fall to <body>
// (WCAG 2.4.3). The radius select in the chip row stays, so the same handler moves nothing for it.
const resultsHeading = () => document.getElementById('results-heading')
const mapHeading = () => document.getElementById('nearby-map-heading')
const onRadius = (radius) =>
  focusAfterAction(async () => {
    supersedeViewport({ type: 'radius-chosen' })
    await update({ radius })
    await frameRadius(radius)
  }, resultsHeading)
const onFollow = (follow) => update({ follow })
const onActions = (actionTypes) => update({ actionTypes })
const onOpen = (open) => update({ open })
const onClearOrigin = async () => {
  locationOrigin.clearOrigin()
  supersedeViewport({ type: 'clear-viewport' })
  await update({ near: false, location: '' })
}
// Clear map area: the whole radius again, framed as a new origin is (a typed place's ring; a
// device fix, or Any distance, at zoom 13); with no origin, the pins of both blocks (every listed
// place with a map position), and with none of those the map stays.
const onClearViewport = () =>
  focusAfterAction(async () => {
    supersedeViewport({ type: 'clear-viewport' })
    if (!isMapView.value) return
    if (origin.value) {
      await reframeOnOrigin()
      return
    }
    await nextTick()
    const points = mapItems.value.map((entry) => entry.service.geo).filter(isMappableGeo)
    if (points.length > 0) mapRef.value?.fitTo(boundsOfPoints(points))
  }, resultsHeading)
// The retry marks the summaries as loading at once, which takes the note and its button away; the
// read is started, not waited for, so focus moves then rather than after the network answers.
const onRetryRatings = () =>
  focusAfterAction(() => {
    void ranking.retry()
  }, resultsHeading)
const onSearchThisArea = () => focusAfterAction(searchThisArea, mapHeading)
const onDismissMapNotice = () => focusAfterAction(dismissMapNotice, mapHeading)

// "Show on map" reveals the canvas below whatever sticks above it: below 992 px the sticky chip
// row; from 992 px nothing, because the map column itself sticks to the top of the window (the
// site header scrolls away with the page).
const chipsRow = ref(null)
const wide = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 992px)').matches
const revealTop = () => (wide() ? 0 : (chipsRow.value?.getBoundingClientRect().bottom ?? 0))
// The chip row's height, kept current as its chips wrap, published on the page root as
// --find-nearby-band-height. Below 992 px in the map view the row sticks to the top of the window,
// and the map heading's scroll-margin-top reads this height, so a heading that takes focus (Back to
// map, Search this area, Dismiss, Retry map) is scrolled out from under the row (WCAG 2.4.11).
const bandHeight = ref(0)
let bandObserver = null
onMounted(() => {
  if (typeof ResizeObserver !== 'function' || !chipsRow.value) return
  bandObserver = new ResizeObserver(() => {
    bandHeight.value = Math.ceil(chipsRow.value?.getBoundingClientRect().height ?? 0)
  })
  bandObserver.observe(chipsRow.value)
})
onBeforeUnmount(() => bandObserver?.disconnect())
// Selection sync: a card focuses its pin; a pin focuses its card, changing the page
// when the card sits on another one; the map's own keyboard path (Previous place, Next place,
// Enter or Space on a pin) keeps focus where it is, and the map names the selected place in its
// status line.
const selectService = async (id, from) => {
  const { page } = results.select(id, from)
  if (page !== state.value.page) await update({ page })
  await nextTick()
  if (from === 'card') mapRef.value?.focusPin(id, { revealTop: revealTop() })
  else if (from === 'pin') document.getElementById(`service-result-${id}`)?.focus()
  else mapRef.value?.focusPin(id, { focus: false })
}

// A shared page past the last one (page=3 under a narrower radius) is clamped by the pipeline,
// so the URL follows the page the list shows. It waits for a ready catalogue and a settled URL:
// an empty catalogue still loading would clamp every shared page to the first.
// After the render flush, so a lookup the location watcher starts for a new place in the same
// flush already holds the URL unsettled: the old place's results never clamp the new page.
watch(
  [() => results.paged.value.page, state, catalogue.status, settled],
  ([shown, current, status, isSettled]) => {
    if (status === 'ready' && isSettled && shown !== current.page) void update({ page: shown })
  },
  { flush: 'post' },
)

// A typed origin is reconstructed from the `location` key, so it survives reloads and sharing;
// an unresolvable one stays in the URL and the form says so, and so does a lookup
// that could not run (the places chunk is unreachable). Only the latest lookup reports, and only
// while its place is still in the URL.
const unknownLocation = ref('')
const resolvedLocation = ref('')
let placeLookups = 0
const lookUpPlace = async (text) => {
  placeLookups += 1
  const lookup = placeLookups
  let resolved
  try {
    resolved = await locationOrigin.setTypedOrigin(text)
  } catch {
    resolved = null
  }
  if (lookup !== placeLookups || state.value.location !== text) return
  if (resolved) {
    unknownLocation.value = ''
    resolvedLocation.value = text
    return
  }
  unknownLocation.value = resolved === null ? placeLookupFailedCopy(text) : unknownPlaceCopy(text)
}
// An origin the URL no longer names goes: a typed place once `location` is empty, a device
// fix once `near=me` is gone as well.
const dropUnnamedOrigin = () => {
  const source = origin.value?.source
  if (source === 'typed' || (source === 'geolocation' && !state.value.near)) {
    locationOrigin.clearOrigin()
  }
}
watch(
  () => state.value.location,
  (text) => {
    if (text) {
      void lookUpPlace(text)
      return
    }
    placeLookups += 1
    unknownLocation.value = ''
    dropUnnamedOrigin()
  },
  { immediate: true },
)
// A same-view link that drops `near=me` under an empty place never changes `location`; a separate
// watcher, so a `near` flip under an unchanged place starts no second lookup.
// The flip clears whether or not a fix is held: a restore still waiting for its permission or
// position answer holds no origin yet, and its late answer must not land under a URL naming none.
watch(
  () => state.value.near,
  (near, wasNear) => {
    if (wasNear && !near && !state.value.location) locationOrigin.clearOrigin()
  },
)
// The last search carries a place only once it has resolved, so Home never
// prefills a location the form would reject.
watch(
  [state, resolvedLocation],
  ([value, place]) => remember(value.location === place ? value : { ...value, location: '' }),
  { immediate: true },
)

// Related activities load once the query resolves to a category.
const related = computed(() =>
  selectRelatedActivities(
    activities.activities.value,
    activities.sessions.value,
    results.resolved.value,
    activities.now.value,
  ),
)
watch(
  () => results.resolved.value.categoryIds.length > 0,
  (needed) => {
    if (needed && activities.status.value === 'idle') void activities.load()
  },
  { immediate: true },
)

// Chunk warm-up: once, when the catalogue is ready and the browser is online.
let warmed = false
watch(
  [catalogue.status, online],
  ([status, isOnline]) => {
    if (warmed || status !== 'ready' || !isOnline) return
    warmed = true
    void warmUpMapChunks()
    void loadPlaces().catch(() => null)
  },
  { immediate: true },
)

onMounted(async () => {
  // A reload with near=me re-acquires silently only when the permission is already granted;
  // nothing prompts on load, and the URL settles only once that answer is known.
  // Back from Service Detail still holds the fix, so it asks nothing again.
  if (state.value.near && origin.value?.source !== 'geolocation') {
    await locationOrigin.restoreIfGranted()
  }
  restored.value = true
})
</script>

<template>
  <div
    class="find-nearby"
    :class="{ 'find-nearby--map': isMapView }"
    :style="{ '--find-nearby-band-height': `${bandHeight}px` }"
  >
    <section class="search-band page-section--compact" aria-labelledby="search-heading">
      <div class="shell">
        <h1 id="search-heading" class="page-title">Find a place for your item.</h1>
        <div class="search-band__form">
          <SearchForm
            :initial-item="state.item"
            :initial-location="state.location"
            :location-error="locationMessage || unknownLocation || state.errors.location"
            @submit="onSearch"
          />
          <p v-if="state.errors.item" class="find-nearby__query-error" role="alert">
            {{ state.errors.item }}
          </p>
        </div>
      </div>
    </section>

    <section class="results-band page-section--compact">
      <div class="shell find-nearby__layout">
        <div ref="chipsRow" class="find-nearby__chips">
          <DiscoveryChips
            :action-types="state.actionTypes"
            :counts="results.counts.value"
            :open="state.open"
            :radius="results.effectiveRadius.value"
            :viewport-applied="appliedViewport !== null"
            :sort="state.sort"
            :origin-label="origin?.label ?? null"
            :origin-status="originStatus"
            :follow="state.follow"
            :view="state.view"
            :show-view-toggle="showViewToggle"
            @update:action-types="onActions"
            @update:open="onOpen"
            @update:radius="onRadius"
            @update:sort="onSort"
            @update:follow="onFollow"
            @update:view="onView"
            @request-location="requestLocation('near')"
            @clear-origin="onClearOrigin"
          />
          <RelatedActivities :items="related" :status="activities.status.value" />
        </div>

        <!-- Mounted from page load, so the central Melbourne notice is announced when it appears;
             the panel below is its visible, silent twin. -->
        <p class="visually-hidden" role="status" data-testid="map-notice-status">
          {{ mapNoticeText }}
        </p>

        <div v-if="isMapView" class="find-nearby__map">
          <StatePanel
            v-if="mapNotice"
            variant="notice"
            :live="false"
            title="Showing central Melbourne"
            :message="mapNoticeMessage"
          >
            <AppButton variant="text" @click="onDismissMapNotice">Dismiss</AppButton>
          </StatePanel>
          <NearbyMap
            ref="mapRef"
            :items="mapItems"
            :origin="origin"
            :radius-km="ringKm"
            :selected-id="results.selectedId.value"
            :follow="state.follow"
            :route="null"
            :online="online"
            :locating="locating"
            @select-service="selectService"
            @request-location="requestLocation('near')"
            @user-move-end="onUserMove"
            @programmatic-move-end="onProgrammaticMove"
          />
          <AppButton
            v-if="searchAreaVisible"
            variant="primary"
            class="find-nearby__search-area"
            @click="onSearchThisArea"
          >
            Search this area
          </AppButton>
        </div>

        <div class="find-nearby__list">
          <a v-if="isMapView" class="find-nearby__back" href="#nearby-map-heading">Back to map</a>
          <SearchResults
            :status="catalogue.status.value"
            :error="catalogue.error.value"
            :list-state="results.listState.value"
            :status-line="results.statusLine.value"
            :paged="results.paged.value"
            :other-options="results.otherOptions.value"
            :matches="results.matches.value"
            :selected-id="listSelectedId"
            :item-label="results.resolved.value.itemLabels.join(' ')"
            :action-hint="results.resolved.value.actionHint ?? ''"
            :summaries-by-id="ranking.summariesById.value"
            :rating-status="ratingStatus"
            :failed-ids="ranking.failedIds.value"
            :show-rating="showRating"
            :show-map-action="isMapView"
            :missing-location-count="results.missingLocationCount.value"
            :hint-dropped="results.hintDropped.value"
            :truncated="results.truncated.value"
            :sort-degraded="results.sortDegraded.value"
            :freshness="catalogue.freshness.value"
            :saved-at="catalogue.savedAt.value"
            :radius="results.effectiveRadius.value"
            :viewport-applied="appliedViewport !== null"
            :now="now"
            :hours-unchecked-count="results.openCounts.value.unknown"
            @retry="catalogue.retry"
            @retry-ratings="onRetryRatings"
            @clear-viewport="onClearViewport"
            @select="selectService($event, 'card')"
            @update:page="update({ page: $event })"
            @update:page-size="update({ pageSize: $event })"
            @update:radius="onRadius"
          />
        </div>

        <a v-if="isMapView" class="find-nearby__pill" href="#results-heading">{{ listPill }}</a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.search-band {
  padding-block: clamp(2rem, 4vw, 3.5rem) 1.5rem;
}

.search-band .shell {
  display: grid;
  gap: 1.5rem;
}

.page-title {
  max-width: 21ch;
  margin: 0;
  font-size: clamp(2.25rem, 4.5vw, 4rem);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.search-band__form {
  min-width: 0;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.find-nearby__query-error {
  margin: 0.75rem 0 0;
  color: var(--color-danger);
  font-weight: 650;
}

.results-band {
  padding-block: 0.5rem clamp(3rem, 6vw, 5rem);
}

.find-nearby__layout {
  display: grid;
  gap: 1.5rem;
}

.find-nearby__chips {
  display: grid;
  gap: 0.75rem;
}

/* Map view below 992: sticky chip row, full-bleed map, the list in normal flow. */
.find-nearby--map .find-nearby__chips {
  position: sticky;
  top: 0;
  z-index: 3;
  /* The row bleeds as far as the full-bleed map below it, so its background covers the map's
     heading and help text at the edges while they scroll underneath. */
  margin-inline: -1rem;
  background: var(--color-background);
  padding: 0.75rem 1rem;
}

/* A map heading scrolled to, or focused, stops below the sticky row, not under it. The row's
   height comes from the view's measurement (--find-nearby-band-height on .find-nearby). */
.find-nearby--map .find-nearby__map :deep(#nearby-map-heading) {
  scroll-margin-top: calc(var(--find-nearby-band-height, 0px) + 0.5rem);
}

.find-nearby__map {
  position: relative;
  display: grid;
  gap: 0.75rem;
  margin-inline: -1rem;
  min-width: 0;
}

.find-nearby__map :deep(.nearby-map__canvas) {
  border-radius: 0;
  border-inline: 0;
}

.find-nearby__search-area {
  justify-self: center;
}

.find-nearby__list {
  min-width: 0;
}

.find-nearby__back {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.find-nearby__pill {
  position: sticky;
  bottom: 1rem;
  z-index: 3;
  justify-self: center;
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  border-radius: 999px;
  background: var(--color-brand);
  padding: 0.5rem 1.25rem;
  color: var(--color-on-brand);
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 4px 16px rgb(0 0 0 / 20%);
}

/* The 992 breakpoint: the chip row across both columns, the list column left (40%), the map
   column right, sticking to the top of the window at the full viewport height once the page
   scrolls (the site header is not sticky, so nothing sits above it). */
@media (min-width: 992px) {
  .find-nearby--map .find-nearby__layout {
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    grid-template-areas:
      'chips chips'
      'list map';
    align-items: start;
    gap: clamp(1.5rem, 3vw, 2.5rem);
  }

  .find-nearby--map .find-nearby__chips {
    grid-area: chips;
    position: static;
    margin-inline: 0;
    padding: 0;
  }

  /* The row no longer sticks, and the map column, which does, starts with the heading. */
  .find-nearby--map .find-nearby__map :deep(#nearby-map-heading) {
    scroll-margin-top: 0;
  }

  .find-nearby--map .find-nearby__list {
    grid-area: list;
  }

  .find-nearby--map .find-nearby__map {
    grid-area: map;
    position: sticky;
    top: 0;
    height: 100dvh;
    margin: 0;
    overflow: auto;
    border-left: 1px solid var(--color-border);
    padding-left: clamp(1rem, 2vw, 1.5rem);
  }

  .find-nearby--map .find-nearby__map :deep(.nearby-map) {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    height: 100%;
    margin: 0;
  }

  .find-nearby--map .find-nearby__map :deep(.nearby-map__canvas) {
    /* The column's flexible row sizes the canvas, not the component's own height. */
    height: auto;
    min-height: 0;
    margin: 0;
    border-radius: var(--radius-small);
    border-inline: 1px solid var(--color-border);
  }

  .find-nearby--map .find-nearby__map .find-nearby__search-area {
    position: absolute;
    top: 5.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
  }

  .find-nearby__back,
  .find-nearby__pill {
    display: none;
  }
}
</style>
