<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import SaveServiceButton from '@/features/auth/components/SaveServiceButton.vue'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import CorrectionForm from '@/features/discovery/components/CorrectionForm.vue'
import NearbyMap from '@/features/discovery/components/NearbyMap.vue'
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
import { formatDate } from '@/shared/domain/formatDate.js'
import { formatRelativeTime } from '@/shared/domain/relativeTime.js'

/**
 * Service Detail (spec 6.6 L902; decision M4-D9): one record through `useService`, the shared
 * origin, the trip request, and the sections in the spec's order: header (tags, name, address,
 * the distance from the origin for a venue), What this option covers, Acceptance conditions,
 * Before you go, Getting there (with the single-pin map), Trip, Check the source, then Save for
 * members directly above Ratings (M4-D9 keeps the M3 placement). Optional fields are omitted,
 * never blank. Live records with `address` null render (the address line is suburb and
 * postcode). Staff and admins see "Edit this listing", a link to the staff record form, after
 * Check the source (spec 8.1 L975).
 */
const route = useRoute()
const { goBack } = useBackNavigation({ name: 'find-nearby' })
// The staff-only Edit link (spec 8.1 L975); the route meta and the rules guard the form itself.
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
// The Trip panel's start point. A refusal is the device's answer to the person's own request
// (Part 4a R-4a.25): a typed place already chosen stays the origin and `error` stays empty, so the
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
// requested at once; the other modes wait for Directions.
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
        <p v-if="freshness === 'cached' && savedAt" class="catalogue-freshness" role="status">
          Showing results saved {{ formatRelativeTime(savedAt) }}
        </p>
        <header class="detail-card__header">
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
        </header>

        <div class="detail-card__body">
          <section aria-labelledby="covers-heading">
            <h2 id="covers-heading">What this option covers</h2>
            <p>{{ service.summary }}</p>
            <ul v-if="service.acceptedItems.length" class="accepted-items">
              <li v-for="item in service.acceptedItems" :key="item" data-testid="accepted-item">
                {{ item }}
              </li>
            </ul>
          </section>

          <section v-if="service.acceptanceConditions?.length" aria-labelledby="conditions-heading">
            <h2 id="conditions-heading">Acceptance conditions</h2>
            <ul>
              <li v-for="line in service.acceptanceConditions" :key="line">{{ line }}</li>
            </ul>
          </section>

          <section
            v-if="service.preparation?.length || service.cost"
            aria-labelledby="prepare-heading"
          >
            <h2 id="prepare-heading">Before you go</h2>
            <ul v-if="service.preparation?.length">
              <li v-for="line in service.preparation" :key="line">{{ line }}</li>
            </ul>
            <p v-if="service.cost">Cost: {{ service.cost }}</p>
          </section>

          <section aria-labelledby="getting-there-heading">
            <h2 id="getting-there-heading">Getting there</h2>
            <p>
              <span v-if="service.address">{{ service.address }}, </span>{{ service.suburb }}
              {{ service.postcode }}
            </p>
            <ul v-if="service.access?.length">
              <li v-for="line in service.access" :key="line">{{ line }}</li>
            </ul>
            <template v-if="service.openingHours?.length">
              <h3>Opening hours</h3>
              <ul>
                <li v-for="line in service.openingHours" :key="line">{{ line }}</li>
              </ul>
            </template>
            <!-- A single map centres itself only when Leaflet loads, so another service mounts a
                 fresh one rather than leaving its pin off the old centre (detail-trip#2). -->
            <NearbyMap
              v-if="service.geo"
              :key="service.id"
              single
              :items="mapItems"
              :origin="origin"
              :route="trip.route.value?.geometry ?? null"
              :radius-km="0"
            />
          </section>

          <section v-if="service.geo" aria-labelledby="trip-heading">
            <h2 id="trip-heading">Trip</h2>
            <TripPlanner
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
          </section>

          <section class="source-panel" aria-labelledby="source-heading">
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

        <!-- Spec 8.5: Farah reports a change here; staff see it in the corrections queue. -->
        <CorrectionForm :service="service" />
        <p v-if="canEdit" class="staff-edit-link">
          <RouterLink
            :to="{ name: 'staff-record-edit', params: { kind: 'services', recordId: service.id } }"
          >
            Edit this listing
          </RouterLink>
        </p>
        <SaveServiceButton class="service-detail__save" :service-id="service.id" />
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

.detail-card__header {
  display: grid;
  justify-items: start;
  gap: 1.25rem;
  padding-bottom: clamp(1.75rem, 4vw, 3rem);
}

.detail-card__address,
.detail-card__distance {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 1.125rem;
}

.detail-card__body {
  display: grid;
  gap: clamp(2rem, 4vw, 3rem);
  padding-block: 1rem clamp(2rem, 4vw, 3rem);
}

.detail-card h2 {
  margin: 0 0 0.875rem;
  color: var(--color-heading);
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.detail-card h3 {
  margin: 1rem 0 0.5rem;
  color: var(--color-heading);
  font-size: 1.125rem;
  font-weight: 600;
}

.detail-card__body section > p {
  max-width: 62ch;
  margin: 0 0 0.75rem;
  line-height: 1.7;
}

.detail-card__body ul {
  display: grid;
  gap: 0.625rem;
  margin: 0 0 0.75rem;
  padding-left: 1.1rem;
}

.detail-card__body li::marker {
  color: var(--color-text-muted);
}

.source-panel h2 {
  font-size: 1.25rem;
}

.staff-edit-link {
  margin: 0 0 1.5rem;
  font-weight: 600;
}

/* Keeps the Save control off the ratings section's top rule (owner, 2026-10-07). */
.service-detail__save {
  margin: 0 0 1.5rem;
}

@media (min-width: 768px) {
  .detail-card__body {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: clamp(2rem, 5vw, 4rem);
  }

  .detail-card__body section {
    min-width: 0;
  }
}
</style>
