<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/shared/components/AppButton.vue'
import ResultPagination from '@/shared/components/ResultPagination.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { formatRelativeTime } from '@/shared/domain/relativeTime.js'

import { isMappableGeo } from '../domain/nearbyServices.js'
import { formatMatchLabel } from '../domain/resultsCopy.js'
import ServiceCard from './ServiceCard.vue'

/**
 * The results list (spec 6.4 L886): one `role="status"` live region (the status line), the
 * numbered cards of the current page, the "Other options" block of the relaxed verb hint
 * (decision D4), the three list states on StatePanel and the pagination. Everything arrives as
 * props from `FindNearbyView`, the composition root (spec 3.4 L1413): this component calls no
 * composable and imports no data module, so the ratings call that lived here until milestone 3
 * is the view's now (decision M4-D10).
 */
const props = defineProps({
  status: { type: String, required: true },
  error: { type: Object, default: null },
  listState: { type: String, default: 'some' },
  statusLine: { type: String, default: '' },
  paged: { type: Object, required: true },
  otherOptions: { type: Array, default: () => [] },
  matches: { type: Object, default: () => ({}) },
  selectedId: { type: String, default: '' },
  /** The verb-free item words ("microwave" for "repair microwave"), for the hint sentence. */
  itemLabel: { type: String, default: '' },
  /** The verb the query carried ('repair' | 'reuse' | 'recycle' | ''), for the hint sentence. */
  actionHint: { type: String, default: '' },
  summariesById: { type: Object, default: () => ({}) },
  ratingStatus: { type: String, default: 'idle' },
  failedIds: { type: Array, default: () => [] },
  showRating: { type: Boolean, default: false },
  /** Renders "Show on map" on the numbered cards whose place has a map position (the map view). */
  showMapAction: { type: Boolean, default: false },
  missingLocationCount: { type: Number, default: 0 },
  hintDropped: { type: Boolean, default: false },
  truncated: { type: Boolean, default: false },
  sortDegraded: { type: Boolean, default: false },
  freshness: { type: String, default: 'none' },
  savedAt: { type: Date, default: null },
  /** The effective radius, for the none-in-radius copy and buttons. */
  radius: { type: Number, default: 10 },
  /** A map area is applied: the empty list offers to clear it instead of widening (FW-R9). */
  viewportApplied: { type: Boolean, default: false },
})
const emit = defineEmits([
  'retry',
  'retry-ratings',
  'select',
  'clear-viewport',
  'update:page',
  'update:pageSize',
  'update:radius',
])

const errorVariant = computed(() => (props.error?.code === 'offline' ? 'offline' : 'error'))
const heading = computed(() => {
  if (props.status === 'loading') return 'Loading options'
  if (props.status === 'error') return 'Options are unavailable'
  return 'Places for your item'
})
// The error panel speaks for itself as an alert, so the status line stays empty then.
const liveLine = computed(() => {
  if (props.status === 'loading') return 'Loading options…'
  if (props.status === 'error') return ''
  return props.statusLine
})
const noneInRadiusTitle = computed(() => {
  if (props.viewportApplied) return 'No places in this area'
  return props.radius > 0 ? `No places within ${props.radius} km` : 'No places in this area'
})
const noneInRadiusMessage = computed(() =>
  props.viewportApplied
    ? 'Move the map, or clear the map area to search the whole radius.'
    : 'Widen the search or try another location.',
)
const missingLabel = computed(
  () =>
    `Include ${props.missingLocationCount} ${props.missingLocationCount === 1 ? 'place' : 'places'} without a map position`,
)
const labelFor = (id) => formatMatchLabel(props.matches[id])
// A summary still loading would read "Rating unavailable" on every card; the header's loading
// note speaks for the ratings until they arrive (the M3 gate).
const cardRatingsReady = computed(() => props.showRating && props.ratingStatus !== 'loading')
</script>

