<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import StatePanel from '@/shared/components/StatePanel.vue'

import { fitLabel } from '../domain/chartData.js'
import { loadChart } from './chartChunk.js'

/**
 * One horizontal Chart.js bar chart with its table alternative. Chart.js loads lazily through
 * chartChunk.js; the canvas is an image named by `label`, and "View as table" always carries the
 * same numbers and every full row name, so the chart is never the only way to read them. Each
 * row's name sits on one line of the left axis, shortened with "…" to at most 40 % of the chart's
 * width as measured in the axis font (the tooltip and the table keep the full name). Every row is
 * the same height, so the bars keep one thickness whatever the names. A stacked chart writes each
 * bar's total just past its end. The legend is one line of HTML above the canvas, with optional
 * short keys (`legendLabels`) after an optional word (`legendTitle`); it only maps the colours,
 * so it is hidden from assistive technology, which reads the table. Colours are the CSS tokens
 * named by `colorTokens` (one per series), read again when the theme changes; animation is off
 * under prefers-reduced-motion. No data renders the empty StatePanel and no canvas. New data with
 * the same labels and numbers (a catalogue reload) keeps the drawn chart, so a reload neither
 * flickers nor animates again. When the chart chunk cannot be downloaded the status line says so
 * and the table opens; a later data change asks for the chunk again, which a browser that
 * remembers the failed download answers from that record until the page is loaded afresh, so the
 * table stays the way to read the numbers. Every :style here is an object, like every :style in
 * the app.
 */
const props = defineProps({
  data: { type: Object, required: true },
  label: { type: String, required: true },
  caption: { type: String, required: true },
  firstColumnLabel: { type: String, required: true },
  emptyMessage: { type: String, required: true },
  colorTokens: { type: Array, required: true },
  stacked: { type: Boolean, default: false },
  /** One short line per row, shown under its name in the table. */
  rowNotes: { type: Array, default: () => [] },
  /** A word shown before the legend's keys, such as "Stars". */
  legendTitle: { type: String, default: '' },
  /** A short key per series for the legend; each series' label when empty. */
  legendLabels: { type: Array, default: () => [] },
})

const FAILED_MESSAGE = "The chart couldn't load. The table below shows the same numbers."
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const DARK_SCHEME = '(prefers-color-scheme: dark)'
// The axis, legend and total text size in pixels (the page's 0.875rem).
const AXIS_FONT_SIZE = 14
// The share of the chart's width a name on the axis may take.
const NAME_SHARE = 0.4
// The frame's height in rem: one fixed height per row and a fixed part for the count axis.
const ROW_REM = 2.25
const COUNT_AXIS_REM = 2
// Each bar fills this share of its row, so bars stay in proportion to the space they have.
const BAR_SHARE = 0.65
const MAX_BAR_PX = 24
// The gap in pixels between a bar's end and its total, and a total's width per character as a
// share of the font size (a digit or a comma is narrower than that in the page's fonts).
const TOTAL_GAP_PX = 6
const TOTAL_CHARACTER_EM = 0.6

const canvas = ref(null)
const failed = ref(false)
const empty = computed(() => props.data.labels.length === 0)
const number = (value) => new Intl.NumberFormat('en-AU').format(value)

const frameStyle = computed(() => ({
  height: `${props.data.labels.length * ROW_REM + COUNT_AXIS_REM}rem`,
}))
/** The legend's keys: each series' colour token and its short key or label. */
const legendKeys = computed(() =>
  props.data.series.map((series, index) => ({
    key: series.key,
    text: props.legendLabels[index] ?? series.label,
    swatch: { background: `var(${props.colorTokens[index % props.colorTokens.length]})` },
  })),
)
/** Each row's total over every series, as the stacked chart writes it at the bar's end. */
const totals = computed(() =>
  props.data.labels.map((_, index) =>
    number(props.data.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0)),
  ),
)

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

/** The page's own font family, so the chart's text matches the text around it. */
const fontFamily = () => getComputedStyle(document.documentElement).fontFamily || 'sans-serif'

const palette = () => ({
  series: props.colorTokens.map(token),
  text: token('--color-text'),
  grid: token('--color-border'),
  surface: token('--color-surface'),
  family: fontFamily(),
})

const cssFont = (colors) => `${AXIS_FONT_SIZE}px ${colors.family}`

const datasets = (colors) =>
  props.data.series.map((series, index) => ({
    label: series.label,
    data: [...series.values],
    backgroundColor: colors.series[index % colors.series.length],
    // An edge in the page's surface colour keeps neighbouring segments apart, so their
    // boundaries show without relying on the colours alone.
    borderColor: colors.surface,
    borderWidth: 1,
    categoryPercentage: 1,
    barPercentage: BAR_SHARE,
    maxBarThickness: MAX_BAR_PX,
  }))

/**
 * The axis label of row `index`: its name shortened to one line. Chart.js calls it with the scale
 * as `this`, and again on every resize, so the cut follows the chart's width.
 */
