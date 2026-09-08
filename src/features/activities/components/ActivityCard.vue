<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import {
  formatActivityType,
  formatSessionAvailability,
  formatSessionDate,
  formatSessionStatus,
  formatSessionTime,
} from '../domain/activityCatalogue.js'

const props = defineProps({
  activity: {
    type: Object,
    required: true,
  },
  nextSession: {
    type: Object,
    default: null,
  },
  sessionCount: {
    type: Number,
    default: 0,
  },
})

const availabilityLabel = computed(() => formatSessionAvailability(props.nextSession))
</script>

<template>
  <article class="activity-card">
    <div class="activity-card__body">
      <p class="activity-card__type">{{ formatActivityType(activity.activityType) }}</p>
      <h2>
        <RouterLink
          class="title-link"
          :to="{ name: 'activity-detail', params: { activityId: activity.id } }"
        >
          {{ activity.title }}
        </RouterLink>
      </h2>
      <p class="activity-card__summary">{{ activity.summary }}</p>

      <ul class="tag-list" :aria-label="`Suitable items for ${activity.title}`">
        <li v-for="item in activity.suitableItems.slice(0, 5)" :key="item" class="tag">
          {{ item }}
        </li>
      </ul>
    </div>

    <div class="activity-card__session">
      <template v-if="nextSession">
        <p class="activity-card__session-label">Next session</p>
        <p class="activity-card__date">{{ formatSessionDate(nextSession.startsAt) }}</p>
        <p>{{ formatSessionTime(nextSession.startsAt, nextSession.endsAt) }}</p>
        <p>{{ nextSession.suburb }} {{ nextSession.postcode }}</p>
        <p class="activity-card__capacity">
          {{ formatSessionStatus(nextSession.status) }}
          <span v-if="availabilityLabel"> · {{ availabilityLabel }}</span>
        </p>
        <p v-if="sessionCount > 1" class="activity-card__more">
          {{ sessionCount - 1 }} more future {{ sessionCount - 1 === 1 ? 'session' : 'sessions' }}
        </p>
      </template>
      <template v-else>
        <p class="activity-card__session-label">Sessions</p>
        <p>No future session is currently published.</p>
        <p>Check the provider source for the latest schedule.</p>
      </template>

      <RouterLink
        class="inline-action activity-card__action"
        :to="{ name: 'activity-detail', params: { activityId: activity.id } }"
      >
        View activity details <span aria-hidden="true">→</span>
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.activity-card {
  display: grid;
  min-width: 0;
  gap: 1.5rem;
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: clamp(1.25rem, 3vw, 2rem);
}

.activity-card__body,
.activity-card__session {
  min-width: 0;
}

.activity-card__type {
  margin: 0 0 0.75rem;
  color: var(--color-brand);
  font-size: 0.875rem;
  font-weight: 600;
}

.activity-card h2 {
  max-width: 32ch;
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(1.375rem, 2.5vw, 1.875rem);
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1.15;
}

.activity-card__summary {
  max-width: 64ch;
  margin: 0.875rem 0 1.25rem;
  color: var(--color-text-muted);
  line-height: 1.65;
}

.activity-card__session {
  border-top: 1px solid var(--color-border);
  padding-top: 1.25rem;
}

.activity-card__session p {
  margin: 0.3rem 0 0;
}

.activity-card__session-label {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.activity-card__date {
  color: var(--color-heading);
  font-size: 1.1875rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.activity-card__capacity,
.activity-card__more {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.activity-card__action {
  margin-top: 0.75rem;
}

@media (min-width: 768px) {
  .activity-card {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.42fr);
    gap: clamp(2rem, 4vw, 3.5rem);
  }

  .activity-card__session {
    border-top: 0;
    border-left: 1px solid var(--color-border);
    padding-top: 0;
    padding-left: clamp(1.5rem, 3vw, 2rem);
  }
}
</style>
