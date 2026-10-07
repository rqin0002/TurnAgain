<script setup>
import { RouterLink } from 'vue-router'

import AppButton from '@/shared/components/AppButton.vue'

// The "Needs attention" panel: each group of attention.js with its count, up to
// five item links and View all; past sessions offer Mark completed in place. When any list the
// groups were built from was cut at 1,000 records the heading says so.
defineProps({
  groups: { type: Array, required: true },
  truncated: { type: Boolean, default: false },
  pendingId: { type: String, default: null },
})

const emit = defineEmits(['mark-completed'])
</script>

<template>
  <section class="attention-list" aria-labelledby="attention-heading">
    <h3 id="attention-heading">
      Needs attention<template v-if="truncated">, incomplete: first 1,000 records</template>
    </h3>
    <p v-if="groups.length === 0" class="attention-list__empty">
      Nothing needs attention right now.
    </p>
    <section
      v-for="group in groups"
      :key="group.id"
      class="attention-list__group"
      :aria-labelledby="`attention-${group.id}`"
    >
      <h4 :id="`attention-${group.id}`">
        {{ group.title }} <span class="attention-list__count">({{ group.count }})</span>
      </h4>
      <ul>
        <li v-for="item in group.items" :key="item.id">
          <RouterLink :to="item.to" dir="auto">{{ item.label }}</RouterLink>
          <AppButton
            v-if="group.action === 'mark-completed'"
            variant="text"
            :busy="pendingId === item.id"
            @click="emit('mark-completed', item.id)"
          >
            Mark completed<span class="visually-hidden">: {{ item.label }}</span>
          </AppButton>
        </li>
      </ul>
      <RouterLink :to="group.viewAll" class="attention-list__all">
        View all <span class="visually-hidden">{{ group.title.toLowerCase() }}</span>
      </RouterLink>
    </section>
  </section>
</template>

<style scoped>
.attention-list {
  display: grid;
  gap: 1rem;
}

.attention-list h3,
.attention-list h4,
.attention-list__empty {
  margin: 0;
}

.attention-list__group {
  display: grid;
  gap: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  background: var(--color-surface);
  padding: 0.85rem 1rem;
}

.attention-list__count {
  color: var(--color-text-muted);
  font-weight: 400;
}

.attention-list ul {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding-left: 1.1rem;
}

.attention-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.attention-list__all {
  justify-self: start;
  font-weight: 600;
}
</style>
