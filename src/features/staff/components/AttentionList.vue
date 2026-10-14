<script setup>
import { RouterLink } from 'vue-router'

import AppButton from '@/shared/components/AppButton.vue'

import OverviewPanel from './OverviewPanel.vue'

// The "Needs attention" card: each group of attention.js under a heading row that carries its
// count and its View all link, then up to five items as rows. A row is one link (the item's name,
// with its detail line under it) and, for a past session, a Mark completed button on the right.
// Every group starts at the same indent and every row has the same height and divider. When any
// list the groups were built from was cut at 1,000 records the heading says so.
defineProps({
  groups: { type: Array, required: true },
  truncated: { type: Boolean, default: false },
  pendingId: { type: String, default: null },
})

const emit = defineEmits(['mark-completed'])
</script>

<template>
  <OverviewPanel class="attention-list" heading-id="attention-heading">
    <template #title>
      Needs attention<template v-if="truncated">, incomplete: first 1,000 records</template>
    </template>
    <p v-if="groups.length === 0" class="attention-list__empty">
      Nothing needs attention right now.
    </p>
    <section
      v-for="group in groups"
      :key="group.id"
      class="attention-list__group"
      :aria-labelledby="`attention-${group.id}`"
    >
      <div class="attention-list__head">
        <h4 :id="`attention-${group.id}`">
          {{ group.title }} <span class="attention-list__count">({{ group.count }})</span>
        </h4>
        <RouterLink :to="group.viewAll" class="attention-list__all">
          View all <span class="visually-hidden">{{ group.title.toLowerCase() }}</span>
        </RouterLink>
      </div>
      <ul class="attention-list__items">
        <li v-for="item in group.items" :key="item.id" class="attention-list__item">
          <RouterLink :to="item.to" class="attention-list__link">
            <span class="attention-list__name" dir="auto">{{ item.name ?? item.label }}</span>
            <template v-if="item.detail"
              ><span class="visually-hidden">, </span
              ><span class="attention-list__detail">{{ item.detail }}</span></template
            >
          </RouterLink>
          <AppButton
            v-if="group.action === 'mark-completed'"
            class="attention-list__action"
            variant="secondary"
            :busy="pendingId === item.id"
            @click="emit('mark-completed', item.id)"
          >
            Mark completed<span class="visually-hidden">: {{ item.label }}</span>
          </AppButton>
        </li>
      </ul>
    </section>
  </OverviewPanel>
</template>

<style scoped>
.attention-list__empty {
  margin: 0;
  color: var(--color-text-muted);
}

.attention-list__group {
  display: grid;
  gap: 0.25rem;
}

.attention-list__group + .attention-list__group {
  margin-top: 0.5rem;
}

/* The group's name on the left and its View all on the right at every width: a long name wraps
   in its own column and View all stays on the baseline of its first line. */
.attention-list__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 1rem;
}

.attention-list__head h4 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1rem;
  font-weight: 600;
}

.attention-list__count {
  color: var(--color-text-muted);
  font-weight: 400;
}

.attention-list__all {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  font-size: 0.9375rem;
  font-weight: 600;
}

.attention-list__items {
  margin: 0;
  border-top: 1px solid var(--color-border);
  padding: 0;
  list-style: none;
}

/* Every row is as tall as a two-line item, so a row without a detail line keeps the rhythm. */
.attention-list__item {
  display: grid;
  min-height: 3.75rem;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid var(--color-border);
  padding-block: 0.375rem;
}

/* The whole name and detail are one link, at least 44px tall. */
.attention-list__link {
  display: grid;
  min-height: 2.75rem;
  align-content: center;
  text-decoration: none;
}

.attention-list__name {
  font-weight: 600;
  line-height: 1.4;
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.attention-list__detail {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  line-height: 1.4;
}

.attention-list__action {
  min-height: 2.75rem;
  padding: 0.4rem 0.875rem;
  font-size: 0.9375rem;
  white-space: nowrap;
}
</style>
