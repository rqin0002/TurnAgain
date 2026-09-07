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
  <article class="activity-card surface surface--raised">
    <div class="activity-card__body">
      <p class="eyebrow">{{ formatActivityType(activity.activityType) }}</p>
      <h2>
        <RouterLink :to="{ name: 'activity-detail', params: { activityId: activity.id } }">
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
        class="button button--secondary activity-card__action"
        :to="{ name: 'activity-detail', params: { activityId: activity.id } }"
      >
        View activity details
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.activity-card {
  display: grid;
  min-width: 0;
  overflow: hidden;
}

.activity-card__body,
.activity-card__session {
  min-width: 0;
  padding: clamp(1rem, 3vw, 1.5rem);
}

.activity-card h2 {
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(1.25rem, 3vw, 1.55rem);
  line-height: 1.2;
}

.activity-card__summary {
  margin: 0.75rem 0 1rem;
  color: var(--color-text-muted);
}

.activity-card__session {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.activity-card__session p {
  margin: 0.3rem 0 0;
}

.activity-card__session-label,
.activity-card__date {
  color: var(--color-heading);
  font-weight: 800;
}

.activity-card__capacity,
.activity-card__more {
  color: var(--color-text-muted);
}

.activity-card__action {
  width: 100%;
  margin-top: 1rem;
}

@media (min-width: 768px) {
  .activity-card {
    grid-template-columns: minmax(0, 1fr) minmax(17rem, 0.42fr);
  }

  .activity-card__session {
    border-top: 0;
    border-left: 1px solid var(--color-border);
  }
}
</style>