function fitName(_value, index) {
  const { ctx } = this
  const font = cssFont({ family: fontFamily() })
  const measure = (text) => {
    ctx.save()
    ctx.font = font
    const { width } = ctx.measureText(text)
    ctx.restore()
    return width
  }
  return fitLabel(props.data.labels[index], this.chart.width * NAME_SHARE, measure)
}

const scales = (colors) => ({
  x: {
    stacked: props.stacked,
    beginAtZero: true,
    // Counts are whole numbers, so every tick is a whole number too.
    ticks: {
      color: colors.text,
      precision: 0,
      font: { size: AXIS_FONT_SIZE, family: colors.family },
    },
    grid: { color: colors.grid },
  },
  y: {
    stacked: props.stacked,
    // Every row keeps its name: Chart.js would otherwise skip labels it cannot fit.
    ticks: {
      color: colors.text,
      autoSkip: false,
      font: { size: AXIS_FONT_SIZE, family: colors.family },
      callback: fitName,
    },
    grid: { display: false },
  },
})

const plugins = (colors) => ({
  legend: { display: false },
  barTotals: { labels: totals.value, color: colors.text, font: cssFont(colors) },
})

/** Writes each stacked bar's total just past the end of its last segment. */
const barTotals = Object.freeze({
  id: 'barTotals',
  afterDatasetsDraw(drawn, _args, options) {
    const last = drawn.getDatasetMeta(drawn.data.datasets.length - 1)
    const { ctx } = drawn
    ctx.save()
    ctx.font = options.font
    ctx.fillStyle = options.color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    last.data.forEach((bar, index) => {
      ctx.fillText(options.labels[index], bar.x + TOTAL_GAP_PX, bar.y)
    })
    ctx.restore()
  },
})

/** Room on the right for the longest total, so the longest bar's total stays on the canvas. */
const totalsRoom = () => {
  if (!props.stacked) return 0
  const longest = Math.max(0, ...totals.value.map((text) => text.length))
  return Math.ceil(longest * AXIS_FONT_SIZE * TOTAL_CHARACTER_EM) + TOTAL_GAP_PX
}

const config = () => {
  const colors = palette()
  return {
    type: 'bar',
    data: { labels: [...props.data.labels], datasets: datasets(colors) },
    plugins: props.stacked ? [barTotals] : [],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: media(REDUCED_MOTION)?.matches ? false : undefined,
      layout: { padding: { right: totalsRoom() } },
      scales: scales(colors),
      plugins: plugins(colors),
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
  chart.options.scales = scales(colors)
  chart.options.plugins = plugins(colors)
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
      <template v-if="!failed">
        <!-- The colours' key only: the table below names every series for assistive technology. -->
        <p class="chart-canvas__legend" aria-hidden="true">
          <span v-if="legendTitle" class="chart-canvas__legend-title">{{ legendTitle }}</span>
          <span v-for="key in legendKeys" :key="key.key" class="chart-canvas__key"
            ><span class="chart-canvas__swatch" :style="key.swatch"></span>{{ key.text }}</span
          >
        </p>
        <div class="chart-canvas__frame" :style="frameStyle">
          <canvas ref="canvas" role="img" :aria-label="label"></canvas>
        </div>
      </template>
      <!-- Mounted with the chart; only its text changes. -->
      <p class="chart-canvas__status" role="status">{{ failed ? FAILED_MESSAGE : '' }}</p>
      <details class="chart-canvas__table" :open="failed">
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
              <th scope="row">
                <span dir="auto">{{ row.label }}</span>
                <span v-if="rowNotes[index]" class="chart-canvas__note">{{ rowNotes[index] }}</span>
              </th>
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

/* One line at every width: short keys, small swatches, no wrapping between a swatch and its key. */
.chart-canvas__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.875rem;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  line-height: 1.4;
}

.chart-canvas__legend-title {
  color: var(--color-text);
  font-weight: 600;
}

.chart-canvas__key {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  white-space: nowrap;
}

.chart-canvas__swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 3px;
}

/* The height comes from the rows (frameStyle); Chart.js fills the frame. */
.chart-canvas__frame {
  position: relative;
  min-width: 0;
}

.chart-canvas__status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

/* At least 44px tall, with the browser's own disclosure marker. */
.chart-canvas__table summary {
  padding-block: 0.6rem;
  cursor: pointer;
  color: var(--color-link);
  font-size: 0.9375rem;
  font-weight: 600;
}

.chart-canvas__table table {
  width: 100%;
  margin-top: 0.25rem;
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
  vertical-align: top;
}

.chart-canvas__table td {
  font-variant-numeric: tabular-nums;
}

.chart-canvas__note {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 400;
}

@media (forced-colors: active) {
  .chart-canvas__swatch {
    border: 1px solid CanvasText;
    forced-color-adjust: none;
  }
}
</style>
