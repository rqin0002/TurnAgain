<script setup>
import { computed } from 'vue'

import { countServicesByAction, searchServices } from '../domain/searchServices.js'
import FilterPanel from './FilterPanel.vue'
import ServiceCard from './ServiceCard.vue'

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
  services: {
    type: Array,
    required: true,
  },
  metadata: {
    type: Object,
    default: () => ({}),
  },
  errorMessage: {
    type: String,
    default: '',
  },
  item: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    default: '',
  },
  selectedActions: {
    type: Array,
    default: () => [],
  },
  sort: {
    type: String,
    default: 'name-asc',
  },
})

defineEmits(['retry', 'update:selectedActions', 'update:sort'])

const baseResults = computed(() =>
  searchServices(props.services, {
    item: props.item,
    location: props.location,
    sort: 'name-asc',
  }),
)

// Category counts stay based on the item/location match so users can see what
// each unchecked action would reveal before changing the active filters.
const counts = computed(() => countServicesByAction(baseResults.value))

const visibleResults = computed(() =>
  searchServices(props.services, {
    item: props.item,
    location: props.location,
    actionTypes: props.selectedActions,
    sort: props.sort,
  }),
)

const resultLabel = computed(() => {
  const count = visibleResults.value.length
  return `${count} ${count === 1 ? 'option' : 'options'}`
})

const isBrowseAll = computed(() => !props.item && !props.location)
const resultAnnouncement = computed(() => {
  if (isBrowseAll.value) {
    return `${resultLabel.value} in the current catalogue`
  }
  if (!props.item) {
    return `${resultLabel.value} near ${props.location}`
  }
  return `${resultLabel.value} for ${props.item}${props.location ? ` near ${props.location}` : ''}`
})
</script>

<template>
  <section class="results-section" aria-labelledby="results-heading">
    <div v-if="status === 'loading'" class="state-panel" role="status" aria-live="polite">
      <span class="loading-indicator" aria-hidden="true"></span>
      <div>
        <h2 id="results-heading" class="section-title">Loading options</h2>
        <p>Reading the current TurnAgain service catalogue…</p>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="state-panel state-panel--error" role="alert">
      <div>
        <h2 id="results-heading" class="section-title">Options are unavailable</h2>
        <p>{{ errorMessage }}</p>
        <button class="button button--primary" type="button" @click="$emit('retry')">
          Try again
        </button>
      </div>
    </div>

    <template v-else>
      <header class="results-header">
        <div>
          <p class="eyebrow">Search results</p>
          <h2 id="results-heading" class="section-title">
            <template v-if="isBrowseAll">All current options</template>
            <template v-else-if="!item">Options near {{ location }}</template>
            <template v-else>
              Options for “{{ item }}”<span v-if="location"> near {{ location }}</span>
            </template>
          </h2>
        </div>
        <p
          class="result-count"
          data-testid="result-count"
          aria-live="polite"
          :aria-label="resultAnnouncement"
        >
          {{ resultLabel }}
        </p>
      </header>

      <p v-if="metadata.notice" class="catalogue-notice">
        <span aria-hidden="true">ⓘ</span>
        {{ metadata.notice }}
      </p>

      <div class="mobile-controls">
        <details class="mobile-filters">
          <summary>Filters</summary>
          <div class="mobile-filters__content">
            <FilterPanel
              id-prefix="mobile-action"
              :counts="counts"
              :selected-actions="selectedActions"
              @update:selected-actions="$emit('update:selectedActions', $event)"
            />
          </div>
        </details>

        <div class="sort-control">
          <label for="result-sort">Sort</label>
          <select
            id="result-sort"
            class="form-control"
            :value="sort"
            @change="$emit('update:sort', $event.target.value)"
          >
            <option value="name-asc">Name: A–Z</option>
            <option value="name-desc">Name: Z–A</option>
          </select>
        </div>
      </div>

      <div class="results-layout">
        <aside class="desktop-filters surface surface--padded" aria-label="Filter search results">
          <FilterPanel
            id-prefix="desktop-action"
            :counts="counts"
            :selected-actions="selectedActions"
            @update:selected-actions="$emit('update:selectedActions', $event)"
          />
        </aside>

        <div class="results-list-column">
          <div v-if="visibleResults.length" data-testid="result-list">
            <ServiceCard v-for="service in visibleResults" :key="service.id" :service="service" />
          </div>

          <div v-else class="state-panel" data-testid="empty-state">
            <div>
              <h3>No matching options</h3>
              <p>
                Try a broader item name, remove a location, or clear an action filter. The current
                catalogue covers selected Melbourne services only.
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.results-section {
  width: 100%;
}

.results-header {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding-bottom: 1rem;
}

h2,
h3,
p {
  margin-top: 0;
}

.result-count {
  margin: 0;
  color: var(--color-text-muted);
  font-weight: 750;
}

.catalogue-notice {
  display: flex;
  gap: 0.65rem;
  margin: 0 0 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 0.8rem 1rem;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.mobile-controls {
  display: grid;
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.mobile-filters {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-small);
  background: var(--color-surface);
}

.mobile-filters summary {
  min-height: 2.75rem;
  padding: 0.65rem 0.85rem;
  color: var(--color-heading);
  font-weight: 750;
  cursor: pointer;
}

.mobile-filters__content {
  border-top: 1px solid var(--color-border);
  padding: 0.85rem;
}

.sort-control {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
}

.sort-control label {
  color: var(--color-heading);
  font-weight: 750;
}

.sort-control select {
  padding-right: 2.25rem;
}

.results-layout {
  display: grid;
  gap: 1.25rem;
}

.desktop-filters {
  display: none;
}

.results-list-column {
  min-width: 0;
}

.state-panel--error {
  border-left: 4px solid var(--color-danger);
}

.loading-indicator {
  width: 1.5rem;
  height: 1.5rem;
  flex: 0 0 auto;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@media (min-width: 576px) {
  .results-header {
    flex-direction: row;
    align-items: end;
    justify-content: space-between;
  }

  .mobile-controls {
    grid-template-columns: minmax(0, 1fr) minmax(13rem, 0.55fr);
    align-items: start;
  }
}

@media (min-width: 992px) {
  .mobile-filters {
    display: none;
  }

  .mobile-controls {
    display: flex;
    justify-content: flex-end;
  }

  .sort-control {
    width: min(18rem, 100%);
  }

  .results-layout {
    grid-template-columns: minmax(13rem, 0.28fr) minmax(0, 1fr);
    gap: 2rem;
  }

  .desktop-filters {
    display: block;
    align-self: start;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-indicator {
    animation: none;
    border-top-color: var(--color-border);
  }
}
</style>
