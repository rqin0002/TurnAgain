<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import SaveServiceButton from '@/features/auth/components/SaveServiceButton.vue'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import CorrectionForm from '@/features/discovery/components/CorrectionForm.vue'
import NearbyMap from '@/features/discovery/components/NearbyMap.vue'
import OpeningHoursTable from '@/features/discovery/components/OpeningHoursTable.vue'
import TripPlanner from '@/features/discovery/components/TripPlanner.vue'
import {
  LOCATION_COPY,
  placeLookupFailedCopy,
  unknownPlaceCopy,
  useLocationOrigin,
} from '@/features/discovery/composables/useLocationOrigin.js'
import { useService } from '@/features/discovery/composables/useService.js'
import { useTripRoute } from '@/features/discovery/composables/useTripRoute.js'
import { distanceKm, isVenueGeo } from '@/features/discovery/domain/nearbyServices.js'
import { formatDistance } from '@/features/discovery/domain/resultsCopy.js'
import {
  formatActionType,
  formatCheckedDate,
} from '@/features/discovery/domain/servicePresentation.js'
import ServiceRatings from '@/features/ratings/components/ServiceRatings.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { useBackNavigation } from '@/shared/composables/useBackNavigation.js'
import { useMinuteClock } from '@/shared/composables/useMinuteClock.js'
import { useOnlineStatus } from '@/shared/composables/useOnlineStatus.js'
import { formatDate } from '@/shared/domain/formatDate.js'
import { formatRelativeTime } from '@/shared/domain/relativeTime.js'

/**
 * Service Detail: one record through `useService`, the shared origin and the trip request, read
 * in this order: the header (tags, name, address, the distance from the origin for a venue); the
 * reading area (What this option covers with the accepted items, Acceptance conditions with the
 * things not accepted after them, Before you go); the practical area (Getting there: the
 * address, Access, Opening hours as today's state and the week (OpeningHoursTable, at a clock
 * read every minute), the single-pin map and, right under it, the trip controls whose route the
 * map draws; then Check the source); then the correction form, "Edit this listing" for staff and
 * admins, Save for members and Ratings. From 992 px the two areas stand side by side and each
 * flows down on its own, so a long list of accepted items never leaves a gap beside it; below
 * that they follow one another in the same order. The visual order is the DOM order. Optional
 * fields are omitted, never blank.
 * Live records with `address` null render (the address line is suburb and postcode).
 */
const route = useRoute()
const { goBack } = useBackNavigation({ name: 'find-nearby' })
// The staff-only Edit link; the route meta and the rules guard the form itself.
const authStore = useAuthStore()
const canEdit = computed(() => authStore.canAccess(['staff', 'admin']))

const serviceId = computed(() => {
  const value = Array.isArray(route.params.serviceId)
    ? route.params.serviceId[0]
    : route.params.serviceId
  return typeof value === 'string' ? value : ''
})
const { status, freshness, savedAt, error, errorMessage, revalidating, retry, service, notFound } =
  useService(serviceId)
const locationOrigin = useLocationOrigin()
const { origin, status: originStatus, deviceStatus } = locationOrigin
const trip = useTripRoute({
  origin,
  destination: () => service.value?.geo ?? null,
  serviceId,
})
// The offline banner's flag: the mini-map shows its "needs a connection" line while the banner is
// up, as the results map does, instead of waiting for a tile to fail.
const { online } = useOnlineStatus()
// Today's opening state and the "Today" row follow the clock on a page left open.
const now = useMinuteClock()

// A saved copy without this id proves nothing (the service may be newer than the copy): keep
// loading while the copy is revalidated, and report a failed fetch rather than "not found".
// 'idle' is the first paint, before onMounted starts the load: it is a wait, not an answer.
const awaitingService = computed(
  () =>
    status.value === 'idle' || status.value === 'loading' || (!service.value && revalidating.value),
)
const serviceUnavailable = computed(() => !service.value && error.value !== null && !notFound.value)
const errorVariant = computed(() =>
  ['offline', 'network'].includes(error.value?.code) ? 'offline' : 'error',
)

