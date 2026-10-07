<script setup>
import { computed, defineAsyncComponent, nextTick, ref, shallowRef } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'

import { loadSessionCalendar } from './sessionCalendarChunk.js'

// Mounts the lazy SessionCalendar for both pages. The status line is mounted
// before its text changes and says when the chunk is loading or failed; a failed first load
// (FullCalendar is not yet cached and the connection dropped) offers a fresh load or the List
// view, which shows the same sessions. Nothing is preloaded, so a visitor who never opens the
// calendar never downloads it.
defineProps({
  events: { type: Array, required: true },
  initialDate: { type: String, required: true },
  skipTarget: { type: String, required: true },
  headingLevel: { type: Number, default: 2 },
})

const emit = defineEmits(['select-session', 'show-list'])

const LOADING_MESSAGE = 'Loading the calendar…'
const FAILED_MESSAGE =
  "The calendar couldn't load. It needs a connection the first time it opens; the list shows the same sessions."

const state = ref('loading')
const statusText = computed(() => {
  if (state.value === 'loading') return LOADING_MESSAGE
  if (state.value === 'failed') return FAILED_MESSAGE
  return ''
})

// Both outcomes resolve to a component and the loader never rejects, so Vue mounts no broken
// component and reports nothing: the failure is this page's to say. A fresh definition per try
// makes Vue load again instead of replaying the cached failure.
const create = () =>
  defineAsyncComponent(() =>
    loadSessionCalendar().then(
      (component) => {
        state.value = 'ready'
        return component
      },
      () => {
        state.value = 'failed'
        return { render: () => null }
      },
    ),
  )
const calendar = shallowRef(create())

const statusLine = ref(null)
// "Try again" unmounts with the failed state, so focus moves to the status line it updates.
const tryAgain = async () => {
  state.value = 'loading'
  calendar.value = create()
  await nextTick()
  statusLine.value?.focus()
}
</script>

<template>
  <div class="session-calendar-loader">
    <p ref="statusLine" class="session-calendar-loader__status" role="status" tabindex="-1">
      {{ statusText }}
    </p>
    <div v-if="state === 'failed'" class="session-calendar-loader__actions">
      <AppButton variant="primary" @click="tryAgain">Try again</AppButton>
      <AppButton variant="secondary" @click="emit('show-list')">Show the list</AppButton>
    </div>
    <component
      :is="calendar"
      v-else
      :events
      :initial-date
      :skip-target
      :heading-level
      @select-session="emit('select-session', $event)"
    />
  </div>
</template>

<style scoped>
.session-calendar-loader {
  display: grid;
  gap: 1rem;
}

.session-calendar-loader__status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.session-calendar-loader__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
</style>
