<script setup>
import { computed } from 'vue'

import { toRatingsChartData } from '../domain/chartData.js'
import ChartCanvas from './ChartCanvas.vue'

// Horizontal bars for up to eight published services with the most ratings: each bar is one
// service's ratings split by star level, so its length is that service's number of ratings, and
// that number is written at the bar's end and under the name in the table. The legend reads
// "Stars" and the five star levels. The summaries arrive as a prop: the view calls the ratings
// composable, a staff component never does.
const props = defineProps({
  services: { type: Array, required: true },
  summariesById: { type: Object, required: true },
})

// One star to five stars, in the legend's and the table's order.
const RATING_COLOR_TOKENS = Object.freeze([
  '--color-danger',
  '--color-warning',
  '--color-text-muted',
  '--color-success',
  '--color-brand',
])
const STAR_KEYS = Object.freeze(['1', '2', '3', '4', '5'])

const number = (value) => new Intl.NumberFormat('en-AU').format(value)
const data = computed(() => toRatingsChartData(props.services, props.summariesById))
const counts = computed(() =>
  data.value.rows.map(
    (row) => `${number(row.ratingCount)} ${row.ratingCount === 1 ? 'rating' : 'ratings'}`,
  ),
)
</script>

<template>
  <ChartCanvas
    :data="data"
    label="Ratings by star level for up to eight published services with the most ratings"
    caption="Ratings by star level, most-rated services first"
    first-column-label="Service"
    empty-message="No rated services to chart yet."
    :color-tokens="RATING_COLOR_TOKENS"
    :row-notes="counts"
    legend-title="Stars"
    :legend-labels="STAR_KEYS"
    stacked
  />
</template>