const hasVenue = computed(() => isVenueGeo(service.value?.geo))
const distanceLine = computed(() => {
  if (!origin.value || !hasVenue.value) return ''
  return `${formatDistance(distanceKm(origin.value, service.value.geo))} from ${origin.value.label}`
})
const mapItems = computed(() =>
  service.value?.geo
    ? [
        {
          service: service.value,
          distanceKm: origin.value ? distanceKm(origin.value, service.value.geo) : null,
          index: 1,
        },
      ]
    : [],
)
// The Trip panel's start point. A refusal is the device's answer to the person's own request:
// a typed place already chosen stays the origin and `error` stays empty, so the
// copy comes from `deviceStatus`, and only after a request made here.
const typedError = ref('')
const askedForLocation = ref(false)
const deviceError = computed(() =>
  askedForLocation.value && deviceStatus.value !== null && deviceStatus.value !== 'granted'
    ? LOCATION_COPY[deviceStatus.value]
    : '',
)
const locationError = computed(
  () => typedError.value || deviceError.value || locationOrigin.error.value,
)
// Only the latest lookup reports, so an older one answering late never overwrites the message
// for the newer text. A lookup that cannot run (the places list is not cached and the device is
// offline) rejects; that is not an unknown place, so it asks for the connection instead.
let typedLookups = 0
// A device request retires any lookup still running: its late answer would speak for a place the
// person has already moved on from.
const useMyLocation = () => {
  askedForLocation.value = true
  typedLookups += 1
  typedError.value = ''
  locationOrigin.requestLocation()
}
const setTypedOrigin = async (text) => {
  askedForLocation.value = false
  typedLookups += 1
  const lookup = typedLookups
  let message
  try {
    const resolved = await locationOrigin.setTypedOrigin(text)
    message = resolved ? '' : unknownPlaceCopy(text)
  } catch {
    message = placeLookupFailedCopy(text)
  }
  if (lookup === typedLookups) typedError.value = message
}
// A new travel mode retires the previous mode's trip: a route still loading is cancelled and a
// result for another mode leaves the panel and the map. Public transport is links only, so it is
// requested at once; the other modes wait for Show route on map.
const selectMode = (mode) => {
  if (mode === 'transit') void trip.request('transit')
  else trip.reset()
}

// The router supplies a useful generic title immediately; once the record arrives, the service
// name gives browser history a clearer label. A not-found answer retires a name the saved copy
// showed first, so history never labels a missing service with its old name.
watch(
  [service, notFound],
  ([value, gone]) => {
    if (value) document.title = `${value.name} | TurnAgain`
    else if (gone) document.title = 'Service not found | TurnAgain'
  },
  { immediate: true },
)
</script>

