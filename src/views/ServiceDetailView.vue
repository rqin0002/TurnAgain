<script setup>
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { useBackNavigation } from '../composables/useBackNavigation.js'
import { useServiceCatalogue } from '../features/discovery/composables/useServiceCatalogue.js'
import {
  formatActionType,
  formatCheckedDate,
} from '../features/discovery/domain/servicePresentation.js'
import ServiceRatings from '../features/ratings/components/ServiceRatings.vue'

const route = useRoute()
const { goBack } = useBackNavigation({ name: 'find-nearby' })
const { status, services, metadata, errorMessage, retry } = useServiceCatalogue()

const requestedId = computed(() => {
  const value = Array.isArray(route.params.serviceId)
    ? route.params.serviceId[0]
    : route.params.serviceId
  return typeof value === 'string' ? value : ''
})

const service = computed(() =>
  services.value.find((candidate) => candidate.id === requestedId.value),
)

// The router supplies a useful generic title immediately; once catalogue data
// arrives, the specific service name gives browser history a clearer label.
watch(
  service,
  (value) => {
    if (value) {
      document.title = `${value.name} | TurnAgain`
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="page-section">
    <div class="shell detail-page">
      <button class="text-button detail-page__back" type="button" @click="goBack">← Back</button>

      <div v-if="status === 'loading'" class="state-panel" role="status" aria-live="polite">
        <div>
          <h1>Loading service details</h1>
          <p>Reading the current catalogue…</p>
        </div>
      </div>

      <div v-else-if="status === 'error'" class="state-panel" role="alert">
        <div>
          <h1>Service details are unavailable</h1>
          <p>{{ errorMessage }}</p>
          <button class="button button--primary" type="button" @click="retry">Try again</button>
        </div>
      </div>

      <article v-else-if="service" class="detail-card surface surface--raised">
        <header class="detail-card__header">
          <ul class="tag-list" aria-label="Available actions">
            <li v-for="action in service.actionTypes" :key="action" class="tag">
              {{ formatActionType(action) }}
            </li>
          </ul>
          <h1>{{ service.name }}</h1>
          <p class="detail-card__address">
            <span v-if="service.address">{{ service.address }}, </span>{{ service.suburb }}
            {{ service.postcode }}
          </p>
        </header>

        <div class="detail-card__body">
          <div>
            <h2>What this option covers</h2>
            <p>{{ service.summary }}</p>

            <h2>Items listed in the catalogue</h2>
            <ul class="accepted-items">
              <li v-for="item in service.acceptedItems" :key="item" data-testid="accepted-item">
                {{ item }}
              </li>
            </ul>
          </div>

          <aside class="source-panel" aria-labelledby="source-heading">
            <h2 id="source-heading">Check the source</h2>
            <p v-if="metadata.notice">{{ metadata.notice }}</p>
            <p>
              Source:
              <a :href="service.source.url" target="_blank" rel="noopener noreferrer">
                {{ service.source.organisation }}
              </a>
            </p>
            <p>Catalogue checked {{ formatCheckedDate(service.source.checkedAt) }}</p>
          </aside>
        </div>

        <ServiceRatings :service-id="service.id" />
      </article>

      <div v-else class="state-panel" data-testid="service-not-found">
        <div>
          <h1>We could not find that service.</h1>
          <p>It may have been removed from the current catalogue or the link may be incomplete.</p>
          <RouterLink class="button button--primary" to="/">Start a new search</RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.detail-page {
  max-width: 68rem;
}

.detail-page__back {
  margin-bottom: 1rem;
}

.state-panel h1,
.detail-card h1 {
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(1.8rem, 5vw, 3rem);
  line-height: 1.08;
}

.detail-card {
  overflow: hidden;
}

.detail-card__header,
.detail-card__body {
  padding: clamp(1.1rem, 4vw, 2rem);
}

.detail-card__header {
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.detail-card__header h1 {
  margin-top: 0.75rem;
}

.detail-card__address {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
}

.detail-card__body {
  display: grid;
  gap: 1.5rem;
}

.detail-card h2 {
  margin: 0 0 0.5rem;
  color: var(--color-heading);
  font-size: 1.2rem;
}

.detail-card h2:not(:first-child) {
  margin-top: 1.75rem;
}

.accepted-items {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding-left: 1.25rem;
}

.source-panel {
  align-self: start;
  border-left: 4px solid var(--color-brand);
  background: var(--color-brand-soft);
  padding: 1rem;
}

.source-panel p:last-child {
  margin-bottom: 0;
}

@media (min-width: 768px) {
  .detail-card__body {
    grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.42fr);
    gap: 2rem;
  }
}
</style>
