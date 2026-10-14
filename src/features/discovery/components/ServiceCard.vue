<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { melbourneClock } from '@shared/melbourneTime.js'

import SaveServiceButton from '@/features/auth/components/SaveServiceButton.vue'
import RatingSummary from '@/features/ratings/components/RatingSummary.vue'
import AppButton from '@/shared/components/AppButton.vue'

import { formatAreaLine } from '../domain/resultsCopy.js'
import { formatActionType, formatCheckedDate } from '../domain/servicePresentation.js'
import { formatCardTrip } from '../domain/trip.js'
import { describeHoursToday } from '../domain/weeklyHours.js'

/**
 * One place in a result list. The card reads top to bottom in four parts, in the same positions
 * on every card, so several cards compare at a glance:
 * 1. what it is: the number badge in the brand colour (the pin's number), the action tags and
 *    the name, which links to Service Detail, then the save control (SaveServiceButton, compact:
 *    Save or Saved when signed in, Sign in to save otherwise), the toggle Service Detail has, on
 *    the same saved list. It is never inside the name link and comes after the name in reading
 *    and keyboard order, so a screen reader meets the place first; a card at least 17rem wide
 *    draws it in the top-right corner beside the tags, a narrower one under the name;
 * 2. the facts for deciding whether to look further, close together: the address (or only the
 *    suburb and postcode), the distance with the walking estimate, today's state by the weekly
 *    hours at the Melbourne minute of `now` ("Open now · closes 6pm", "Closed · opens Sat 10am",
 *    or "Hours not checked" when the hours cannot be read or there are none), the match label
 *    and, when the list shows ratings, the compact rating. The raw hours line is never shown: a
 *    run-on line reads badly in a card, and Service Detail shows the whole week;
 * 3. the summary of the place, in full;
 * 4. a footer: the source with the date it was last checked, then the actions (View details, and
 *    Show on map in the map view), always last.
 * An `area` record shows "In the 3168 area (exact venue not published)" and no minutes. The
 * distance and the walking time are estimates; the card never requests a route (Service Detail's
 * trip planner does). "Unrated" means no ratings yet and the check date says when the source was
 * read: neither judges the place, so both are plain secondary text. `TopRatedServices` passes
 * `service`, `show-rating` and `rating-summary` only.
 */
const props = defineProps({
  service: { type: Object, required: true },
  /** The list number (the pin's number); null renders no badge. */
  index: { type: Number, default: null },
  distanceKm: { type: Number, default: null },
  matchLabel: { type: String, default: '' },
  /** This place is the one selected on the map (Find nearby passes a selection in map view only). */
  selected: { type: Boolean, default: false },
  /** Renders the "Show on map" action (the view maps `select` to the map's focusPin). */
  showMapAction: { type: Boolean, default: false },
  showRating: { type: Boolean, default: false },
  ratingSummary: { type: Object, default: null },
  /**
   * The time today's state is read at: the list's minute clock, the same one "Open now" filters
   * by. Without it the card says nothing about the hours.
   */
  now: { type: Date, default: null },
  /** The name's heading level: 3 under a section's h2, 4 under the Other options h3. */
  headingLevel: { type: Number, default: 3, validator: (level) => level >= 2 && level <= 4 },
})
defineEmits(['select'])

const isArea = computed(() => props.service.geo?.precision === 'area')
const tripLine = computed(() =>
  isArea.value ? formatAreaLine(props.service) : formatCardTrip(props.distanceKm),
)
const today = computed(() =>
  props.now ? describeHoursToday(props.service.openingHours, melbourneClock(props.now)) : null,
)
</script>

<template>
  <article class="service-card" :class="{ 'service-card--selected': selected }">
    <div class="service-card__head">
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

      <SaveServiceButton compact :service-id="service.id" :service-name="service.name" />
    </div>

    <div class="service-card__facts">
      <p class="service-card__location">
        <span v-if="service.address">{{ service.address }}, </span>{{ service.suburb }}
        {{ service.postcode }}
      </p>
      <p v-if="tripLine" class="service-card__trip">{{ tripLine }}</p>
      <p v-if="today && today.status !== 'unknown'" class="service-card__hours">
        <span class="service-card__state" :class="`service-card__state--${today.status}`">{{
          today.label
        }}</span>
        · {{ today.detail }}
      </p>
      <p v-else-if="today" class="service-card__hours-unchecked">Hours not checked</p>
      <p v-if="matchLabel" class="service-card__match">{{ matchLabel }}</p>
      <div v-if="showRating" class="service-card__rating">
        <RatingSummary compact :summary="ratingSummary" />
      </div>
    </div>

    <p class="service-card__summary">{{ service.summary }}</p>

    <div class="service-card__footer">
      <p class="service-card__source">
        Source:
        <a :href="service.source.url" target="_blank" rel="noopener noreferrer"
          >{{ service.source.organisation
          }}<span class="visually-hidden"> (opens in a new tab)</span></a
        >, checked
        <time :datetime="service.source.checkedAt">{{
          formatCheckedDate(service.source.checkedAt)
        }}</time>
      </p>
      <div class="service-card__actions">
        <RouterLink
          class="inline-action"
          :to="{ name: 'service-detail', params: { serviceId: service.id } }"
        >
          View details <span aria-hidden="true">→</span>
        </RouterLink>
        <AppButton v-if="showMapAction" variant="text" @click="$emit('select')">
          Show on map
        </AppButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* One bordered surface per place, in one column at every width: the card reads the same in the
   full list, in the map view's narrower result column and on Home. Its own width, not the
   window's, decides where the save control goes (the container query below). */
