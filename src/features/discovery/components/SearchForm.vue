<script setup>
import { nextTick, reactive, ref, watch } from 'vue'

import { validateSearchInput } from '../domain/searchValidation.js'

const props = defineProps({
  initialItem: {
    type: String,
    default: '',
  },
  initialLocation: {
    type: String,
    default: '',
  },
  compact: {
    type: Boolean,
    default: false,
  },
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

watch(
  () => props.initialItem,
  (value) => {
    item.value = value
  },
)

watch(
  () => props.initialLocation,
  (value) => {
    location.value = value
  },
)

const clearFieldError = (field) => {
  errors[field] = ''
  errorSummary.value = ''
}

const submitSearch = async () => {
  const result = validateSearchInput({ item: item.value, location: location.value })

  errors.item = result.errors.item
  errors.location = result.errors.location

  if (!result.isValid) {
    const errorCount = Object.values(result.errors).filter(Boolean).length
    errorSummary.value = `${errorCount} ${errorCount === 1 ? 'field needs' : 'fields need'} attention before you can search.`

    // Move focus to the first invalid field after Vue renders its linked error.
    // This gives keyboard and screen-reader users an immediate recovery point.
    await nextTick()
    const firstInvalidInput = errors.item ? itemInput.value : locationInput.value
    firstInvalidInput?.focus()
    return
  }

  errorSummary.value = ''
  item.value = result.values.item
  location.value = result.values.location
  emit('submit', result.values)
}
</script>

<template>
  <form
    class="search-form"
    :class="{ 'search-form--compact': compact }"
    novalidate
    @submit.prevent="submitSearch"
  >
    <p v-if="errorSummary" class="form-alert" role="alert" tabindex="-1">
      {{ errorSummary }}
    </p>

    <div class="search-form__fields">
      <div class="field-group">
        <label for="item-search">What item do you have?</label>
        <input
          id="item-search"
          ref="itemInput"
          class="form-control"
          v-model="item"
          name="item"
          type="search"
          autocomplete="off"
          enterkeyhint="next"
          placeholder="For example, laptop or bicycle…"
          :aria-invalid="Boolean(errors.item)"
          :aria-describedby="errors.item ? 'item-error' : undefined"
          @input="clearFieldError('item')"
        />
        <p v-if="errors.item" id="item-error" class="field-error">
          {{ errors.item }}
        </p>
      </div>

      <div class="field-group">
        <label for="location-search">Suburb or postcode</label>
        <input
          id="location-search"
          ref="locationInput"
          class="form-control"
          v-model="location"
          name="location"
          type="text"
          autocomplete="address-level2"
          inputmode="text"
          enterkeyhint="search"
          placeholder="For example, Clayton 3168…"
          :aria-invalid="Boolean(errors.location)"
          :aria-describedby="errors.location ? 'location-error' : undefined"
          @input="clearFieldError('location')"
        />

        <p v-if="errors.location" id="location-error" class="field-error">
          {{ errors.location }}
        </p>
      </div>

      <div class="search-form__action">
        <button class="button button--primary" type="submit">Find options</button>
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

.field-group {
  min-width: 0;
}

label {
  display: block;
  margin-bottom: 0.4rem;
  color: var(--color-heading);
  font-weight: 700;
}

.label-optional,
.field-hint {
  color: var(--color-text-muted);
  font-weight: 500;
}

.field-hint,
.field-error {
  margin: 0.35rem 0 0;
  font-size: 0.875rem;
  line-height: 1.4;
}

.field-error {
  color: var(--color-danger);
  font-weight: 650;
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
  min-height: 3rem;
  width: 100%;
  padding: 0.7rem 1.25rem;
}

@media (min-width: 768px) {
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

@media (min-width: 1100px) {
  .search-form__fields {
    grid-template-columns: minmax(14rem, 1.1fr) minmax(13rem, 1fr) auto;
    align-items: start;
  }

  .search-form__action {
    grid-column: auto;
    padding-top: 1.85rem;
  }

  .search-form--compact .field-hint {
    min-height: 2.45rem;
  }
}
</style>
