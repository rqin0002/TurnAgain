<script setup>
import { computed } from 'vue'

import { toRatingsChartData } from '../domain/chartData.js'
import ChartCanvas from './ChartCanvas.vue'

// Stacked bars of the five-bucket histogram for up to eight rated services. The
// summaries arrive as a prop: the view calls the ratings composable, a staff component never does.
const props = defineProps({
  services: { type: Array, required: true },
  summariesById: { type: Object, required: true },
})

const RATING_COLOR_TOKENS = Object.freeze([
  '--color-danger',
  '--color-warning',
  '--color-text-muted',
  '--color-success',
  '--color-brand',
])

const data = computed(() => toRatingsChartData(props.services, props.summariesById))
</script>

<template>
  <ChartCanvas
    :data="data"
    label="Rating distribution for up to eight rated services"
    caption="Ratings by service"
    first-column-label="Service"
    empty-message="No rated services to chart yet."
    :color-tokens="RATING_COLOR_TOKENS"
    stacked
  />
</template>
