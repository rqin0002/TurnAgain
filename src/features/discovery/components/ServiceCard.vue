<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import RatingSummary from '@/features/ratings/components/RatingSummary.vue'
import AppButton from '@/shared/components/AppButton.vue'

import { formatAreaLine } from '../domain/resultsCopy.js'
import { formatActionType, formatCheckedDate } from '../domain/servicePresentation.js'
import { formatCardTrip } from '../domain/trip.js'

/**
 * One result: the number badge in the brand colour (the pin's number), action
 * tags, the name, the address line, the distance with the walking estimate, the match label,
 * the first opening-hours line (with "Hours not checked" under it when "Open now" is on and the
 * hours could not be read), the compact rating (Top rated and "Rating: high to low") and the
 * source. An `area` record shows "In the 3168 area (exact venue not published)"
 * and no minutes. Directions left the card for Service Detail's TripPlanner;
 * the card never requests a route. `TopRatedServices` passes `service`, `show-rating` and
 * `rating-summary` only.
 */
const props = defineProps({
  service: { type: Object, required: true },
  /** The list number (the pin's number); null renders no badge. */
  index: { type: Number, default: null },
  distanceKm: { type: Number, default: null },
  matchLabel: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  /** Renders the "Show on map" action (the view maps `select` to the map's focusPin). */
  showMapAction: { type: Boolean, default: false },
  showRating: { type: Boolean, default: false },
  ratingSummary: { type: Object, default: null },
  /** "Open now" is on and this place's hours could not be read: say so instead of hiding it. */
  hoursUnchecked: { type: Boolean, default: false },
  /** The name's heading level: 3 under a section's h2, 4 under the Other options h3. */
  headingLevel: { type: Number, default: 3, validator: (level) => level >= 2 && level <= 4 },
})
defineEmits(['select'])

const isArea = computed(() => props.service.geo?.precision === 'area')
const tripLine = computed(() =>
  isArea.value ? formatAreaLine(props.service) : formatCardTrip(props.distanceKm),
)
const openingHours = computed(() => props.service.openingHours?.[0] ?? '')
</script>

<template>
  <article class="service-card" :class="{ 'service-card--selected': selected }">
    <div>
      <div class="service-card__top">
        <span
          v-if="index !== null"
          class="service-card__badge"
          role="img"
          :aria-label="`Result ${index}`"
          >{{ index }}</span
        >
        <ul class="tag-list" aria-label="Available actions">
          <li v-for="action in service.actionTypes" :key="action" class="tag">
            {{ formatActionType(action) }}
          </li>
        </ul>
      </div>

      <component :is="`h${headingLevel}`" class="service-card__title">
        <RouterLink
          class="title-link"
          :to="{ name: 'service-detail', params: { serviceId: service.id } }"
        >
          {{ service.name }}
        </RouterLink>
      </component>

      <p class="service-card__location">
        <span v-if="service.address">{{ service.address }}, </span>{{ service.suburb }}
        {{ service.postcode }}
      </p>
      <p v-if="tripLine" class="service-card__trip">{{ tripLine }}</p>
      <p v-if="matchLabel" class="service-card__match">{{ matchLabel }}</p>
      <p class="service-card__summary">{{ service.summary }}</p>
      <p v-if="openingHours" class="service-card__hours">{{ openingHours }}</p>
      <p v-if="hoursUnchecked" class="service-card__hours-unchecked">Hours not checked</p>
      <div v-if="showRating" class="service-card__rating">
        <RatingSummary compact :summary="ratingSummary" />
      </div>
    </div>

    <div class="service-card__source">
      <p>
        Source:
        <a :href="service.source.url" target="_blank" rel="noopener noreferrer">
          {{ service.source.organisation
          }}<span class="visually-hidden"> (opens in a new tab)</span>
        </a>
      </p>
      <p>Checked {{ formatCheckedDate(service.source.checkedAt) }}</p>
      <RouterLink
        class="inline-action service-card__action"
        :to="{ name: 'service-detail', params: { serviceId: service.id } }"
      >
        View details <span aria-hidden="true">→</span>
      </RouterLink>
      <AppButton v-if="showMapAction" variant="text" @click="$emit('select')">
        Show on map
      </AppButton>
    </div>
  </article>
</template>

<style scoped>
.service-card {
  display: grid;
  min-width: 0;
  gap: 1.25rem;
  border-top: 1px solid var(--color-border);
  padding-block: 1.75rem;
}

.service-card--selected {
  outline: 2px solid var(--color-brand);
  outline-offset: 0.5rem;
}

.service-card:first-child {
  padding-top: 0;
  border-top: 0;
}

.service-card__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.service-card__badge {
  display: inline-grid;
  width: 2rem;
  height: 2rem;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: var(--color-brand);
  color: var(--color-on-brand);
  font-size: 0.875rem;
  font-weight: 700;
}

.service-card__title {
  margin: 0.75rem 0 0;
  color: var(--color-heading);
  font-size: clamp(1.25rem, 2.2vw, 1.625rem);
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.service-card__location,
.service-card__trip,
.service-card__hours {
  margin: 0.625rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.service-card__hours-unchecked {
  margin: 0.25rem 0 0;
  color: var(--color-heading);
  font-size: 0.875rem;
  font-weight: 600;
}

.service-card__match {
  margin: 0.625rem 0 0;
  color: var(--color-brand-strong);
  font-size: 0.9375rem;
  font-weight: 600;
}

.service-card__summary {
  max-width: 64ch;
  margin: 0.875rem 0 0;
  line-height: 1.65;
}

.service-card__rating {
  margin: 0.75rem 0 0;
}

.service-card__source {
  display: grid;
  min-width: 0;
  justify-items: start;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.service-card__source p {
  margin: 0 0 0.35rem;
}

.service-card__action {
  margin-top: 0.75rem;
}

@media (min-width: 1200px) {
  .service-card {
    grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.28fr);
    gap: 2rem;
    padding-block: 2rem;
  }

  .service-card__source {
    justify-items: end;
    padding-top: 0.2rem;
    text-align: right;
  }
}
</style>
