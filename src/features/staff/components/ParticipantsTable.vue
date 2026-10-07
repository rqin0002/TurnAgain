<script setup>
import { computed } from 'vue'

import BookingStatusBadge from '@/features/bookings/components/BookingStatusBadge.vue'
import AppButton from '@/shared/components/AppButton.vue'
import DataTable from '@/shared/components/DataTable.vue'

import { isLiveParticipant } from '../domain/participants.js'

/**
 * The participants of one session on the shared DataTable: one named native checkbox
 * per confirmed or waitlisted row (APG checkbox pattern; a cancelled row has none), the status as
 * a badge, user-typed text with `dir="auto"`, and on a recently promoted row "Send promotion
 * email" (or "Send again" after a failure) with that row's email line, only in a build with
 * functions (`emailEnabled`, decided from configuration). The email line is focusable and
 * carries `data-email-line`, so the page can move focus to it when the button leaves.
 * The selection itself lives in the page's useParticipants; this component only reports toggles.
 */
const props = defineProps({
  columns: { type: Array, required: true },
  result: { type: Object, required: true },
  state: { type: Object, required: true },
  totalCount: { type: Number, required: true },
  truncated: { type: Boolean, default: false },
  selectedIds: { type: Array, required: true },
  emailStates: { type: Object, default: () => ({}) },
  recentIds: { type: Array, default: () => [] },
  emailEnabled: { type: Boolean, default: true },
})
const emit = defineEmits(['filter', 'clear-filters', 'sort', 'page', 'toggle', 'send-email'])

const selected = computed(() => new Set(props.selectedIds))
const recent = computed(() => new Set(props.recentIds))
const SETTLED = Object.freeze(['sent', 'test-mode'])

const emailState = (row) => props.emailStates[row.id] ?? null
const offersEmail = (row) =>
  props.emailEnabled &&
  (recent.value.has(row.id) || emailState(row) !== null) &&
  !SETTLED.includes(emailState(row)?.status)
const emailLabel = (row) =>
  emailState(row)?.status === 'failed' ? 'Send again' : 'Send promotion email'
</script>

<template>
  <DataTable
    :columns="columns"
    :result="result"
    :state="state"
    :total-count="totalCount"
    :truncated="truncated"
    caption="Participants"
    empty-message="No participants match these filters."
    @filter="(key, value) => emit('filter', key, value)"
    @clear-filters="emit('clear-filters')"
    @sort="(key, direction) => emit('sort', key, direction)"
    @page="(page) => emit('page', page)"
  >
    <template v-if="$slots.toolbar" #toolbar><slot name="toolbar" /></template>
    <template #select="{ row }">
      <input
        v-if="isLiveParticipant(row)"
        :id="`participant-select-${row.id}`"
        class="participants-table__checkbox"
        type="checkbox"
        :checked="selected.has(row.id)"
        :aria-label="`Select ${row.contactName}, ${row.reference}`"
        @change="emit('toggle', row.id, $event.target.checked)"
      />
    </template>
    <template #cell-name="{ text }"
      ><span dir="auto">{{ text }}</span></template
    >
    <template #cell-item="{ text }"
      ><span dir="auto">{{ text }}</span></template
    >
    <template #cell-status="{ row }"><BookingStatusBadge :status="row.status" /></template>
    <template #actions="{ row }">
      <div v-if="isLiveParticipant(row)" class="participants-table__email">
        <AppButton
          v-if="offersEmail(row)"
          variant="secondary"
          :busy="emailState(row)?.status === 'sending'"
          @click="emit('send-email', row.id)"
          >{{ emailLabel(row)
          }}<span class="visually-hidden"> to {{ row.contactName }}</span></AppButton
        >
        <span
          class="participants-table__email-line"
          role="status"
          tabindex="-1"
          :data-email-line="row.id"
          >{{ emailState(row)?.message ?? '' }}</span
        >
      </div>
    </template>
  </DataTable>
</template>

<style scoped>
.participants-table__checkbox {
  width: 1.25rem;
  height: 1.25rem;
}

.participants-table__email {
  display: grid;
  gap: 0.35rem;
  justify-items: start;
}
</style>
