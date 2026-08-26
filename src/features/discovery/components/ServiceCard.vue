<script setup>
import { RouterLink } from 'vue-router'

import { formatActionType, formatCheckedDate } from '../domain/servicePresentation.js'

defineProps({
  service: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <article class="service-card">
    <div>
      <ul class="tag-list" aria-label="Available actions">
        <li v-for="action in service.actionTypes" :key="action" class="tag">
          {{ formatActionType(action) }}
        </li>
      </ul>

      <h3>
        <RouterLink :to="{ name: 'service-detail', params: { serviceId: service.id } }">
          {{ service.name }}
        </RouterLink>
      </h3>

      <p class="service-card__location">
        <span v-if="service.address">{{ service.address }}, </span>{{ service.suburb }}
        {{ service.postcode }}
      </p>
      <p class="service-card__summary">{{ service.summary }}</p>

      <p class="service-card__items">
        <strong>Listed items:</strong>
        {{ service.acceptedItems.slice(0, 5).join(', ') }}
      </p>
    </div>

    <div class="service-card__source">
      <p>
        Source:
        <a :href="service.source.url" target="_blank" rel="noopener noreferrer">
          {{ service.source.organisation }}
        </a>
      </p>
      <p>Checked {{ formatCheckedDate(service.source.checkedAt) }}</p>
      <RouterLink
        class="button button--secondary"
        :to="{ name: 'service-detail', params: { serviceId: service.id } }"
      >
        View details
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.service-card {
  display: grid;
  gap: 1rem;
  border-top: 1px solid var(--color-border);
  padding: 1.25rem 0;
}

.service-card:first-child {
  border-top: 0;
}

h3 {
  margin: 0.55rem 0 0;
  font-size: clamp(1.15rem, 2vw, 1.35rem);
  line-height: 1.25;
}

h3 a {
  color: var(--color-heading);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.service-card__location,
.service-card__summary,
.service-card__items,
.service-card__source p {
  margin: 0.5rem 0 0;
}

.service-card__location,
.service-card__source {
  color: var(--color-text-muted);
}

.service-card__items {
  font-size: 0.925rem;
}

.service-card__source {
  font-size: 0.875rem;
}

.service-card__source .button {
  margin-top: 0.85rem;
}

@media (min-width: 768px) {
  .service-card {
    grid-template-columns: minmax(0, 1fr) minmax(11rem, 0.3fr);
  }

  .service-card__source {
    text-align: right;
  }
}
</style>
