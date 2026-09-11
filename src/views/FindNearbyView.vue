<script setup>
import { computed, onBeforeMount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SearchForm from '../features/discovery/components/SearchForm.vue'
import SearchResults from '../features/discovery/components/SearchResults.vue'
import { useServiceCatalogue } from '../features/discovery/composables/useServiceCatalogue.js'
import { validateSearchInput } from '../features/discovery/domain/searchValidation.js'

const route = useRoute()
const router = useRouter()

const ACTION_TYPES = new Set(['repair', 'reuse', 'recycle'])
const SORT_OPTIONS = new Set(['name-asc', 'name-desc'])

/**
 * Vue Router allows repeated query keys to become arrays. The public search
 * contract deliberately accepts one value per field and ignores extras.
 *
 * @param {unknown} value
 * @returns {string}
 */
const firstQueryValue = (value) => {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' ? candidate : ''
}

const queryState = computed(() =>
  validateSearchInput({
    item: firstQueryValue(route.query.item),
    location: firstQueryValue(route.query.location),
  }),
)

const selectedActions = computed(() => {
  const values = Array.isArray(route.query.action) ? route.query.action : [route.query.action]

  return [
    ...new Set(values.filter((value) => typeof value === 'string' && ACTION_TYPES.has(value))),
  ]
})

const sort = computed(() => {
  const value = firstQueryValue(route.query.sort)
  return SORT_OPTIONS.has(value) ? value : 'name-asc'
})

const { status, services, errorMessage, retry } = useServiceCatalogue({
  autoLoad: queryState.value.isValid,
})

const returnInvalidQueryHome = () => {
  if (!queryState.value.isValid) {
    void router.replace({ name: 'home' })
  }
}

onBeforeMount(returnInvalidQueryHome)
watch(() => route.fullPath, returnInvalidQueryHome)

/**
 * Replaces the current results URL so one browser Back action returns to the
 * calm Home state rather than walking through every refinement.
 *
 * @param {{ item: string, location: string }} search
 */
const updateSearch = (search) =>
  router.replace({
    name: 'find-nearby',
    query: {
      ...(search.item ? { item: search.item } : {}),
      ...(search.location ? { location: search.location } : {}),
    },
  })

/**
 * Keeps result refinements shareable while allowing a new item/location search
 * to start clean. Only known action and sort values are written to the URL.
 *
 * @param {{ actions?: string[], sortValue?: string }} preferences
 */
const updatePreferences = ({ actions = selectedActions.value, sortValue = sort.value }) => {
  const safeActions = [...new Set(actions.filter((action) => ACTION_TYPES.has(action)))]
  const safeSort = SORT_OPTIONS.has(sortValue) ? sortValue : 'name-asc'

  return router.replace({
    name: 'find-nearby',
    query: {
      ...(queryState.value.values.item ? { item: queryState.value.values.item } : {}),
      ...(queryState.value.values.location ? { location: queryState.value.values.location } : {}),
      ...(safeActions.length ? { action: safeActions } : {}),
      ...(safeSort !== 'name-asc' ? { sort: safeSort } : {}),
    },
  })
}
</script>

<template>
  <div v-if="queryState.isValid">
    <section class="search-band page-section--compact" aria-labelledby="search-heading">
      <div class="shell">
        <div v-motion class="search-band__intro">
          <h1 id="search-heading" class="page-title">Find a place for your item.</h1>
        </div>

        <div class="search-band__form">
          <SearchForm
            :initial-item="queryState.values.item"
            :initial-location="queryState.values.location"
            @submit="updateSearch"
          />
        </div>
      </div>
    </section>

    <section class="results-band page-section--compact">
      <div class="shell">
        <SearchResults
          :status="status"
          :services="services"
          :error-message="errorMessage"
          :item="queryState.values.item"
          :location="queryState.values.location"
          :selected-actions="selectedActions"
          :sort="sort"
          @retry="retry"
          @update:selected-actions="updatePreferences({ actions: $event })"
          @update:sort="updatePreferences({ sortValue: $event })"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.search-band {
  padding-block: clamp(2rem, 4vw, 3.5rem) 2rem;
}

.search-band .shell {
  display: grid;
  gap: 2rem;
}

.search-band__intro .page-title {
  max-width: 21ch;
  margin: 0;
  font-size: clamp(2.25rem, 4.5vw, 4rem);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.search-band__form {
  min-width: 0;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.results-band {
  padding-block: 1rem clamp(3rem, 6vw, 5rem);
}
</style>
