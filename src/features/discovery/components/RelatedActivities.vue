<script setup>
import { RouterLink } from 'vue-router'

import { formatDate } from '@/shared/domain/formatDate.js'

/**
 * "Repair Cafe Clayton also fixes small appliances, next session 12 Oct 2026" (spec 6.1 L864):
 * the activities whose suitable items share a category with the query, from T1's
 * `selectRelatedActivities` (at most three, each with an upcoming session). The view owns
 * `useActivityCatalogue` and passes the rows down (spec 3.4 L1413); this component imports no
 * activities composable or data module.
 */
const props = defineProps({
  /** `{ activity, nextSession, categoryLabel }` rows. */
  items: { type: Array, default: () => [] },
  status: { type: String, default: 'idle' },
})

const VERBS = Object.freeze({ repair: 'fixes', reuse: 'takes', workshop: 'covers' })
const verbFor = (activity) => VERBS[activity.activityType] ?? 'covers'
const show = () => props.status !== 'loading' && props.items.length > 0
</script>

<template>
  <section v-if="show()" class="related-activities" aria-labelledby="related-activities-heading">
    <h2 id="related-activities-heading">Related activities</h2>
    <ul>
      <li v-for="row in items" :key="row.activity.id">
        <RouterLink :to="{ name: 'activity-detail', params: { activityId: row.activity.id } }">{{
          row.activity.title
        }}</RouterLink>
        also {{ verbFor(row.activity) }} {{ row.categoryLabel }}, next session
        {{ formatDate(row.nextSession.startsAt, { dateStyle: 'medium' }) }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.related-activities {
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 0.875rem 1rem;
}

.related-activities h2 {
  margin: 0 0 0.35rem;
  color: var(--color-heading);
  font-size: 1rem;
  font-weight: 600;
}

.related-activities ul {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding-left: 1.1rem;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}
</style>
