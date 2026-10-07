<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'

import { resolveTypedOrigin, unknownPlaceCopy } from '../domain/postcodeCentroids.js'
import { validateSearchInput } from '../domain/searchValidation.js'

/**
 * The public search form: the item, the suburb or postcode and
 * Find options, nothing else. The format checks of `searchValidation.js` run on submit, then the
 * place lookup against the Vicmap table, so an unknown place is a third validation type
 * ("We don't have a location for 'Cheltenham East'. Try a Victorian postcode, e.g. 3168") and
 * never reaches the URL. The device-location request is the map's "Use my location" control, not
 * the form's. Home and Find nearby mount it; a parent-supplied `locationError` (a denied
 * geolocation prompt, an unresolvable URL location) shows as the field's error until the person
 * edits the field.
 */
const props = defineProps({
  initialItem: { type: String, default: '' },
  initialLocation: { type: String, default: '' },
  locationError: { type: String, default: '' },
})

const emit = defineEmits({
  submit: ({ item, location }) => typeof item === 'string' && typeof location === 'string',
})

const item = ref(props.initialItem)
const location = ref(props.initialLocation)
const itemInput = ref(null)
const locationInput = ref(null)
const errors = reactive({ item: '', location: '' })
const errorSummary = ref('')
const resolving = ref(false)
const dismissedParentError = ref(false)

watch(
  () => [props.initialItem, props.initialLocation],
  ([nextItem, nextLocation]) => {
    item.value = nextItem
    location.value = nextLocation
    errors.item = ''
    errors.location = ''
    errorSummary.value = ''
  },
)
watch(
  () => props.locationError,
  () => {
    dismissedParentError.value = false
  },
)

const locationFieldError = computed(
  () => errors.location || (dismissedParentError.value ? '' : props.locationError),
)

const clearFieldError = (field) => {
  errors[field] = ''
  errorSummary.value = ''
  if (field === 'location') dismissedParentError.value = true
}

const failWith = async (field, count) => {
  errorSummary.value = `${count} ${count === 1 ? 'field needs' : 'fields need'} attention before you can search.`
  // Move focus to the first invalid field after Vue renders its linked error, so keyboard and
  // screen-reader users get an immediate recovery point.
  await nextTick()
  const target = field === 'item' ? itemInput.value : locationInput.value
  target?.focus()
}

const submitSearch = async () => {
  // Native autofill may update a control without notifying v-model first.
  const result = validateSearchInput({
    item: itemInput.value?.value ?? item.value,
    location: locationInput.value?.value ?? location.value,
  })
  errors.item = result.errors.item
  errors.location = result.errors.location
  if (!result.isValid) {
    await failWith(
      errors.item ? 'item' : 'location',
      Object.values(result.errors).filter(Boolean).length,
    )
    return
  }
  if (result.values.location) {
    // A lookup that cannot run (the places chunk is unreachable offline) is not an unknown
    // place: the search proceeds and Find nearby reports the location when it resolves it.
    resolving.value = true
    const place = await resolveTypedOrigin(result.values.location)
      .catch(() => undefined)
      .finally(() => {
        resolving.value = false
      })
    if (place === null) {
      errors.location = unknownPlaceCopy(result.values.location)
      await failWith('location', 1)
      return
    }
  }
  errorSummary.value = ''
  item.value = result.values.item
  location.value = result.values.location
  emit('submit', result.values)
}
</script>

<template>
  <form class="search-form" novalidate @submit.prevent="submitSearch">
    <p v-if="errorSummary" class="form-alert" role="alert" tabindex="-1">
      {{ errorSummary }}
    </p>

    <div class="search-form__fields">
      <FormField id="item-search" label="What item do you have?" :error="errors.item">
        <template #default="{ control }">
          <input
            ref="itemInput"
            v-bind="control"
            v-model="item"
            class="form-control"
            name="item"
            type="search"
            autocomplete="off"
            enterkeyhint="next"
            dir="auto"
            placeholder="For example, laptop or bicycle…"
            @input="clearFieldError('item')"
          />
        </template>
      </FormField>

      <FormField id="location-search" label="Suburb or postcode" :error="locationFieldError">
        <template #default="{ control }">
          <input
            ref="locationInput"
            v-bind="control"
            v-model="location"
            class="form-control"
            name="location"
            type="text"
            autocomplete="address-level2"
            inputmode="text"
            enterkeyhint="search"
            dir="auto"
            placeholder="For example, Clayton 3168…"
            @input="clearFieldError('location')"
          />
        </template>
      </FormField>

      <div class="search-form__action">
        <AppButton variant="primary" type="submit" :busy="resolving">Find options</AppButton>
      </div>
    </div>
  </form>
</template>

<style scoped>
.search-form {
  width: 100%;
}

.search-form__fields {
  display: grid;
  gap: 1rem;
}

/* A field error echoes the typed place: it takes its direction from its text. */
.search-form :deep(.form-field__error) {
  unicode-bidi: plaintext;
}

.form-alert {
  margin: 0 0 1rem;
  border-left: 4px solid var(--color-danger);
  background: var(--color-danger-soft);
  padding: 0.75rem 1rem;
  color: var(--color-text);
  font-weight: 650;
}

.search-form__action {
  align-self: start;
}

.search-form__action .button {
  min-height: 3.125rem;
  width: 100%;
  padding: 0.7rem 1.25rem;
}

@media (min-width: 576px) {
  .search-form__fields {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .search-form__action {
    grid-column: 1 / -1;
  }

  .search-form__action .button {
    width: auto;
    min-width: 11rem;
  }
}

@media (min-width: 1200px) {
  .search-form__fields {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto;
    align-items: start;
  }

  .search-form__action {
    grid-column: auto;
    padding-top: 1.8rem;
  }
}
</style>
