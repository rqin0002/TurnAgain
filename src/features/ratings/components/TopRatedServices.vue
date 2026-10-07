<script setup>
import { computed } from 'vue'

import ServiceCard from '@/features/discovery/components/ServiceCard.vue'
import { formatRelativeTime } from '@/shared/domain/relativeTime.js'

import { rankRatedServices } from '../domain/rankServices.js'

/**
 * Top five rated services, props-driven: the view composes the
 * catalogue and the summaries and passes them down; this component only ranks and renders.
 * `status` is the view's combined state: idle (nothing requested yet), loading, ready, error.
 */
const props = defineProps({
  services: { type: Array, default: () => [] },
  summariesById: { type: Object, default: () => ({}) },
  status: { type: String, default: 'idle' },
  truncated: { type: Boolean, default: false },
  failedIds: { type: Array, default: () => [] },
  errorMessage: { type: String, default: '' },
  freshness: { type: String, default: 'none' },
  savedAt: { type: Date, default: null },
})
const emit = defineEmits(['load'])

const isBusy = computed(() => props.status === 'loading')
const requested = computed(() => props.status !== 'idle')
const top = computed(() => rankRatedServices(props.services, props.summariesById))
// Coverage is complete only when the catalogue was whole and every id has a summary: an id the
// server confirmed missing or invalid stays in `failedIds` (the composable's incomplete set).
// A saved copy is never called the current catalogue; its line says when it was saved.
const complete = computed(
  () => !props.truncated && !props.failedIds.length && props.freshness !== 'cached',
)
</script>

<template>
  <section class="top-rated" aria-labelledby="top-rated-heading" :aria-busy="isBusy">
    <h2 id="top-rated-heading">Find a service to try</h2>
    <p>Compare services using their public rating summaries.</p>
    <button type="button" class="button button--secondary" :disabled="isBusy" @click="emit('load')">
      {{
        isBusy
          ? 'Loading top rated services…'
          : requested
            ? 'Refresh top rated services'
            : 'Show top rated services'
      }}
    </button>
    <p v-if="status === 'error'" role="alert">
      {{ errorMessage }} Use the refresh button to retry.
    </p>
    <template v-if="status === 'ready'">
      <h3>
        {{
          complete
            ? 'Top rated in the current published catalogue'
            : 'Top rated among loaded services'
        }}
      </h3>
      <p v-if="freshness === 'cached' && savedAt" class="catalogue-freshness" role="status">
        Showing results saved {{ formatRelativeTime(savedAt) }}
      </p>
      <p v-if="truncated" role="status">Results incomplete: showing the first 1,000 records.</p>
      <p v-if="failedIds.length" role="status">
        {{ failedIds.length }} rating summaries could not be retrieved or validated. They are not
        included in this ranking.
      </p>
      <p v-if="!top.length" role="status">
        {{
          failedIds.length
            ? 'No rated services are available among the successfully loaded summaries.'
            : 'No services in the loaded catalogue have ratings yet.'
        }}
      </p>
      <p v-else>
        {{ top.length }} {{ top.length === 1 ? 'rated service' : 'rated services' }} shown. Scores
        are member ratings, not a guarantee of suitability.
      </p>
      <div>
        <ServiceCard
          v-for="service in top"
          :key="service.id"
          :service="service"
          :show-rating="true"
          :rating-summary="summariesById[service.id]"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.top-rated {
  border-top: 1px solid var(--color-border);
  margin-top: 2rem;
  padding-top: 1.5rem;
}
.top-rated h2 {
  font-size: 1.25rem;
  margin: 0 0 0.5rem;
}
.top-rated h3 {
  margin-top: 1.5rem;
  font-size: 1.125rem;
}
.top-rated > p {
  color: var(--color-text-muted);
}
.top-rated > p[role='alert'] {
  color: var(--color-danger);
}
</style>
