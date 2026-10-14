<script setup>
import { computed } from 'vue'
import { melbourneClock } from '@shared/melbourneTime.js'

import { WEEKDAYS } from '../domain/openingHours.js'
import {
  DAY_LABELS,
  describeHoursToday,
  formatOpenRange,
  readServiceHours,
} from '../domain/weeklyHours.js'

/**
 * A service's opening hours on Service Detail, read from its stored lines (weeklyHours.js
 * `readServiceHours`): today's state at the Melbourne minute of `now` ("Open now · closes 6pm",
 * "Closed · opens Sat 10am", "Hours not checked"), the week as a table Monday to Sunday (each
 * day's times, a second time under the first, "Closed" for a day without hours, and today marked
 * with the word "Today" and `aria-current="date"`, never by colour alone), then the later lines
 * as notes. A first line it cannot read is shown as written under "Hours as listed by the
 * provider" in place of the table; a readable one that says more than its week (a note in
 * brackets, holiday hours) stays one press away under the same words, after the notes, so
 * nothing the provider wrote is hidden. Without `now` it shows the week with no state and no
 * today mark.
 */
const props = defineProps({
  /** `service.openingHours`: the weekly line, then notes. */
  lines: { type: Array, required: true },
  /** The page's minute clock. */
  now: { type: Date, default: null },
})

const read = computed(() => readServiceHours(props.lines))
const clock = computed(() => (props.now ? melbourneClock(props.now) : null))
const today = computed(() => (clock.value ? describeHoursToday(props.lines, clock.value) : null))
const days = computed(() =>
  read.value.schedule === null
    ? []
    : WEEKDAYS.map((day) => ({
        day,
        label: DAY_LABELS[day],
        isToday: clock.value?.weekday === day,
        times: [...read.value.schedule[day]]
          .sort((left, right) => left[0] - right[0])
          .map(formatOpenRange),
      })),
)
</script>

<template>
  <div class="opening-hours">
    <p v-if="today" class="hours-today">
      <strong class="hours-today__state" :class="`hours-today__state--${today.status}`">{{
        today.label
      }}</strong
      ><template v-if="today.detail"> · {{ today.detail }}</template>
    </p>

    <table v-if="days.length" class="hours-week">
      <caption class="visually-hidden">
        Opening hours, Monday to Sunday
      </caption>
      <tbody>
        <tr
          v-for="entry in days"
          :key="entry.day"
          :class="{ 'hours-week__row--today': entry.isToday }"
          :aria-current="entry.isToday ? 'date' : undefined"
        >
          <th scope="row">
            {{ entry.label }}
            <span v-if="entry.isToday" class="hours-week__today">Today</span>
          </th>
          <td>
            <span v-for="time in entry.times" :key="time" class="hours-week__time">{{ time }}</span>
            <span v-if="entry.times.length === 0" class="hours-week__closed">Closed</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="read.listed && read.schedule === null" class="hours-listed">
      <h4>Hours as listed by the provider</h4>
      <p dir="auto">{{ read.listed }}</p>
    </div>

    <ul v-if="read.notes.length" class="hours-notes">
      <li v-for="note in read.notes" :key="note" dir="auto">{{ note }}</li>
    </ul>

    <!-- After the notes, so it is never read as the heading of them. -->
    <details v-if="read.listed && read.schedule !== null" class="hours-listed">
      <summary>Hours as listed by the provider</summary>
      <p dir="auto">{{ read.listed }}</p>
    </details>
  </div>
</template>

<style scoped>
.opening-hours {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.opening-hours p,
.opening-hours h4 {
  margin: 0;
}

.hours-today__state {
  font-weight: 600;
}

/* The words carry the state; the colour only repeats it. */
.hours-today__state--open {
  color: var(--color-success);
}

.hours-today__state--closed,
.hours-today__state--unknown {
  color: var(--color-heading);
}

/* The week: a day per row, ruled between rows, the times in a second column that lines up. */
.hours-week {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.hours-week th,
.hours-week td {
  border-top: 1px solid var(--color-border);
  padding: 0.5rem 0.5rem;
  text-align: start;
  vertical-align: top;
}

.hours-week tr:first-child > * {
  border-top: 0;
}

.hours-week th {
  width: 48%;
  white-space: nowrap;
  color: var(--color-heading);
  font-weight: 600;
}

.hours-week__time {
  display: block;
}

.hours-week__closed {
  color: var(--color-text-muted);
}

/* Today stands out by its "Today" label and a tinted row. */
.hours-week__row--today > * {
  background: var(--color-brand-soft);
}

.hours-week__today {
  display: inline-block;
  margin-inline-start: 0.375rem;
  border: 1px solid var(--color-brand);
  border-radius: 999px;
  padding: 0 0.5rem;
  color: var(--color-brand-strong);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.5;
}

.hours-listed h4 {
  margin-bottom: 0.25rem;
  color: var(--color-heading);
  font-size: 0.9375rem;
  font-weight: 600;
}

.hours-listed p {
  overflow-wrap: anywhere;
}

/* A list item keeps the browser's open and closed triangle, the sign that it expands; the padding
   gives it a 44 px target. */
.hours-listed summary {
  display: list-item;
  padding-block: 0.625rem;
  color: var(--color-link);
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
}

.hours-notes {
  display: grid;
  gap: 0.375rem;
  margin: 0;
  padding-left: 1.25rem;
}

@media (forced-colors: active) {
  .hours-week__row--today > * {
    border-top-color: Highlight;
  }
}
</style>
