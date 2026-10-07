<script setup>
import { ref } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'

// Accounts by role (spec 8.6 L1005, E5): administrators see the member, staff, admin and total
// counts from three count queries; staff see that the figures are for administrators only.
defineProps({
  counts: { type: Object, default: null },
  status: { type: String, required: true },
  isAdmin: { type: Boolean, required: true },
})

const emit = defineEmits(['retry'])

// Try again leaves with the error block once the view loads again, so focus moves first to the
// mounted status line that announces the new load (M6-D22), never to <body>.
const statusLine = ref(null)
const retry = () => {
  statusLine.value?.focus()
  emit('retry')
}

const TILES = Object.freeze([
  Object.freeze({ key: 'member', label: 'Members' }),
  Object.freeze({ key: 'staff', label: 'Staff' }),
  Object.freeze({ key: 'admin', label: 'Admins' }),
  Object.freeze({ key: 'total', label: 'Total' }),
])
const number = (value) => new Intl.NumberFormat('en-AU').format(value)
</script>

<template>
  <section class="role-counts" aria-labelledby="role-counts-heading">
    <h3 id="role-counts-heading">Accounts by role</h3>
    <p v-if="!isAdmin" class="role-counts__note">Available to administrators</p>
    <template v-else>
      <!-- Mounted for administrators; only its text changes (M6-D22). -->
      <p ref="statusLine" class="role-counts__note" role="status" tabindex="-1">
        {{ status === 'loading' || status === 'idle' ? 'Loading the role counts…' : '' }}
      </p>
      <dl v-if="status === 'ready' && counts" class="role-counts__tiles">
        <div v-for="tile in TILES" :key="tile.key" class="role-counts__tile">
          <dt>{{ tile.label }}</dt>
          <dd>{{ number(counts[tile.key]) }}</dd>
        </div>
      </dl>
      <div v-if="status === 'error'" class="role-counts__error">
        <p role="alert">The role counts could not be loaded.</p>
        <AppButton variant="secondary" @click="retry">Try again</AppButton>
      </div>
    </template>
  </section>
</template>

<style scoped>
.role-counts {
  display: grid;
  gap: 0.75rem;
}

.role-counts h3,
.role-counts__note,
.role-counts__error p {
  margin: 0;
}

.role-counts__note {
  color: var(--color-text-muted);
}

.role-counts__tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
}

.role-counts__tile {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  background: var(--color-surface);
  padding: 0.75rem 1rem;
}

.role-counts__tile dt {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.role-counts__tile dd {
  margin: 0.25rem 0 0;
  color: var(--color-heading);
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.role-counts__error {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
}

@media (min-width: 768px) {
  .role-counts__tiles {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