<template>
  <section class="page-section">
    <div class="shell detail-page">
      <button class="text-button back-link" type="button" @click="goBack">← Back</button>

      <StatePanel
        v-if="awaitingService"
        variant="loading"
        title="Loading service details"
        message="Reading the current catalogue…"
      >
        <h1 class="visually-hidden">Loading service details</h1>
      </StatePanel>

      <StatePanel
        v-else-if="serviceUnavailable"
        :variant="errorVariant"
        title="Service details are unavailable"
        :error="error"
        :message="errorMessage"
        assertive
        @retry="retry"
      >
        <h1 class="visually-hidden">Service details are unavailable</h1>
      </StatePanel>

      <article v-else-if="service && !notFound" class="detail-card">
        <!-- Visible text, as in the results list: a live region inserted together with its text
             is not reliably announced, and this line appears with the saved copy itself. -->
        <p v-if="freshness === 'cached' && savedAt" class="catalogue-freshness">
          Showing results saved {{ formatRelativeTime(savedAt) }}
        </p>
        <header class="detail-card__header">
          <div class="detail-card__title">
            <ul class="tag-list" aria-label="Available actions">
              <li v-for="action in service.actionTypes" :key="action" class="tag">
                {{ formatActionType(action) }}
              </li>
            </ul>
            <h1>{{ service.name }}</h1>
            <p class="detail-card__address">
              <span v-if="service.address">{{ service.address }}, </span>{{ service.suburb }}
              {{ service.postcode }}
            </p>
            <p v-if="distanceLine" class="detail-card__distance">{{ distanceLine }}</p>
          </div>
          <!-- Save this place (or, signed out, the sign-in link) sits with the name and the
               address, so it is seen without scrolling. -->
          <SaveServiceButton class="detail-card__save" :service-id="service.id" />
        </header>

        <div class="detail-card__body">
          <!-- What the place takes and what to know before going: read first, in this order. -->
          <div class="detail-card__reading">
            <section aria-labelledby="covers-heading">
              <h2 id="covers-heading">What this option covers</h2>
              <p>{{ service.summary }}</p>
              <template v-if="service.acceptedItems.length">
                <h3 id="accepted-heading">Accepted items</h3>
                <!-- Short names flow into as many columns as fit; a long name wraps in its own
                     column. Every item is listed: nothing is cut or folded away. -->
                <ul class="accepted-items" aria-labelledby="accepted-heading">
                  <li v-for="item in service.acceptedItems" :key="item" data-testid="accepted-item">
                    {{ item }}
                  </li>
                </ul>
              </template>
            </section>

            <section
              v-if="service.acceptanceConditions?.length || service.excludedConditions?.length"
              aria-labelledby="conditions-heading"
            >
              <h2 id="conditions-heading">Acceptance conditions</h2>
              <ul v-if="service.acceptanceConditions?.length">
                <li v-for="line in service.acceptanceConditions" :key="line">{{ line }}</li>
              </ul>
              <template v-if="service.excludedConditions?.length">
                <h3 id="not-accepted-heading">Not accepted</h3>
                <ul aria-labelledby="not-accepted-heading">
                  <li v-for="line in service.excludedConditions" :key="line">{{ line }}</li>
                </ul>
              </template>
            </section>

            <section
              v-if="service.preparation?.length || service.cost"
              aria-labelledby="prepare-heading"
            >
              <h2 id="prepare-heading">Before you go</h2>
              <ul v-if="service.preparation?.length">
                <li v-for="line in service.preparation" :key="line">{{ line }}</li>
              </ul>
              <p v-if="service.cost"><strong>Cost:</strong> {{ service.cost }}</p>
            </section>
          </div>

          <!-- Where, when and how to get there, and where the listing comes from. -->
          <div class="detail-card__practical">
            <section class="detail-panel" aria-labelledby="getting-there-heading">
              <h2 id="getting-there-heading">Getting there</h2>
              <p class="detail-panel__address">
                <span v-if="service.address">{{ service.address }}, </span>{{ service.suburb }}
                {{ service.postcode }}
              </p>
              <template v-if="service.access?.length">
                <h3 id="access-heading">Access</h3>
                <ul aria-labelledby="access-heading">
                  <li v-for="line in service.access" :key="line">{{ line }}</li>
                </ul>
              </template>
              <template v-if="service.openingHours?.length">
                <h3>Opening hours</h3>
                <OpeningHoursTable :lines="service.openingHours" :now="now" />
              </template>
              <template v-if="service.geo">
                <!-- A single map centres itself only when Leaflet loads, so another service mounts
                     a fresh one rather than leaving its pin off the old centre. -->
                <NearbyMap
                  :key="service.id"
                  single
                  :items="mapItems"
                  :origin="origin"
                  :route="trip.route.value?.geometry ?? null"
                  :radius-km="0"
                  :online="online"
                />
                <!-- The trip controls sit right under the map that draws their route. Keyed like
                     the map: a starting point being typed and an open Change belong to the service
                     they were made on. -->
                <h3 id="trip-heading">Plan your trip</h3>
                <TripPlanner
                  :key="service.id"
                  :service="service"
                  :origin="origin"
                  :origin-status="originStatus"
                  :status="trip.status.value"
                  :mode="trip.mode.value"
                  :route="trip.route.value"
                  :estimate="trip.estimate.value"
                  :retry-after-ms="trip.retryAfterMs.value"
                  :location-error="locationError"
                  @request="trip.request"
                  @use-my-location="useMyLocation"
                  @set-typed-origin="setTypedOrigin"
                  @select-mode="selectMode"
                />
              </template>
            </section>

            <section class="detail-panel source-panel" aria-labelledby="source-heading">
              <h2 id="source-heading">Check the source</h2>
              <p>
                Source:
                <a :href="service.source.url" target="_blank" rel="noopener noreferrer">
                  {{ service.source.organisation
                  }}<span class="visually-hidden"> (opens in a new tab)</span>
                </a>
              </p>
              <p>Listing updated {{ formatDate(service.updatedAt, { dateStyle: 'medium' }) }}</p>
              <p>Source checked {{ formatCheckedDate(service.source.checkedAt) }}</p>
            </section>
          </div>
        </div>

        <!-- Farah reports a change here; staff see it in the corrections queue. Keyed by the
             service, so a sent correction's thanks never shows on another service's page. -->
        <CorrectionForm :key="service.id" :service="service" />
        <p v-if="canEdit" class="staff-edit-link">
          <RouterLink
            :to="{ name: 'staff-record-edit', params: { kind: 'services', recordId: service.id } }"
          >
            Edit this listing
          </RouterLink>
        </p>
        <ServiceRatings :service-id="service.id" :source-url="service.source.url" />
      </article>

      <div v-else class="state-panel" data-testid="service-not-found">
        <div>
          <h1>We could not find that service.</h1>
          <p>It may have been removed from the current catalogue or the link may be incomplete.</p>
          <RouterLink class="button button--primary" to="/">Start a new search</RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.detail-page {
  max-width: 72rem;
}

