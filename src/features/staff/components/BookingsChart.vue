<script setup>
import { computed } from 'vue'

import { toBookingsChartData } from '../domain/chartData.js'
import ChartCanvas from './ChartCanvas.vue'

// Grouped bars Booked / Waitlist / Capacity for the next eight TurnAgain sessions.
const props = defineProps({
  sessions: { type: Array, required: true },
  activitiesById: { type: Map, required: true },
  now: { type: Date, required: true },
})

const BOOKING_COLOR_TOKENS = Object.freeze([
  '--color-brand',
  '--color-warning',
  '--color-border-strong',
])

const data = computed(() => toBookingsChartData(props.sessions, props.activitiesById, props.now))
</script>

<template>
  <ChartCanvas
    :data="data"
    label="Booked places, waitlist and capacity for the next eight TurnAgain sessions"
    caption="Next eight TurnAgain sessions"
    first-column-label="Session"
    empty-message="No upcoming TurnAgain sessions to chart."
    :color-tokens="BOOKING_COLOR_TOKENS"
  />
</template>
