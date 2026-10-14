<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { focusAfterAction } from '@/shared/composables/focusAfterAction.js'

import { TRIP_MODES, buildGoogleMapsUrl, buildPtvUrl, formatTrip } from '../domain/trip.js'

/**
 * The trip controls of Service Detail, placed under the page's single-pin map in Getting there:
 * the travel modes as one native radio group (one Tab stop, the arrow keys move the choice, as
 * every browser does for radios sharing a name) with a line saying what each mode does, the From
 * line, then the chosen mode's own action, its result, and Google Maps.
 *
 * Walk, Bike and Drive are estimated here: "Show route on map" asks for one route per press (the
 * route repository allows one a second), the view draws it on the map above, and the one status
 * line under the button gives the time and distance, or the straight-line estimate when routing
 * failed. Public transport is never estimated here: its action is a labelled link to the PTV
 * journey planner. Google Maps follows in every mode from the start, so opening another app never
 * waits on a request here. An `area` record gets no travel controls at all.
 *
 * The copy follows what can happen in the chosen mode: the sentence about the start point going to
 * the routing service shows only with the button that sends it, and before it, so it is read
 * before the press; the routing credit shows with the route it describes (an estimate is
 * TurnAgain's own arithmetic, and the map's own attribution credits routing whenever the map is
 * shown). The Google Maps sentence says what that app receives, apart from the routing sentence,
 * because it is a separate trip for the data.
 *
 * Props in, events out: the view owns `useTripRoute` and `useLocationOrigin`; this component
 * imports no data module. Choosing a mode emits `select-mode` so the view retires the previous
 * mode's trip, and a result renders only under the mode it was requested for.
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
const MODES_HINT =
  'Walk, Bike and Drive are estimated here and drawn on the map. Public transport opens the PTV journey planner.'
const PRIVACY_COPY =
  'Your start point is sent to FOSSGIS when you choose Show route on map. TurnAgain does not save your location. The routing provider logs requests.'
const ATTRIBUTION_COPY = 'Routing by OSRM / FOSSGIS, data © OpenStreetMap contributors (ODbL)'
// PTV publishes no way to pre-fill its planner, so the sentence never promises a prepared trip.
const TRANSIT_NOTE =
  'TurnAgain does not estimate public transport. The PTV journey planner opens empty, ready for you to enter the trip.'
const GOOGLE_NOTE =
  'Google Maps receives this place, the travel mode and your start point if you set one.'

const selectedMode = ref(props.mode)
watch(
  () => props.mode,
  (mode) => {
    selectedMode.value = mode
  },
)
const isTransit = computed(() => selectedMode.value === 'transit')
// `estimate` follows the mode the trip was last requested in and its sentence names no mode, so
// a result shown under another chip would pass one mode's minutes off as the other's.
const showsRequestedMode = computed(() => selectedMode.value === props.mode)
const isArea = computed(() => props.service.geo?.precision === 'area')
const geo = computed(() => props.service.geo ?? null)
const locating = computed(() => props.originStatus === 'pending')
const typedPlace = ref('')
const changingOrigin = ref(false)
const showOriginControls = computed(() => !props.origin || changingOrigin.value)
const originControls = ref(null)
const changeButton = ref(null)
// A new start point answers "Change", from either control, so the controls close behind it. The
// control that chose it leaves with them, so focus that was inside them moves to Change, which
// names the new start point's line; focus anywhere else on the page stays where it is.
watch(
  () => props.origin,
  async () => {
    const focusInside = originControls.value?.contains(document.activeElement) ?? false
    changingOrigin.value = false
    if (!focusInside) return
    await nextTick()
    changeButton.value?.$el?.focus()
  },
)
// Change removes itself as it opens the controls, so focus moves to their first control.
const openOriginControls = () =>
  focusAfterAction(
    () => {
      changingOrigin.value = true
    },
    () => originControls.value?.querySelector('button, input') ?? null,
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
  () => props.origin !== null && !isTransit.value && !waiting.value && props.status !== 'loading',
)
const resultLine = computed(() => {
  if (isTransit.value || !showsRequestedMode.value) return ''
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
const showsOfflinePanel = computed(() => props.status === 'offline' && !isTransit.value)
// The one status line stays mounted, so the route sentence and the offline notice are announced
// when they arrive; a line inserted together with its text is not reliably read.
const liveLine = computed(() =>
  showsOfflinePanel.value ? 'The route needs a connection.' : resultLine.value,
)
// True only while the line shows a route the routing service returned (resultLine is already
// empty under another mode or for public transport).
const showsRoute = computed(
  () => props.status === 'ready' && props.route !== null && resultLine.value !== '',
)
// Both builders return '' without a usable destination, and then the link is not offered.
const googleUrl = computed(() =>
  buildGoogleMapsUrl({ origin: props.origin, destination: geo.value, mode: selectedMode.value }),
)
const ptvUrl = computed(() => buildPtvUrl(geo.value))

const requestDirections = () => {
  if (canRequest.value) emit('request', selectedMode.value)
}
// Try again leaves with the offline panel; the route button stays (busy while the route loads),
// so it takes focus rather than the page's main region.
const routeButton = ref(null)
const retryRoute = () => focusAfterAction(requestDirections, () => routeButton.value?.$el ?? null)
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
      <fieldset class="trip-planner__modes" aria-describedby="trip-modes-hint">
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
      <p id="trip-modes-hint" class="trip-planner__note">{{ MODES_HINT }}</p>

      <p class="trip-planner__from">
        {{ fromLine }}
        <AppButton
          v-if="origin && !changingOrigin"
          ref="changeButton"
          variant="text"
          @click="openOriginControls"
        >
          Change
        </AppButton>
      </p>
      <div v-if="showOriginControls" ref="originControls" class="trip-planner__origin">
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

      <div v-if="isTransit" class="trip-planner__action">
        <p class="trip-planner__note trip-planner__transit-note">{{ TRANSIT_NOTE }}</p>
        <a
          v-if="ptvUrl"
          class="button button--primary"
          :href="ptvUrl"
          target="_blank"
          rel="noopener noreferrer"
          >Open the PTV journey planner<span class="visually-hidden"> (opens in a new tab)</span></a
        >
      </div>
      <div v-else class="trip-planner__action">
        <p class="trip-planner__note trip-planner__privacy">{{ PRIVACY_COPY }}</p>
        <AppButton
          ref="routeButton"
          variant="primary"
          :busy="status === 'loading'"
          :disabled="!canRequest && status !== 'loading'"
          @click="requestDirections"
        >
          Show route on map
        </AppButton>
      </div>

      <p class="trip-planner__result" :class="{ 'visually-hidden': !resultLine }" role="status">
        {{ liveLine }}
      </p>
      <StatePanel
        v-if="showsOfflinePanel"
        variant="offline"
        title="The route needs a connection"
        :live="false"
        @retry="retryRoute"
      />
      <p v-if="showsRoute" class="trip-planner__note trip-planner__attribution">
        {{ ATTRIBUTION_COPY }}
      </p>

      <div v-if="googleUrl" class="trip-planner__external">
        <p class="trip-planner__note trip-planner__links-note">{{ GOOGLE_NOTE }}</p>
        <a class="trip-planner__link" :href="googleUrl" target="_blank" rel="noopener noreferrer"
          >Open in Google Maps<span class="visually-hidden"> (opens in a new tab)</span></a
        >
      </div>
    </template>
  </div>
</template>

<style scoped>
/* The controls size themselves to the space the page gives them (a phone column, the full width
   of a tablet, or the narrower practical column of a desktop), so the mode group is laid out by
   this box's width, not the window's. */
.trip-planner {
  display: grid;
  gap: 1rem;
  container: trip-planner / inline-size;
}

.trip-planner p {
  margin: 0;
}

.trip-planner__area {
  color: var(--color-text);
  font-weight: 600;
}

/* The four modes do not fit one row in a narrow box, so they start as separate rounded segments
   in two columns; nothing clips them, so the focus ring is never cut off. */
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

/* Once the box is wide enough for the four labels at the current text size (rem follows the
   reader's text setting), the modes join into one pill: the end segments carry its curve, so the
   group needs no overflow clip. */
@container trip-planner (min-width: 26rem) {
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

/* The chosen mode's action: its sentence, then the button or link it explains. */
.trip-planner__action {
  display: grid;
  gap: 0.625rem;
  justify-items: start;
}

.trip-planner__result {
  color: var(--color-heading);
  font-weight: 600;
}

.trip-planner__external {
  display: grid;
  gap: 0.25rem;
  justify-items: start;
}

.trip-planner__link {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  font-weight: 600;
}

/* Every secondary sentence (what the modes do, where the start point goes, the routing credit,
   what Google Maps receives) shares one size and colour. */
.trip-planner__note {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}
</style>
