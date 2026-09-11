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
const { status, services, errorMessage, retry } = useServiceCatalogue()

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
      <button class="text-button back-link" type="button" @click="goBack">← Back</button>

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

      <article v-else-if="service" class="detail-card">
        <header v-motion="service.id" class="detail-card__header">
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
            <p>
              Source:
              <a :href="service.source.url" target="_blank" rel="noopener noreferrer">
                {{ service.source.organisation }}
              </a>
            </p>
            <p>Catalogue checked {{ formatCheckedDate(service.source.checkedAt) }}</p>
          </aside>
        </div>

        <ServiceRatings :service-id="service.id" :source-url="service.source.url" />
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
  max-width: 72rem;
}

.state-panel h1,
.detail-card h1 {
  max-width: 22ch;
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(2.25rem, 5vw, 4rem);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.detail-card {
  min-width: 0;
}

.detail-card__header {
  padding-bottom: clamp(1.75rem, 4vw, 3rem);
}

.detail-card__header h1 {
  margin-top: 1.25rem;
}

.detail-card__address {
  margin: 1.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 1.125rem;
}

.detail-card__body {
  display: grid;
  gap: 2rem;
  padding-block: 1rem clamp(2rem, 4vw, 3rem);
}

.detail-card h2 {
  margin: 0 0 0.875rem;
  color: var(--color-heading);
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.detail-card h2:not(:first-child) {
  margin-top: 2rem;
}

.detail-card__body > div > p {
  max-width: 62ch;
  margin: 0;
  line-height: 1.7;
}

.accepted-items {
  display: grid;
  gap: 0.625rem;
  margin: 0;
  padding-left: 1.1rem;
}

.accepted-items li::marker {
  color: var(--color-text-muted);
}

.source-panel h2 {
  font-size: 1.25rem;
}

@media (min-width: 768px) {
  .detail-card__body {
    grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.4fr);
    gap: clamp(3rem, 6vw, 5rem);
  }
}
</style>
