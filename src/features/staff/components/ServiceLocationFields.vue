<script setup>
import { computed, ref, watch } from 'vue'

import NearbyMap from '@/features/discovery/components/NearbyMap.vue'
import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'

import { useAddressLookup } from '../composables/useAddressLookup.js'
import {
  ADDRESS_LOOKUP_ATTRIBUTION,
  ADDRESS_LOOKUP_NOTICE,
  LOCATION_HELP,
  isPositionCurrent,
  locationStatusText,
} from '../domain/serviceLocation.js'

/**
 * The service's address and its map position, one group of the service form. The person types the
 * street address, suburb and postcode; when typing pauses or a place field is left, the address is
 * looked up and the position is filled in, never typed: one exact match is taken, several are
 * offered as buttons with the postcode area as the last choice, and a failure says what to do next
 * with Try again. "Show on map" stays the business choice of whether the service appears on the
 * map; unticking it is how a service is saved without a position. The status line is a live region
 * mounted from the start and is where focus goes when a pressed choice or Try again leaves; a
 * location error marks Show on map, the control that always exists. The v-model is the draft's
 * `location` value (serviceLocation.js).
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  /** The service's name, for the preview pin. */
  serviceName: { type: String, default: '' },
  /** Changes when the form moves to another record, which drops a lookup still running. */
  recordKey: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const location = computed(() => props.modelValue)
const update = (changes) => emit('update:modelValue', { ...props.modelValue, ...changes })
const field = (name) => ({ id: `service-${name}`, error: props.errors[name] ?? '' })

const lookup = useAddressLookup({
  location: () => props.modelValue,
  recordKey: () => props.recordKey,
  adopt: (geo, matchedFor) => update({ geo, matchedFor }),
})
const { phase, candidates } = lookup

const statusText = computed(() =>
  locationStatusText({
    location: props.modelValue,
    phase: lookup.phase.value,
    failure: lookup.failure.value,
    note: lookup.note.value,
    matchedLabel: lookup.matchedLabel.value,
  }),
)
// The form sets its errors on Save and keeps them until the next one. A location error is about
// the position the draft held then: once a lookup or a choice gives the draft a new position for
// the address as it now reads, the status line says the place was found, so the error is hidden
// and Show on map is no longer marked invalid. An error that arrived while the draft already held
// its current position (a refusal of that position) stays.
const positionOf = (current) => JSON.stringify([current.geo ?? null, current.matchedFor ?? ''])
const errorPosition = ref(positionOf(props.modelValue))
watch(
  () => props.errors,
  () => {
    errorPosition.value = positionOf(props.modelValue)
  },
)
const locationError = computed(() => {
  const current = props.modelValue
  if (isPositionCurrent(current) && positionOf(current) !== errorPosition.value) return ''
  return props.errors.location ?? ''
})
const postcode = computed(() => String(props.modelValue.postcode ?? '').trim())

// A choice and Try again remove the pressed button, so focus moves first to the status line,
// which stays and then says what happened.
const statusLine = ref(null)
const fromStatus = (action) => {
  statusLine.value?.focus()
  action()
}

// The preview shows only a position found for the address as it now reads. A single map centres
// itself when it loads, so a new position mounts a fresh map.
const preview = computed(() => {
  const current = props.modelValue
  if (!current.showOnMap || !isPositionCurrent(current)) return null
  const { geo } = current
  return {
    key: `${geo.latitude},${geo.longitude},${geo.precision}`,
    items: [
      {
        service: {
          id: 'service-location-preview',
          name: props.serviceName.trim() || 'This service',
          postcode: postcode.value,
          geo,
        },
        distanceKm: null,
        index: 1,
      },
    ],
  }
})
</script>

<template>
  <fieldset
    id="service-location"
    class="service-location"
    tabindex="-1"
    aria-describedby="service-location-hint"
  >
    <legend>Address and map</legend>
    <p id="service-location-hint" class="service-location__hint">{{ LOCATION_HELP }}</p>

    <FormField v-bind="field('address')" label="Street address" hint="Leave empty when unknown.">
      <template #default="{ control }">
        <input
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="location.address"
          @input="update({ address: $event.target.value })"
          @blur="lookup.flush"
        />
      </template>
    </FormField>
    <div class="service-location__place">
      <FormField v-bind="field('suburb')" label="Suburb" required>
        <template #default="{ control }">
          <input
            v-bind="control"
            class="form-control"
            type="text"
            dir="auto"
            :value="location.suburb"
            @input="update({ suburb: $event.target.value })"
            @blur="lookup.flush"
          />
        </template>
      </FormField>
      <FormField v-bind="field('postcode')" label="Postcode" required>
        <template #default="{ control }">
          <input
            v-bind="control"
            class="form-control"
            type="text"
            inputmode="numeric"
            maxlength="4"
            :value="location.postcode"
            @input="update({ postcode: $event.target.value })"
            @blur="lookup.flush"
          />
        </template>
      </FormField>
    </div>

    <label class="service-location__check">
      <input
        id="service-showOnMap"
        type="checkbox"
        :checked="location.showOnMap"
        :aria-invalid="locationError ? 'true' : undefined"
        :aria-describedby="locationError ? 'service-location-error' : undefined"
        @change="update({ showOnMap: $event.target.checked })"
      />
      Show on map
    </label>
    <p
      id="service-location-status"
      ref="statusLine"
      class="service-location__status"
      role="status"
      tabindex="-1"
    >
      {{ statusText }}
    </p>
    <p v-if="locationError" id="service-location-error" class="service-location__error">
      {{ locationError }}
    </p>

    <ul
      v-if="phase === 'choose'"
      class="service-location__choices"
      aria-label="Places that match this address"
    >
      <li v-for="candidate in candidates" :key="candidate.id">
        <AppButton
          variant="secondary"
          class="service-location__choice"
          @click="fromStatus(() => lookup.choose(candidate))"
        >
          <span dir="auto">Use {{ candidate.label }}</span>
        </AppButton>
      </li>
      <li>
        <AppButton
          variant="secondary"
          class="service-location__choice"
          @click="fromStatus(lookup.chooseArea)"
        >
          Use the {{ postcode }} area instead
        </AppButton>
      </li>
    </ul>
    <AppButton
      v-if="phase === 'failed'"
      variant="secondary"
      class="service-location__retry"
      @click="fromStatus(lookup.retry)"
    >
      Try again
    </AppButton>

    <NearbyMap v-if="preview" :key="preview.key" single :items="preview.items" :radius-km="0" />
    <p v-if="location.showOnMap" class="service-location__credit">
      {{ ADDRESS_LOOKUP_NOTICE }} {{ ADDRESS_LOOKUP_ATTRIBUTION }}
    </p>
  </fieldset>
</template>

<style scoped>
/* A fieldset's minimum width is its content's, which would push the map past a phone screen. */
.service-location {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
}

.service-location legend {
  padding: 0 0.25rem;
  color: var(--color-heading);
  font-weight: 600;
}

.service-location__hint,
.service-location__credit {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.service-location__place {
  display: grid;
  gap: 1.25rem;
}

.service-location__check {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
  justify-self: start;
}

.service-location__status {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.service-location__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
  font-weight: 600;
}

.service-location__choices {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.service-location__choice {
  width: 100%;
  justify-content: flex-start;
  text-align: start;
}

.service-location__retry {
  justify-self: start;
}

@media (min-width: 768px) {
  .service-location__place {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }
}
</style>
