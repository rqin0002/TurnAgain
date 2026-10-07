<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import StatePanel from '@/shared/components/StatePanel.vue'

import { loadChart } from './chartChunk.js'

/**
 * One Chart.js bar chart with its table alternative (spec 8.6 L1005, 10.5, L235). Chart.js loads
 * lazily through chartChunk.js; the canvas is an image named by `label`, and "View as table"
 * always carries the same numbers, so the chart is never the only way to read them. Colours are
 * the CSS tokens named by `colorTokens` (one per series), read again when the theme changes;
 * animation is off under prefers-reduced-motion. No data renders the empty StatePanel and no
 * canvas (U10). New data with the same labels and numbers (a catalogue reload) keeps the drawn
 * chart, so a reload neither flickers nor animates again; a failed chunk load is retried.
 * Sizing comes from the `.chart-canvas__frame` class, never a string :style.
 */
const props = defineProps({
  data: { type: Object, required: true },
  label: { type: String, required: true },
  caption: { type: String, required: true },
  firstColumnLabel: { type: String, required: true },
  emptyMessage: { type: String, required: true },
  colorTokens: { type: Array, required: true },
  stacked: { type: Boolean, default: false },
})

const FAILED_MESSAGE = "The chart couldn't load. The table below shows the same numbers."
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const DARK_SCHEME = '(prefers-color-scheme: dark)'

const canvas = ref(null)
const failed = ref(false)
const empty = computed(() => props.data.labels.length === 0)

let chart = null
let drawing = 0
let unmounted = false
let schemeQuery = null
let themeObserver = null

const media = (query) => {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
  } catch {
    return null
  }
}

const token = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor'

const palette = () => ({
  series: props.colorTokens.map(token),
  text: token('--color-text'),
  grid: token('--color-border'),
})

const datasets = (colors) =>
  props.data.series.map((series, index) => ({
    label: series.label,
    data: [...series.values],
    backgroundColor: colors.series[index % colors.series.length],
    borderColor: colors.series[index % colors.series.length],
    borderWidth: 1,
  }))

const axis = (colors) => ({
  stacked: props.stacked,
  ticks: { color: colors.text, precision: 0 },
  grid: { color: colors.grid },
})

const config = () => {
  const colors = palette()
  return {
    type: 'bar',
    data: { labels: [...props.data.labels], datasets: datasets(colors) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: media(REDUCED_MOTION)?.matches ? false : undefined,
      scales: { x: axis(colors), y: { ...axis(colors), beginAtZero: true } },
      plugins: { legend: { labels: { color: colors.text } } },
    },
  }
}

const destroy = () => {
  chart?.destroy()
  chart = null
}

const draw = async () => {
  const attempt = ++drawing
  destroy()
  if (empty.value) return
  let Chart
  try {
    Chart = await loadChart()
  } catch {
    if (attempt === drawing && !unmounted) failed.value = true
    return
  }
  if (attempt !== drawing || unmounted) return
  failed.value = false
  await nextTick()
  if (attempt !== drawing || unmounted || !canvas.value) return
  chart = new Chart(canvas.value, config())
}

/** A theme change recolours the drawn chart without animating it again. */
const recolour = () => {
  if (!chart) return
  const colors = palette()
  chart.data.datasets = datasets(colors)
  chart.options.scales = { x: axis(colors), y: { ...axis(colors), beginAtZero: true } }
  chart.options.plugins = { legend: { labels: { color: colors.text } } }
  chart.update('none')
}

/** The labels and the series are what the canvas shows; the table rows follow from them. */
const sameChart = (next, previous) =>
  previous !== undefined &&
  JSON.stringify([next.labels, next.series]) === JSON.stringify([previous.labels, previous.series])

watch(
  () => props.data,
  (next, previous) => {
    if (!failed.value && sameChart(next, previous)) return
    void draw()
  },
)

onMounted(() => {
  void draw()
  schemeQuery = media(DARK_SCHEME)
  schemeQuery?.addEventListener?.('change', recolour)
  if (typeof MutationObserver === 'function') {
    themeObserver = new MutationObserver(recolour)
    themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] })
  }
})

onBeforeUnmount(() => {
  unmounted = true
  schemeQuery?.removeEventListener?.('change', recolour)
  themeObserver?.disconnect()
  destroy()
})
</script>

<template>
  <div class="chart-canvas">
    <StatePanel v-if="empty" variant="empty" :message="emptyMessage" />
    <template v-else>
      <div v-if="!failed" class="chart-canvas__frame">
        <canvas ref="canvas" role="img" :aria-label="label"></canvas>
      </div>
      <!-- Mounted with the chart; only its text changes (M6-D22). -->
      <p class="chart-canvas__status" role="status">{{ failed ? FAILED_MESSAGE : '' }}</p>
      <details class="chart-canvas__table">
        <summary>View as table</summary>
        <table>
          <caption>
            {{
              caption
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ firstColumnLabel }}</th>
              <th v-for="series in data.series" :key="series.key" scope="col">
                {{ series.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in data.rows" :key="index">
              <th scope="row" dir="auto">{{ row.label }}</th>
              <td v-for="series in data.series" :key="series.key">{{ row[series.key] }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </div>
</template>

<style scoped>
.chart-canvas {
  display: grid;
  gap: 0.75rem;
}

.chart-canvas__frame {
  position: relative;
  height: 18rem;
}

.chart-canvas__status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.chart-canvas__table summary {
  cursor: pointer;
  color: var(--color-link);
  font-weight: 600;
}

.chart-canvas__table table {
  width: 100%;
  margin-top: 0.75rem;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

.chart-canvas__table caption {
  margin-bottom: 0.5rem;
  color: var(--color-text-muted);
  text-align: left;
}

.chart-canvas__table th,
.chart-canvas__table td {
  border-bottom: 1px solid var(--color-border);
  padding: 0.4rem 0.5rem;
  text-align: left;
}

.chart-canvas__table td {
  font-variant-numeric: tabular-nums;
}

@media (min-width: 768px) {
  .chart-canvas__frame {
    height: 20rem;
  }
}
</style>
