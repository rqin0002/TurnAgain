<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import StatePanel from '@/shared/components/StatePanel.vue'

import { toBookingsChartData } from '../domain/chartData.js'

/**
 * Places on the next eight TurnAgain sessions, soonest first, as rows a person reads without a
 * tooltip: each row names the session (a link to its participants page), writes the booked places
 * against the capacity and the waitlist in words, and draws one bar for the booked share of the
 * capacity. The waitlist never adds to that bar, because a waiting member holds no place. A
 * session without a usable capacity says so instead of drawing a bar. The bar's width is a style
 * object; the bar is hidden from assistive technology, which reads the words. Each row is three
 * cells, the session, its track and its figures, laid out by the width of the list itself (its
 * own container, not the window): stacked when narrow, the figures beside the name with the track
 * under both when medium, three aligned columns when wide. An empty track is still drawn, so a
 * session with no bookings reads as zero, never as a missing bar.
 */
const props = defineProps({
  sessions: { type: Array, required: true },
  activitiesById: { type: Map, required: true },
  now: { type: Date, required: true },
})

const data = computed(() => toBookingsChartData(props.sessions, props.activitiesById, props.now))
const number = (value) => new Intl.NumberFormat('en-AU').format(value)

/** Which sessions the rows are: all of them, the only one, or the soonest of more. */
const which = (shown, total) => {
  if (shown < total)
    return `The next ${number(shown)} of ${number(total)} upcoming TurnAgain sessions, soonest first.`
  if (total === 1) return 'The one upcoming TurnAgain session.'
  return `All ${number(total)} upcoming TurnAgain sessions, soonest first.`
}
const scope = computed(
  () =>
    `${which(data.value.rows.length, data.value.total)} Bars show booked places against capacity; the waitlist is listed separately and never fills a bar.`,
)

const bookedText = (row) =>
  row.bookedPercent === null
    ? `${number(row.booked)} booked, capacity not set`
    : `${number(row.booked)} of ${number(row.capacity)} places booked`
const waitlistText = (row) =>
  row.waitlist > 0 ? `${number(row.waitlist)} on the waitlist` : 'No waitlist'
</script>

<template>
  <StatePanel
    v-if="data.rows.length === 0"
    variant="empty"
    message="No upcoming TurnAgain sessions."
  />
  <div v-else class="capacity">
    <p class="capacity__scope">{{ scope }}</p>
    <ol class="capacity__rows">
      <li v-for="row in data.rows" :key="row.id" class="capacity__row">
        <RouterLink :to="`/staff/sessions/${row.id}`" class="capacity__session">
          <span class="capacity__title" dir="auto">{{ row.title }}</span
          ><span class="visually-hidden">, </span>
          <span class="capacity__when">{{ row.when }}</span>
        </RouterLink>
        <span v-if="row.bookedPercent !== null" class="capacity__track" aria-hidden="true">
          <span class="capacity__fill" :style="{ width: `${row.bookedPercent}%` }"></span>
        </span>
        <p class="capacity__numbers">
          <span class="capacity__booked">{{ bookedText(row) }}</span>
          <span class="capacity__waitlist">{{ waitlistText(row) }}</span>
        </p>
      </li>
    </ol>
  </div>
</template>

<style scoped>
/* The rows lay themselves out by the list's own width, which the Overview's grid decides. */
.capacity {
  display: grid;
  gap: 0.75rem;
  container-type: inline-size;
}

.capacity__scope {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.capacity__rows {
  display: grid;
  margin: 0;
  border-top: 1px solid var(--color-border);
  padding: 0;
  list-style: none;
}

/* Narrow: the session, then its track, then its figures, one under the other. */
.capacity__row {
  display: grid;
  grid-template-areas:
    'session'
    'track'
    'numbers';
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 0.375rem 1rem;
  border-bottom: 1px solid var(--color-border);
  padding-block: 0.5rem;
}

/* The whole name and time are one link, at least 44px tall. */
.capacity__session {
  display: grid;
  min-height: 2.75rem;
  grid-area: session;
  align-content: center;
  text-decoration: none;
}

.capacity__title {
  font-weight: 600;
  line-height: 1.4;
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.capacity__when {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  line-height: 1.4;
}

/* A neutral track drawn in both themes; the fill is the booked share on top of it. */
.capacity__track {
  display: block;
  height: 0.5rem;
  grid-area: track;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border-strong) 40%, transparent);
}

.capacity__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-brand);
}

.capacity__numbers {
  display: flex;
  flex-wrap: wrap;
  grid-area: numbers;
  justify-content: space-between;
  gap: 0 1rem;
  margin: 0;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.capacity__booked {
  color: var(--color-heading);
  font-weight: 600;
}

.capacity__waitlist {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

/* Medium: the figures beside the name, right-aligned, and the track across the row under both. */
@container (min-width: 26rem) {
  .capacity__row {
    grid-template-areas:
      'session numbers'
      'track track';
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .capacity__numbers {
    display: grid;
    justify-items: end;
    text-align: end;
  }
}

/* Wide: three aligned columns, the session, its track and its figures. */
@container (min-width: 36rem) {
  .capacity__row {
    grid-template-areas: 'session track numbers';
    grid-template-columns: minmax(0, 1fr) minmax(6rem, 10rem) 10.5rem;
    column-gap: 1.25rem;
  }

  .capacity__numbers {
    justify-items: start;
    text-align: start;
  }
}

@media (forced-colors: active) {
  .capacity__track {
    border: 1px solid CanvasText;
  }

  .capacity__fill {
    background: Highlight;
  }
}
</style>