.state-panel h1,
.detail-card h1 {
  max-width: 22ch;
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(2.25rem, 5vw, 4rem);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.detail-card {
  min-width: 0;
}

/* The header: the title block, then the Save control under it; from 768 px the control moves to
   the right of the title block, level with the address. */
.detail-card__header {
  display: grid;
  gap: 1.25rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: clamp(1.5rem, 3vw, 2.25rem);
}

.detail-card__title {
  display: grid;
  justify-items: start;
  gap: 1rem;
  min-width: 0;
}

.detail-card__address,
.detail-card__distance {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 1.125rem;
}

/* The body holds two areas, the reading area and then the practical area. Each is its own column
   of sections with its own gap, so a section never takes its height from one in the other area. */
.detail-card__body {
  display: grid;
  gap: 2.5rem;
  padding-block: clamp(1.75rem, 3vw, 2.5rem) clamp(2rem, 4vw, 3rem);
}

.detail-card__reading,
.detail-card__practical {
  display: grid;
  align-content: start;
  min-width: 0;
}

.detail-card__reading {
  gap: 2.25rem;
}

.detail-card__practical {
  gap: 1.25rem;
}

/* One heading style for every section, the panels' included, and one for the sub-headings. */
.detail-card h2 {
  margin: 0 0 0.75rem;
  color: var(--color-heading);
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.detail-card h3 {
  margin: 1.5rem 0 0.5rem;
  color: var(--color-heading);
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.3;
}

/* Body copy keeps the base size and a reading measure. */
.detail-card__body p {
  max-width: 62ch;
  margin: 0 0 0.75rem;
  line-height: 1.65;
}

.detail-card__body ul {
  display: grid;
  gap: 0.5rem;
  max-width: 62ch;
  margin: 0 0 0.75rem;
  padding-left: 1.25rem;
}

.detail-card__body li::marker {
  color: var(--color-text-muted);
}

/* The accepted items are short names, so they run in columns at least 9rem wide, as many as the
   area holds (two on a phone, more on wider screens), down each column in list order. An item
   never splits across columns, and a long name wraps inside its own column. */
.detail-card__body .accepted-items {
  display: block;
  max-width: none;
  columns: 9rem;
  column-gap: 1.5rem;
  padding-left: 0;
}

.detail-card__body .accepted-items li {
  margin-left: 1.25rem;
  padding-block: 0.125rem 0.375rem;
  break-inside: avoid;
}

/* The practical area's two panels share one surface, radius and padding. */
.detail-panel {
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.detail-panel__address {
  color: var(--color-heading);
  font-weight: 600;
}

/* The trip controls follow the map directly: their route is drawn on it. */
.detail-panel .nearby-map {
  margin: 1.5rem 0 0;
}

/* The source lines read at body size; the shared panel style shrinks its last line. */
.detail-card .source-panel p {
  margin: 0 0 0.375rem;
  font-size: 1rem;
}

/* Space after a section's last line comes from its area's gap or its panel's padding. */
.detail-card__body section > :last-child {
  margin-bottom: 0;
}

.staff-edit-link {
  margin: 0 0 1.5rem;
  font-weight: 600;
}

@media (min-width: 768px) {
  .detail-card__header {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    column-gap: 2rem;
  }
}

/* From 992 px the reading area and the practical area stand side by side; each flows down on its
   own. The practical column keeps at least 20rem for the map and the trip controls. The reading
   area takes the panels' top padding, so the first headings of the two areas share a line. */
@media (min-width: 992px) {
  .detail-card__body {
    grid-template-columns: minmax(0, 1fr) minmax(20rem, 0.8fr);
    align-items: start;
    column-gap: clamp(2.5rem, 4vw, 3.5rem);
  }

  .detail-card__reading {
    padding-top: 1.75rem;
  }
}
</style>
