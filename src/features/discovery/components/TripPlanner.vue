<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'
import StatePanel from '@/shared/components/StatePanel.vue'

import { TRIP_MODES, buildGoogleMapsUrl, buildPtvUrl, formatTrip } from '../domain/trip.js'

/**
 * The trip panel of Service Detail: the travel modes as one native radio group (one Tab stop,
 * the arrow keys move the choice, as every browser does for radios sharing a name), the From
 * line, one Directions request per click (the route repository allows one a second), the route
 * sentence or the straight-line estimate with the Google Maps and PTV links, public transport as
 * links only, and no Directions control at all for an `area` record. The fixed copy says where
 * the start point goes. Props in, events out: the view owns
 * `useTripRoute` and `useLocationOrigin`; this component imports no data module. Choosing a mode
 * emits `select-mode` so the view retires the previous mode's trip, and a result renders only
 * under the mode it was requested for.
 */
const props = defineProps({
  service: { type: Object, required: true },
  origin: { type: Object, default: null },
  originStatus: { type: String, default: 'idle' },
  /** useTripRoute: 'idle' | 'loading' | 'ready' | 'estimated' | 'offline'. */
  status: { type: String, default: 'idle' },
  mode: { type: String, default: 'walking' },
  route: { type: Object, default: null },
  estimate: { type: Object, default: null },
  retryAfterMs: { type: Number, default: 0 },
  locationError: { type: String, default: '' },
})
const emit = defineEmits(['request', 'use-my-location', 'set-typed-origin', 'select-mode'])

const MODE_LABELS = Object.freeze({
  walking: 'Walk',
  cycling: 'Bike',
  transit: 'Public transport',
  driving: 'Drive',
})
const PRIVACY_COPY =
  'Your start point is sent to FOSSGIS when you request directions. TurnAgain does not save your location. The routing provider logs requests.'
const ATTRIBUTION_COPY = 'Routing by OSRM / FOSSGIS, data © OpenStreetMap contributors (ODbL)'

const selectedMode = ref(props.mode)
watch(
  () => props.mode,
  (mode) => {
    selectedMode.value = mode
  },
)
// `estimate` follows the mode the trip was last requested in and its sentence names no mode, so
// a result shown under another chip would pass one mode's minutes off as the other's.
const showsRequestedMode = computed(() => selectedMode.value === props.mode)
const isArea = computed(() => props.service.geo?.precision === 'area')
const geo = computed(() => props.service.geo ?? null)
const locating = computed(() => props.originStatus === 'pending')
const typedPlace = ref('')
const changingOrigin = ref(false)
const showOriginControls = computed(() => !props.origin || changingOrigin.value)
// A new start point answers "Change", from either control, so the controls close behind it.
watch(
  () => props.origin,
  () => {
    changingOrigin.value = false
  },
)