.service-card {
  container: service-card / inline-size;
  display: grid;
  min-width: 0;
  gap: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: clamp(1rem, 3vw, 1.5rem);
}

/* Consecutive cards keep a regular gap; whatever sits above the first card owns that space. */
.service-card + .service-card {
  margin-top: 1rem;
}

/* The place selected on the map. The number badge, the card's twin of the pin, turns the heading
   colour that rings the selected pin, and a bar runs along the card's bottom edge inside its
   bottom padding, which never holds content. Two cues, one of them a shape, so the mark is not
   colour alone. Both are drawn inside the card's box, so nothing reaches the control or the card
   below and selecting changes no layout; neither is an outline, so the keyboard focus ring stays
   distinct. */
.service-card--selected {
  box-shadow: inset 0 -0.25rem 0 var(--color-brand);
}

.service-card--selected .service-card__badge {
  background: var(--color-heading);
  color: var(--color-surface);
}

/* Forced colours (Windows contrast themes) drop box shadows and replace background colours, which
   would leave no mark at all; the badge keeps one in the system highlight colours. */
@media (forced-colors: active) {
  .service-card--selected .service-card__badge {
    forced-color-adjust: none;
    background: Highlight;
    color: HighlightText;
  }
}

/* The head, in reading order on a narrow card or at a large text size: the badge and the tags,
   the name, then the save control under it. The control's alert, once it has a message, takes a
   row of its own below, the card's width. */
.service-card__head {
  display: grid;
  min-width: 0;
  grid-template-areas:
    'top'
    'title'
    'save';
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.service-card__top {
  display: flex;
  min-width: 0;
  grid-area: top;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

/* From 17rem wide (rem follows the reader's text setting, so a larger text size needs a wider
   card) the control moves up into the corner beside the badge and the tags, where listing cards
   keep their save control; the tags wrap in the room left to them and the name takes the whole
   width below. The top row is at least the control's height, so the head keeps its size while
   the session is restoring and the control has not appeared yet. */
@container service-card (min-width: 17rem) {
  .service-card__head {
    grid-template-areas:
      'top save'
      'title title';
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .service-card__top {
    min-height: 2.75rem;
  }
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

/* A fixed size rather than a viewport-scaled one: the card's width follows its pane, not the
   window. */
.service-card__title {
  grid-area: title;
  margin: 0;
  color: var(--color-heading);
  font-size: 1.3125rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

/* The facts: short lines close together, so where, how far, when and why it matched read as one
   group above the summary. */
.service-card__facts {
  display: grid;
  min-width: 0;
  gap: 0.3rem;
  font-size: 0.9375rem;
  line-height: 1.45;
}

.service-card__facts p {
  margin: 0;
}

.service-card__location,
.service-card__hours {
  color: var(--color-text);
}

/* The distance and walking time are computed estimates, so they sit a step quieter than the
   published facts. */
.service-card__trip {
  color: var(--color-text-muted);
}

/* The state word leads the line in weight, and "Open now" in the success colour; the words say
   the state, so the colour is never the only cue. */
.service-card__state {
  font-weight: 600;
}

.service-card__state--open {
  color: var(--color-success);
}

.service-card__state--closed {
  color: var(--color-heading);
}

/* Set like a state word, so every card's hours line has one size and weight. */
.service-card__hours-unchecked {
  color: var(--color-heading);
  font-weight: 600;
}

.service-card__match {
  color: var(--color-brand-strong);
  font-weight: 600;
}

/* The rating is a secondary aid: plain muted text, so "Unrated" (no ratings yet) and "Rating
   unavailable" never read as a warning or a low score. The compact rating's root element carries
   this component's scope, so the rule reaches it without :deep(). */
.service-card__rating .rating-summary--compact {
  color: var(--color-text-muted);
  font-weight: 500;
}

/* The summary: normal size at a comfortable measure, quieter than the facts above it, never
   cropped. */
.service-card__summary {
  max-width: 65ch;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

/* The footer: the source and its check date as one small line, then the actions, which are the
   last thing on every card. */
.service-card__footer {
  display: grid;
  min-width: 0;
  gap: 0.25rem;
  border-top: 1px solid var(--color-border);
  padding-top: 0.75rem;
}

.service-card__source {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

/* When the line wraps, the date moves to the next line whole ("29 Sept 2026"), never split. The
   catalogue read keeps only records whose check date is a calendar date, so the text is always a
   short date and keeping it on one line cannot push the card wider. */
.service-card__source time {
  white-space: nowrap;
}

.service-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 1.25rem;
}
</style>