<template>
  <section class="results-section" aria-labelledby="results-heading">
    <header class="results-header">
      <h2
        id="results-heading"
        class="section-title"
        tabindex="-1"
        :class="{ 'visually-hidden': status !== 'ready' }"
      >
        {{ heading }}
      </h2>
      <!-- The one live region (spec L886); it echoes typed text, hence dir="auto" (M4-D22). It
           stays mounted from loading to ready because a region inserted together with its text
           is not reliably announced (FW-R7). -->
      <p
        class="results-status"
        :class="{ 'visually-hidden': status !== 'ready' }"
        role="status"
        dir="auto"
      >
        {{ liveLine }}
      </p>
      <template v-if="status === 'ready'">
        <p v-if="freshness === 'cached' && savedAt" class="catalogue-freshness">
          Showing results saved {{ formatRelativeTime(savedAt) }}
        </p>
        <p v-if="sortDegraded" class="results-note">Choose a location to sort by distance</p>
        <p v-if="truncated" class="results-note">
          Results incomplete: showing the first 1,000 records.
        </p>
        <p v-if="showRating && ratingStatus === 'loading'" class="results-note">
          Loading public rating summaries…
        </p>
        <p v-else-if="showRating && failedIds.length" class="results-note">
          {{ failedIds.length }} rating summaries are unavailable. Rated services with available
          summaries appear first, followed by unrated and unavailable services.
          <AppButton variant="text" @click="emit('retry-ratings')"
            >Retry rating summaries</AppButton
          >
        </p>
      </template>
    </header>

    <StatePanel
      v-if="status === 'loading'"
      variant="loading"
      :live="false"
      title="Loading options"
      message="Reading the current TurnAgain service catalogue…"
    />

    <StatePanel
      v-else-if="status === 'error'"
      :variant="errorVariant"
      assertive
      title="Options are unavailable"
      :error="error"
      @retry="emit('retry')"
    />

    <template v-else>
      <p v-if="hintDropped" class="results-hint">
        No {{ actionHint }} options for '<bdi>{{ itemLabel }}</bdi
        >'
      </p>

      <div v-if="paged.items.length" data-testid="result-list">
        <ServiceCard
          v-for="entry in paged.items"
          :id="`service-result-${entry.service.id}`"
          :key="entry.service.id"
          tabindex="-1"
          :service="entry.service"
          :index="entry.index"
          :distance-km="entry.distanceKm"
          :match-label="labelFor(entry.service.id)"
          :selected="selectedId === entry.service.id"
          :show-map-action="showMapAction && isMappableGeo(entry.service.geo)"
          :show-rating="cardRatingsReady"
          :rating-summary="summariesById[entry.service.id] ?? null"
          @select="emit('select', entry.service.id)"
        />
      </div>

      <StatePanel
        v-else-if="listState === 'none-in-radius'"
        variant="empty"
        :live="false"
        :title="noneInRadiusTitle"
        :message="noneInRadiusMessage"
      >
        <div class="results-empty__actions">
          <AppButton v-if="viewportApplied" variant="secondary" @click="emit('clear-viewport')">
            Clear map area
          </AppButton>
          <template v-else>
            <AppButton
              v-if="radius !== 20 && radius !== 0"
              variant="secondary"
              @click="emit('update:radius', 20)"
            >
              Try 20 km
            </AppButton>
            <AppButton v-if="radius !== 0" variant="secondary" @click="emit('update:radius', 0)">
              Any distance
            </AppButton>
          </template>
        </div>
      </StatePanel>

      <StatePanel
        v-else-if="listState === 'none-at-all'"
        variant="empty"
        :live="false"
        title="No matching places"
        message="Try a broader item name or clear an action filter. The catalogue covers selected Melbourne services only."
      >
        <RouterLink class="inline-action" :to="{ name: 'activities', query: { type: 'repair' } }">
          Browse repair activities
        </RouterLink>
      </StatePanel>

      <p v-if="missingLocationCount > 0" class="results-note">
        <AppButton variant="text" @click="emit('update:radius', 0)">
          {{ missingLabel }}
        </AppButton>
      </p>

      <!-- The Other options block is not ranked, so its cards carry no rating (FW-R8). -->
      <section v-if="otherOptions.length" class="results-other" aria-labelledby="other-options">
        <h3 id="other-options">Other options</h3>
        <ServiceCard
          v-for="entry in otherOptions"
          :id="`service-result-${entry.service.id}`"
          :key="entry.service.id"
          tabindex="-1"
          :service="entry.service"
          :distance-km="entry.distanceKm"
          :match-label="labelFor(entry.service.id)"
          :selected="selectedId === entry.service.id"
          :heading-level="4"
        />
      </section>

      <!-- The status line already announces the count, so the range is plain text here. -->
      <ResultPagination
        v-if="paged.total > 0"
        v-bind="paged"
        :live="false"
        @update:page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
    </template>
  </section>
</template>

<style scoped>
.results-section {
  width: 100%;
  min-width: 0;
}

.results-header {
  display: grid;
  gap: 0.5rem;
  padding-bottom: 1.25rem;
}

.results-header h2 {
  max-width: 38ch;
  margin: 0;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 650;
  letter-spacing: -0.035em;
}

.results-status,
.results-note,
.results-hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.results-hint {
  margin-bottom: 1rem;
  color: var(--color-text);
  font-weight: 600;
}

.results-empty__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.results-other {
  margin-top: 2rem;
  border-top: 2px solid var(--color-border);
  padding-top: 1.5rem;
}

.results-other h3 {
  margin: 0 0 0.5rem;
  color: var(--color-heading);
  font-size: 1.25rem;
}
</style>
