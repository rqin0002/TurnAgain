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
        <RouterLink
          class="title-link"
          :to="{ name: 'service-detail', params: { serviceId: service.id } }"
        >
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
        class="inline-action service-card__action"
        :to="{ name: 'service-detail', params: { serviceId: service.id } }"
      >
        View details <span aria-hidden="true">→</span>
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.service-card {
  display: grid;
  min-width: 0;
  gap: 1.25rem;
  border-top: 1px solid var(--color-border);
  padding-block: 1.75rem;
}

.service-card:first-child {
  padding-top: 0;
  border-top: 0;
}

h3 {
  margin: 0.75rem 0 0;
  color: var(--color-heading);
  font-size: clamp(1.25rem, 2.2vw, 1.625rem);
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.service-card__location {
  margin: 0.625rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.service-card__summary {
  max-width: 64ch;
  margin: 0.875rem 0 0;
  line-height: 1.65;
}

.service-card__items {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.service-card__items strong {
  color: var(--color-text);
  font-weight: 600;
}

.service-card__source {
  min-width: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.service-card__source p {
  margin: 0 0 0.35rem;
}

.service-card__action {
  margin-top: 0.75rem;
}

@media (min-width: 1200px) {
  .service-card {
    grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.28fr);
    gap: 2rem;
    padding-block: 2rem;
  }

  .service-card__source {
    padding-top: 0.2rem;
    text-align: right;
  }
}
</style>
