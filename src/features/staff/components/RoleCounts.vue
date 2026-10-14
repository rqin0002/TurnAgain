<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/shared/components/AppButton.vue'

import OverviewPanel from './OverviewPanel.vue'

// Accounts by role, for administrators: the member, staff, admin and total counts from three
// count queries over every account (active or disabled, so these are not active accounts), and
// links to the pages that manage them in the card's footer. The four tiles fill the card's width:
// two by two in a narrow card, one row of four in a wide one. Staff see that the figures are for
// administrators only; the view reads no count for them.
const props = defineProps({
  counts: { type: Object, default: null },
  status: { type: String, required: true },
  isAdmin: { type: Boolean, required: true },
})

const emit = defineEmits(['retry'])

// Try again leaves with the error block once the view loads again, so focus moves first to the
// mounted status line that announces the new load, never to <body>.
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
// Where each kind of account is managed: members on their own page, staff and admins on Team.
const ACCOUNT_PAGES = Object.freeze([
  Object.freeze({ to: '/staff/members', text: 'Manage members' }),
  Object.freeze({ to: '/staff/team', text: 'Manage the team' }),
])
const number = (value) => new Intl.NumberFormat('en-AU').format(value)

// The one line the status region reads: a loading message, the failure, or nothing once the
// tiles are on screen.
const statusText = computed(() => {
  if (props.status === 'loading' || props.status === 'idle') return 'Loading the role counts…'
  if (props.status === 'error') return 'The role counts could not be loaded.'
  return ''
})
</script>

<template>
  <OverviewPanel class="role-counts" heading-id="role-counts-heading">
    <template #title>Accounts by role</template>
    <template #lead>
      <template v-if="isAdmin">Every account with each role, active or disabled.</template>
      <template v-else>Available to administrators</template>
    </template>
    <div v-if="isAdmin" class="role-counts__figures">
      <!-- Mounted for administrators; only its text changes, so the loading message and the
           failure are both announced by the one live region assistive technology already watches.
           While it is empty it takes no space. -->
      <p ref="statusLine" class="role-counts__status" role="status" tabindex="-1">
        {{ statusText }}
      </p>
      <dl v-if="status === 'ready' && counts" class="role-counts__tiles">
        <div v-for="tile in TILES" :key="tile.key" class="role-counts__tile">
          <dt>{{ tile.label }}</dt>
          <dd>{{ number(counts[tile.key]) }}</dd>
        </div>
      </dl>
      <div v-if="status === 'error'" class="role-counts__error">
        <AppButton variant="secondary" @click="retry">Try again</AppButton>
      </div>
    </div>
    <template v-if="isAdmin" #footer>
      <ul class="role-counts__links">
        <li v-for="page in ACCOUNT_PAGES" :key="page.to">
          <RouterLink :to="page.to">{{ page.text }}</RouterLink>
        </li>
      </ul>
    </template>
  </OverviewPanel>
</template>

<style scoped>
/* The tiles' width decides their columns, so they fill whichever column the card sits in. */
.role-counts__figures {
  container-type: inline-size;
}

.role-counts__status {
  margin: 0;
  color: var(--color-text-muted);
}

.role-counts__status:not(:empty) {
  margin-block-end: 0.75rem;
}

.role-counts__tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
}

.role-counts__tile {
  display: grid;
  align-content: start;
  gap: 0.25rem;
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 0.75rem 1rem;
}

.role-counts__tile dt {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.role-counts__tile dd {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.5rem;
  font-weight: 650;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.role-counts__error {
  display: grid;
  justify-items: start;
}

.role-counts__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.role-counts__links a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  font-size: 0.9375rem;
  font-weight: 600;
}

@container (min-width: 30rem) {
  .role-counts__tiles {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (forced-colors: active) {
  .role-counts__tile {
    border: 1px solid CanvasText;
  }
}
</style>