// The rate gate's wait: the button re-enables once the window has passed.
const waiting = ref(false)
let waitTimer
watch(
  () => props.retryAfterMs,
  (ms) => {
    clearTimeout(waitTimer)
    waiting.value = ms > 0
    if (ms > 0) {
      waitTimer = setTimeout(() => {
        waiting.value = false
      }, ms)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(waitTimer))

const fromLine = computed(() => {
  if (!props.origin) return 'Choose a starting point'
  return props.origin.source === 'geolocation'
    ? 'From your approximate location'
    : `From ${props.origin.label}`
})
const canRequest = computed(
  () =>
    props.origin !== null &&
    selectedMode.value !== 'transit' &&
    !waiting.value &&
    props.status !== 'loading',
)
const resultLine = computed(() => {
  if (selectedMode.value === 'transit' || !showsRequestedMode.value) return ''
  if (props.status === 'ready' && props.route) {
    return formatTrip({
      kind: 'route',
      mode: props.route.mode,
      distanceKm: props.route.distanceKm,
      minutes: props.route.durationMinutes,
    })
  }
  if (props.status === 'estimated' && props.estimate) {
    return formatTrip({ kind: 'estimate', mode: selectedMode.value, ...props.estimate })
  }
  return ''
})
const showsOfflinePanel = computed(
  () => props.status === 'offline' && selectedMode.value !== 'transit',
)
// The one status line stays mounted, so the route sentence and the offline notice are announced
// when they arrive; a line inserted together with its text is not reliably read.
const liveLine = computed(() =>
  showsOfflinePanel.value ? 'Directions need a connection.' : resultLine.value,
)
const showLinks = computed(
  () =>
    geo.value !== null &&
    (selectedMode.value === 'transit' ||
      (showsRequestedMode.value && (props.status === 'estimated' || props.status === 'ready'))),
)
const googleUrl = computed(() =>
  buildGoogleMapsUrl({ origin: props.origin, destination: geo.value, mode: selectedMode.value }),
)
const ptvUrl = computed(() => buildPtvUrl(geo.value))

const requestDirections = () => {
  if (canRequest.value) emit('request', selectedMode.value)
}
const submitTypedPlace = () => {
  const text = typedPlace.value.trim()
  if (text) emit('set-typed-origin', text)
  changingOrigin.value = false
}
</script>

<template>
  <div class="trip-planner">
    <template v-if="isArea">
      <p class="trip-planner__area">Exact venue not published; check the source</p>
      <p>
        <a :href="service.source.url" target="_blank" rel="noopener noreferrer">
          {{ service.source.organisation
          }}<span class="visually-hidden"> (opens in a new tab)</span>
        </a>
      </p>
    </template>

    <template v-else>
      <fieldset class="trip-planner__modes">
        <legend class="visually-hidden">Travel mode</legend>
        <label v-for="value in TRIP_MODES" :key="value" class="trip-planner__mode">
          <input
            v-model="selectedMode"
            class="trip-planner__mode-input"
            type="radio"
            name="trip-mode"
            :value="value"
            @change="emit('select-mode', value)"
          />
          <span>{{ MODE_LABELS[value] }}</span>
        </label>
      </fieldset>

      <p class="trip-planner__from">
        {{ fromLine }}
        <AppButton v-if="origin && !changingOrigin" variant="text" @click="changingOrigin = true">
          Change
        </AppButton>
      </p>
      <div v-if="showOriginControls" class="trip-planner__origin">
        <AppButton variant="secondary" :busy="locating" @click="emit('use-my-location')">
          {{ locating ? 'Finding your location…' : 'Use my location' }}
        </AppButton>
        <form class="trip-planner__typed" novalidate @submit.prevent="submitTypedPlace">
          <FormField
            id="trip-origin"
            label="Or start from a suburb or postcode"
            :error="locationError"
          >
            <template #default="{ control }">
              <input
                v-bind="control"
                v-model="typedPlace"
                class="form-control"
                type="text"
                autocomplete="address-level2"
                dir="auto"
                placeholder="For example, Clayton 3168…"
              />
            </template>
          </FormField>
          <AppButton variant="secondary" type="submit">Use this place</AppButton>
        </form>
      </div>
      <p v-else-if="locationError" class="trip-planner__error" role="alert" dir="auto">
        {{ locationError }}
      </p>

      <div class="trip-planner__actions">
        <AppButton
          v-if="selectedMode !== 'transit'"
          variant="primary"
          :busy="status === 'loading'"
          :disabled="!canRequest && status !== 'loading'"
          @click="requestDirections"
        >
          Directions
        </AppButton>
      </div>

      <p class="trip-planner__result" :class="{ 'visually-hidden': !resultLine }" role="status">
        {{ liveLine }}
      </p>
      <StatePanel
        v-if="showsOfflinePanel"
        variant="offline"
        title="Directions need a connection"
        :live="false"
        @retry="requestDirections"
      />

      <ul v-if="showLinks" class="trip-planner__links">
        <li>
          <a :href="ptvUrl" target="_blank" rel="noopener noreferrer"
            >Plan with PTV<span class="visually-hidden"> (opens in a new tab)</span></a
          >
        </li>
        <li>
          <a :href="googleUrl" target="_blank" rel="noopener noreferrer"
            >Open in Google Maps<span class="visually-hidden"> (opens in a new tab)</span></a
          >
        </li>
      </ul>

      <p class="trip-planner__privacy">{{ PRIVACY_COPY }}</p>
      <p class="trip-planner__attribution">{{ ATTRIBUTION_COPY }}</p>
    </template>
  </div>
</template>

<style scoped>
.trip-planner {
  display: grid;
  gap: 0.875rem;
}

.trip-planner p {
  margin: 0;
}

.trip-planner__area {
  color: var(--color-text);
  font-weight: 600;
}

/* The four modes do not fit one row at phone width, so they start as separate rounded segments
   in two columns; nothing clips them, so the focus ring is never cut off (cross-cutting#7). */
.trip-planner__modes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}

.trip-planner__mode {
  position: relative;
  display: flex;
}

/* The input stays in the accessibility tree and takes focus; the chip beside it is what shows. */
.trip-planner__mode-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.trip-planner__mode span {
  display: inline-flex;
  flex: 1;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface);
  padding: 0.45rem 1rem;
  color: var(--color-text);
  font-size: 0.9375rem;
  font-weight: 600;
  text-align: center;
}

.trip-planner__mode-input:checked + span {
  border-color: var(--color-brand);
  background: var(--color-brand);
  color: var(--color-on-brand);
}

.trip-planner__mode-input:focus-visible + span {
  outline: 3px solid var(--color-focus);
  outline-offset: -3px;
}

/* From 576 px the modes join into one pill: the end segments carry its curve, so the
   group needs no overflow clip. */
@media (min-width: 576px) {
  .trip-planner__modes {
    display: inline-flex;
    justify-self: start;
    gap: 0;
    border: 1px solid var(--color-border-strong);
    border-radius: 999px;
  }

  .trip-planner__mode span {
    border: 0;
    border-radius: 0;
  }

  .trip-planner__mode:first-of-type span {
    border-radius: 999px 0 0 999px;
  }

  .trip-planner__mode:last-of-type span {
    border-radius: 0 999px 999px 0;
  }
}

.trip-planner__from {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-heading);
  font-weight: 600;
}

.trip-planner__origin {
  display: grid;
  gap: 0.75rem;
  justify-items: start;
}

.trip-planner__typed {
  display: grid;
  gap: 0.5rem;
  width: min(100%, 24rem);
}

.trip-planner__error {
  color: var(--color-danger);
  font-weight: 600;
}

/* A place error echoes the typed text: it takes its direction from its text. */
.trip-planner__error,
.trip-planner :deep(.form-field__error) {
  unicode-bidi: plaintext;
}

.trip-planner__result {
  color: var(--color-text);
}

.trip-planner__links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trip-planner__links a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
}

.trip-planner__privacy,
.trip-planner__attribution {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
