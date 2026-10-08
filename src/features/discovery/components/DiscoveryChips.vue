<script setup>
import { computed } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import Chip from '@/shared/components/Chip.vue'

import { FIND_NEARBY_ACTIONS, FIND_NEARBY_RADII } from '../domain/findNearbyQuery.js'
import { formatActionType } from '../domain/servicePresentation.js'

/**
 * The refinement rows of Find nearby: the toolbar row holds the action chips with counts, the
 * "Open now" chip and, at its right end, the one Map | List button (a real button whose label
 * names the other view: "Map" in list view, "List" in map view; shown only while the view says a
 * search has results); then the location chip with the radius and sort as native selects styled
 * as chips; then, in map view only, "Update as map moves". Props in, events out; the view owns the
 * URL state (`view=list|map` stays the single truth).
 */
const props = defineProps({
  actionTypes: { type: Array, default: () => [] },
  counts: { type: Object, default: () => ({}) },
  /** The "Open now" chip (`open=1`). */
  open: { type: Boolean, default: false },
  /** The effective radius (`effectiveRadius`): 2 | 5 | 10 | 20 | 0. */
  radius: { type: Number, default: 10 },
  viewportApplied: { type: Boolean, default: false },
  sort: { type: String, default: 'name-asc' },
  /** 'your location' | 'Clayton 3168' | null (the pending chip). */
  originLabel: { type: String, default: null },
  originStatus: { type: String, default: 'idle' },
  follow: { type: Boolean, default: false },
  view: { type: String, default: 'list' },
  /** True once a search has results (the view decides; always true in map view). */
  showViewToggle: { type: Boolean, default: false },
  idPrefix: { type: String, default: 'discovery' },
})
const emit = defineEmits([
  'update:actionTypes',
  'update:open',
  'update:radius',
  'update:sort',
  'update:follow',
  'update:view',
  'request-location',
  'clear-origin',
])

const RADIUS_OPTIONS = FIND_NEARBY_RADII.map((value) => ({
  value: String(value),
  label: value === 0 ? 'Any distance' : `${value} km`,
}))
const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name: A–Z' },
  { value: 'name-desc', label: 'Name: Z–A' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'highest-rated', label: 'Rating: high to low' },
]

const actionChips = computed(() =>
  FIND_NEARBY_ACTIONS.map((action) => ({
    action,
    label: `${formatActionType(action)} (${props.counts[action] ?? 0})`,
    pressed: props.actionTypes.includes(action),
  })),
)
const toggleAction = (action) => {
  const next = props.actionTypes.includes(action)
    ? props.actionTypes.filter((value) => value !== action)
    : [...props.actionTypes, action]
  emit(
    'update:actionTypes',
    FIND_NEARBY_ACTIONS.filter((value) => next.includes(value)),
  )
}
const radiusValue = computed(() => (props.viewportApplied ? 'map-area' : String(props.radius)))
const changeRadius = (event) => {
  const { value } = event.target
  if (value !== 'map-area') emit('update:radius', Number(value))
}
const locating = computed(() => props.originStatus === 'pending')
const locationLabel = computed(() => {
  if (locating.value) return 'Finding your location…'
  if (props.originLabel === null) return 'Use my location'
  return props.originLabel === 'your location' ? 'Near you' : `Near ${props.originLabel}`
})
// One button, one element: its label changes with the view, so focus stays on it after a switch
// and the label always names where the button goes (never aria-pressed, which would say a
// "Map" button is on while the map shows).
const isMapView = computed(() => props.view === 'map')
const viewToggleLabel = computed(() => (isMapView.value ? 'List' : 'Map'))
const toggleView = () => emit('update:view', isMapView.value ? 'list' : 'map')
</script>

<template>
  <div class="discovery-chips" role="group" aria-label="Refine results">
    <div class="discovery-chips__toolbar">
      <div class="discovery-chips__row" role="group" aria-label="Action">
        <Chip
          v-for="chip in actionChips"
          :key="chip.action"
          :label="chip.label"
          :pressed="chip.pressed"
          @toggle="toggleAction(chip.action)"
        />
      </div>
      <Chip label="Open now" :pressed="open" @toggle="emit('update:open', !open)" />
      <AppButton
        v-if="showViewToggle"
        variant="secondary"
        class="discovery-chips__view-toggle"
        @click="toggleView"
      >
        {{ viewToggleLabel }}
      </AppButton>
    </div>

    <div class="discovery-chips__row">
      <!-- A real toggle: the pressed chip clears the origin, so its pressed state means
           what it announces; the unpressed chip asks for the location. -->
      <Chip
        :label="locationLabel"
        :pressed="originLabel !== null"
        :aria-busy="locating ? 'true' : undefined"
        @toggle="originLabel !== null ? emit('clear-origin') : emit('request-location')"
      />
      <AppButton v-if="originLabel !== null" variant="text" @click="emit('clear-origin')">
        Clear location
      </AppButton>

      <label class="discovery-chips__select">
        <span>Within</span>
        <select :id="`${idPrefix}-radius`" :value="radiusValue" @change="changeRadius">
          <option v-for="option in RADIUS_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
          <option v-if="viewportApplied" value="map-area">Map area</option>
        </select>
      </label>

      <label class="discovery-chips__select">
        <span>Sort</span>
        <select
          :id="`${idPrefix}-sort`"
          :value="sort"
          @change="emit('update:sort', $event.target.value)"
        >
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="isMapView" class="discovery-chips__row">
      <Chip
        label="Update as map moves"
        :pressed="follow"
        @toggle="emit('update:follow', !follow)"
      />
    </div>
  </div>
</template>

<style scoped>
.discovery-chips {
  display: grid;
  gap: 0.75rem;
}

.discovery-chips__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

/* The toolbar: the action chips at the start, the view button at the end (it wraps under them
   on a narrow screen and stays at the right edge). */
.discovery-chips__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}

.discovery-chips__view-toggle {
  min-width: 4.5rem;
  min-height: 2.75rem;
  margin-inline-start: auto;
  border-radius: 999px;
  padding: 0.45rem 1.1rem;
}

/* A native select wearing the chip outline: the label text sits inside the pill. */
.discovery-chips__select {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface);
  padding: 0.3rem 0.5rem 0.3rem 0.9rem;
  color: var(--color-text);
  font-size: 0.9375rem;
  font-weight: 600;
}

.discovery-chips__select select {
  min-height: 2.1rem;
  border: 0;
  background: transparent;
  color: var(--color-brand-strong);
  font: inherit;
  cursor: pointer;
}
</style>
