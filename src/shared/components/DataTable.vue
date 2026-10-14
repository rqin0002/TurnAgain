<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, useId, useSlots, watch } from 'vue'

import AppButton from './AppButton.vue'
import DataTableFilter from './DataTableFilter.vue'
import ResultPagination from './ResultPagination.vue'
import { useSearchDraft } from '../composables/useSearchDraft.js'
import { cellText, multiFilterValues } from '../domain/tableQuery.js'

/**
 * The staff tables' shared table (WAI-ARIA APG sortable table). It queries nothing: `state` and
 * `result` come from `useTableState`, and every filter, sort and page change is emitted for the
 * owner to apply. Its own state is limited to the text being typed in each filter, the layout,
 * and where focus returns. Text-filter drafts are created once from `columns`, so pass a constant
 * list.
 *
 * Above the rows, in both layouts: when a filter is set, the filtered count, the list of active
 * filters in words and Clear filters; the owner's toolbar; then the filters. A column marked
 * `quickFilter` keeps its labelled control in view; every other column's control sits in one
 * "More filters" disclosure whose summary counts its active filters. Every data column keeps its
 * own filter either way.
 * From 992 px up the rows are a native table with a caption and one header row of sort buttons
 * (`aria-sort` on the sorted one); below, they are cards titled at `headingLevel`, with the sort
 * as a `<select>` among the filters.
 * The wide table scrolls sideways inside its own box. Its first column stays pinned at the left
 * with a fixed width unless `pinFirstColumn` is false or a select column comes first; a control
 * that takes focus where the pinned cells would cover it is scrolled clear of them. The actions
 * column stays on one line unless `wrapActions` is set. A column's `width`, `nowrap` and `wrap`
 * hints become cell classes.
 */
const props = defineProps({
  columns: { type: Array, required: true },
  result: { type: Object, required: true },
  state: { type: Object, required: true },
  totalCount: { type: Number, required: true },
  caption: { type: String, required: true },
  truncated: { type: Boolean, default: false },
  rowKey: { type: Function, default: (row) => row.id },
  emptyMessage: { type: String, default: 'No records match these filters.' },
  pinFirstColumn: { type: Boolean, default: true },
  wrapActions: { type: Boolean, default: false },
  headingLevel: {
    type: Number,
    default: 3,
    validator: (value) => Number.isInteger(value) && value >= 2 && value <= 6,
  },
})
const emit = defineEmits(['filter', 'clear-filters', 'sort', 'page'])

const id = useId()
const root = ref(null)
const scrollBox = ref(null)
const captionId = `${id}-caption`
const sortSelectId = `${id}-sort`
const filterId = (column) => `${id}-filter-${column.key}`

// Tables inline at 992 px, cards below; the table when matchMedia is missing.
const media =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 992px)')
    : null
const wide = ref(media ? media.matches : true)
const onMediaChange = (event) => {
  wide.value = event.matches
}
onMounted(() => media?.addEventListener?.('change', onMediaChange))
onBeforeUnmount(() => media?.removeEventListener?.('change', onMediaChange))

const captionText = computed(() =>
  props.truncated ? `${props.caption}, incomplete: first 1,000 records` : props.caption,
)

// The filters that are set, in column order, each with the words it filters on: the typed text,
// the chosen option's label, or the chosen options' labels.
const optionLabel = (column, value) =>
  column.options?.find((option) => option.value === value)?.label ?? value
const filterWords = (column, value) => {
  if (column.filter === 'multi') {
    return multiFilterValues(value)
      .map((one) => optionLabel(column, one))
      .join(', ')
  }
  return column.filter === 'select' ? optionLabel(column, value) : value
}
const activeFilters = computed(() =>
  props.columns
    .map((column) => ({ column, value: props.state.filters?.[column.key] ?? '' }))
    .filter(({ value }) => value !== '')
    .map(({ column, value }) => ({
      key: column.key,
      label: column.label,
      words: filterWords(column, value),
    })),
)
const isFiltered = computed(() => activeFilters.value.length > 0)

// Quick filters stay in view; the others share one disclosure that counts its own active ones.
const quickColumns = computed(() => props.columns.filter((column) => column.quickFilter === true))
const moreColumns = computed(() => props.columns.filter((column) => column.quickFilter !== true))
const moreSummary = computed(() => {
  const name = quickColumns.value.length > 0 ? 'More filters' : 'Filters'
  const count = activeFilters.value.filter((filter) =>
    moreColumns.value.some((column) => column.key === filter.key),
  ).length
  return count > 0 ? `${name} (${count} active)` : name
})
const firstColumn = computed(() => props.columns[0])
const otherColumns = computed(() => props.columns.slice(1))
const cardHeading = computed(() => `h${props.headingLevel}`)

// The layout hints of a column as classes for its header and body cells.
const cellClasses = (column) => ({
  'data-table__col--narrow': column.width === 'narrow',
  'data-table__col--wide': column.width === 'wide',
  'data-table__cell--nowrap': column.nowrap === true,
  'data-table__cell--wrap': column.wrap === true,
})

// One cell's content for both layouts (the card and the table row): the view's `cell-<key>` slot
// with the row and its cell text, or the text in a `dir="auto"` span, since cells hold typed text.
const slots = useSlots()
const ColumnCell = ({ column, row }) => {
  const text = cellText(column, row)
  const cellSlot = slots[`cell-${column.key}`]
  return cellSlot ? cellSlot({ row, text }) : h('span', { dir: 'auto' }, text)
}
ColumnCell.props = ['column', 'row']

// The first column is pinned unless the owner opts out or a select column takes its place.
const isPinned = () => props.pinFirstColumn && !slots.select

// Keeps a focused control clear of the pinned column. The scroll box's scroll-padding asks the
// browser for this when it scrolls focus into view; this covers a browser that ignores the
// padding for focus. When focus lands on something the pinned cells overlap (a sort button or a
// row action reached with Shift+Tab after scrolling right), the box scrolls back just far enough
// to show it beside them, with room for the focus ring. Controls inside the pinned cells
// themselves never move the box, and neither does focus on the box itself, which a browser may
// let the keyboard focus so it can be scrolled: the box is never under its own pinned cells.
const FOCUS_RING_ROOM = 8
const keepFocusClear = (event) => {
  const box = scrollBox.value
  const target = event.target
  if (!box || !isPinned() || !(target instanceof Element) || target === box) return
  if (target.closest('thead th:first-child, tbody th[scope="row"]')) return
  const pinned = box.querySelector('thead th')
  if (!pinned) return
  const overlap =
    pinned.getBoundingClientRect().right + FOCUS_RING_ROOM - target.getBoundingClientRect().left
  if (overlap > 0) box.scrollLeft -= overlap
}

// After a sort or a filter change the person stays on the control they used; when that control
// is gone (Clear filters disappears with the last filter), the section heading takes focus, as
// ResultPagination does after its last page.
let lastControl = null
const rememberControl = () => {
  lastControl = document.activeElement instanceof HTMLElement ? document.activeElement : null
}
watch(
  () => props.state,
  async () => {
    const control = lastControl
    lastControl = null
    if (control === null) {
      return
    }
    await nextTick()
    const active = document.activeElement
    if (active !== null && active !== document.body) {
      return
    }
    if (control.isConnected && !control.disabled) {
      control.focus()
    } else {
      root.value?.closest('section')?.querySelector('h2[tabindex="-1"]')?.focus()
    }
  },
)

const changeFilter = (key, value) => {
  rememberControl()
  emit('filter', key, value)
}
const textDrafts = Object.fromEntries(
  props.columns
    .filter((column) => column.filter === 'text')
    .map((column) => [
      column.key,
      useSearchDraft({
        value: () => props.state.filters?.[column.key] ?? '',
        onChange: (value) => changeFilter(column.key, value),
      }),
    ]),
)
const clearFilters = () => {
  rememberControl()
  emit('clear-filters')
}

const directionOf = (column) =>
  props.state.sort?.key === column.key ? props.state.sort.direction : null
const ariaSort = (column) => {
  const direction = directionOf(column)
  if (direction === null) {
    return undefined
  }
  return direction === 'asc' ? 'ascending' : 'descending'
}
const sortIcon = (column) => ({ asc: '↑', desc: '↓' })[directionOf(column)] ?? '↕'
const toggleSort = (column) => {
  rememberControl()
  emit('sort', column.key, directionOf(column) === 'asc' ? 'desc' : 'asc')
}
const sortValue = computed(() =>
  props.state.sort ? `${props.state.sort.key}:${props.state.sort.direction}` : '',
)
const selectSort = (event) => {
  const [key, direction] = event.target.value.split(':')
  if (key && (direction === 'asc' || direction === 'desc')) {
    rememberControl()
    emit('sort', key, direction)
  }
}
</script>

<template>
  <div ref="root" class="data-table">
    <div class="data-table__bar">
      <div v-if="isFiltered" class="data-table__summary">
        <p class="data-table__filtered">Filtered: showing {{ result.total }} of {{ totalCount }}</p>
        <ul class="data-table__active" aria-label="Active filters">
          <li v-for="filter in activeFilters" :key="filter.key">
            {{ filter.label }}: <span dir="auto">{{ filter.words }}</span>
          </li>
        </ul>
      </div>
      <AppButton v-if="isFiltered" variant="text" @click="clearFilters">Clear filters</AppButton>
      <div v-if="$slots.toolbar" class="data-table__toolbar"><slot name="toolbar" /></div>
    </div>

    <div class="data-table__filters">
      <div
        v-for="column in quickColumns"
        :key="column.key"
        class="data-table__field data-table__field--quick"
      >
        <DataTableFilter
          :id="filterId(column)"
          :column="column"
          :value="state.filters?.[column.key] ?? ''"
          :search-draft="textDrafts[column.key]"
          @change="changeFilter(column.key, $event)"
        />
      </div>
      <div v-if="!wide" class="data-table__field data-table__field--quick">
        <label class="data-table__label" :for="sortSelectId">Sort by</label>
        <select :id="sortSelectId" class="form-control" :value="sortValue" @change="selectSort">
          <option v-if="!state.sort" value="">Not sorted</option>
          <template v-for="column in columns" :key="column.key">
            <option :value="`${column.key}:asc`">{{ column.label }} (ascending)</option>
            <option :value="`${column.key}:desc`">{{ column.label }} (descending)</option>
          </template>
        </select>
      </div>
      <details v-if="moreColumns.length > 0" class="data-table__more">
        <summary>{{ moreSummary }}</summary>
        <div class="data-table__filter-grid">
          <div v-for="column in moreColumns" :key="column.key" class="data-table__field">
            <DataTableFilter
              :id="filterId(column)"
              :column="column"
              :value="state.filters?.[column.key] ?? ''"
              :search-draft="textDrafts[column.key]"
              @change="changeFilter(column.key, $event)"
            />
          </div>
        </div>
      </details>
    </div>

    <template v-if="!wide">
      <p :id="captionId" class="data-table__caption">{{ captionText }}</p>
      <p v-if="result.total === 0" class="data-table__empty">{{ emptyMessage }}</p>
      <ul v-else class="data-table__cards" :aria-labelledby="captionId">
        <li v-for="row in result.rows" :key="rowKey(row)">
          <div class="data-table__card-head">
            <div v-if="$slots.select" class="data-table__card-select">
              <slot name="select" :row="row" />
            </div>
            <component :is="cardHeading" class="data-table__card-title">
              <ColumnCell :column="firstColumn" :row="row" />
            </component>
          </div>
          <dl>
            <div v-for="column in otherColumns" :key="column.key">
              <dt>{{ column.label }}</dt>
              <dd><ColumnCell :column="column" :row="row" /></dd>
            </div>
          </dl>
          <div v-if="$slots.actions" class="data-table__card-actions">
            <slot name="actions" :row="row" />
          </div>
        </li>
      </ul>
    </template>

    <div
      v-else
      ref="scrollBox"
      class="data-table__scroll"
      :class="{ 'data-table__scroll--pinned': isPinned() }"
      @focusin="keepFocusClear"
    >
      <table
        class="data-table__table"
        :class="{
          'data-table__table--sticky': isPinned(),
          'data-table__table--wrap-actions': wrapActions,
        }"
      >
        <caption>
          {{
            captionText
          }}<span class="visually-hidden">, column headers with buttons are sortable.</span>
        </caption>
        <thead>
          <tr>
            <th v-if="$slots.select" scope="col"><span class="visually-hidden">Select</span></th>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              :class="cellClasses(column)"
              :aria-sort="ariaSort(column)"
            >
              <button type="button" class="data-table__sort-button" @click="toggleSort(column)">
                {{ column.label }}
                <span class="data-table__sort-icon" aria-hidden="true">{{ sortIcon(column) }}</span>
              </button>
            </th>
            <th v-if="$slots.actions" scope="col" class="data-table__actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="result.total === 0">
            <td :colspan="columns.length + ($slots.select ? 1 : 0) + ($slots.actions ? 1 : 0)">
              {{ emptyMessage }}
            </td>
          </tr>
          <template v-else>
            <tr v-for="row in result.rows" :key="rowKey(row)">
              <td v-if="$slots.select"><slot name="select" :row="row" /></td>
              <th scope="row" :class="cellClasses(firstColumn)">
                <ColumnCell :column="firstColumn" :row="row" />
              </th>
              <td v-for="column in otherColumns" :key="column.key" :class="cellClasses(column)">
                <ColumnCell :column="column" :row="row" />
              </td>
              <td v-if="$slots.actions" class="data-table__actions">
                <slot name="actions" :row="row" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <ResultPagination
      :page="result.page"
      :page-count="result.pageCount"
      :total="result.total"
      :from="result.from"
      :to="result.to"
      :allow-page-size="false"
      @update:page="emit('page', $event)"
    />
  </div>
</template>

<style scoped>
.data-table {
  display: grid;
  min-width: 0;
  gap: 1rem;
}

.data-table__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.data-table__summary {
  display: grid;
  min-width: 0;
  gap: 0.25rem;
}

.data-table__filtered {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.data-table__active {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin: 0;
  padding: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  list-style: none;
}

.data-table__active li {
  min-width: 0;
  overflow-wrap: anywhere;
}

.data-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-left: auto;
}

/* The filters: the quick ones (and, on narrow screens, the sort) in a wrapping row, then the
   More filters disclosure across the full width. */
.data-table__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1rem;
}

.data-table__field {
  display: grid;
  min-width: 0;
  gap: 0.375rem;
}

.data-table__field--quick {
  flex: 1 1 14rem;
  max-width: 22rem;
}

.data-table__label,
.data-table__field :deep(.data-table-filter__label) {
  color: var(--color-heading);
  font-size: 0.875rem;
  font-weight: 600;
}

/* Compact controls that still keep a 44 px target. */
.data-table__filters :deep(.form-control) {
  min-height: 2.75rem;
  padding-block: 0.375rem;
}

.data-table__more {
  flex: 1 1 100%;
  border-block: 1px solid var(--color-border);
  padding-block: 0.125rem;
}

.data-table__more[open] {
  padding-bottom: 0.75rem;
}

.data-table__more summary {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.625rem;
  color: var(--color-heading);
  font-weight: 600;
  cursor: pointer;
}

/* A chevron drawn with borders (a flex summary has no marker): right when closed, down when open. */
.data-table__more summary::before {
  width: 0.5rem;
  height: 0.5rem;
  border-right: 2px solid currentcolor;
  border-bottom: 2px solid currentcolor;
  content: '';
  transform: rotate(-45deg);
  transition: transform var(--duration-fast);
}

.data-table__more[open] > summary::before {
  transform: rotate(45deg);
}

.data-table__filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
  gap: 1rem;
  margin-top: 0.5rem;
}

.data-table__caption,
.data-table__table caption {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  text-align: left;
}

.data-table__table caption {
  caption-side: top;
  padding: 0.75rem 1.25rem;
}

.data-table__empty {
  margin: 0;
  color: var(--color-text-muted);
}

.data-table__cards {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.data-table__cards > li {
  min-width: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 1.25rem 0;
}

.data-table__card-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.data-table__card-title {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.125rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.data-table__cards dl {
  display: grid;
  gap: 0.75rem 1.5rem;
  margin: 1rem 0 0;
}

.data-table__cards dl > div {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr);
  gap: 0.75rem;
}

.data-table__cards dt {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.data-table__cards dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.data-table__card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-top: 1rem;
}

/* The table scrolls sideways inside this box, never the page. It is positioned so that it contains
   the absolutely positioned visually hidden text in its cells; otherwise that text escapes the
   scroll box and widens the page. The pinned column's width lives here so the scroll padding can
   match it. */
.data-table__scroll {
  --data-table-pin-width: 15.5rem;

  position: relative;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  overflow-x: auto;
}

/* With a pinned column, the browser keeps whatever it scrolls into view (a focused control) clear
   of the pinned cells, with room for the focus ring. */
.data-table__scroll--pinned {
  scroll-padding-inline-start: calc(var(--data-table-pin-width) + 0.5rem);
}

/* Separate borders (with no spacing) so a pinned cell keeps its own borders while it scrolls. */
.data-table__table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.9375rem;
  line-height: 1.45;
}

.data-table__table th,
.data-table__table td {
  border-bottom: 1px solid var(--color-border);
  padding: 0.625rem 0.75rem;
  text-align: left;
  vertical-align: top;
}

.data-table__table thead th {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  padding-block: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
  vertical-align: bottom;
  white-space: nowrap;
}

/* Width hints: a cell's width is the least its column gets in an auto-layout table (min-width is
   not applied to table cells consistently across browsers). */
.data-table__col--narrow {
  width: 6rem;
}

.data-table__col--wide {
  width: 14rem;
}

.data-table__cell--nowrap,
.data-table__actions {
  white-space: nowrap;
}

/* The view's action group (the slot's root element) stays on one line in the table; the table
   class makes this rule outrank a flex-wrap the view sets on that element. */
.data-table__table .data-table__actions > :deep(*) {
  flex-wrap: nowrap;
}

/* The wrap opt-in: an actions cell with many controls wraps inside a column of at least 16rem. */
.data-table__table--wrap-actions .data-table__actions {
  min-width: 16rem;
  white-space: normal;
}

.data-table__table--wrap-actions .data-table__actions > :deep(*) {
  flex-wrap: wrap;
}

.data-table__cell--wrap {
  overflow-wrap: anywhere;
}

.data-table__table tbody th {
  color: var(--color-heading);
  font-weight: 600;
}

/* The row headers and the header cell above them stay at the left while the table scrolls, at a
   fixed width the scroll padding matches; the inset shadow draws their right edge, which a border
   cannot do on a pinned cell. */
.data-table__table--sticky tbody th[scope='row'],
.data-table__table--sticky thead th:first-child {
  position: sticky;
  inset-inline-start: 0;
  z-index: 1;
  width: var(--data-table-pin-width);
  min-width: var(--data-table-pin-width);
  max-width: var(--data-table-pin-width);
  box-shadow: inset -1px 0 0 var(--color-border);
  overflow-wrap: anywhere;
}

.data-table__table--sticky tbody th[scope='row'] {
  background: var(--color-surface);
}

.data-table__table tbody tr:last-child > * {
  border-bottom: 0;
}

/* Row states: hover and the row holding focus share the muted surface, the pinned cell included
   (this rule comes after the pinned cell's own background on purpose). */
.data-table__table tbody tr:hover > *,
.data-table__table tbody tr:focus-within > * {
  background: var(--color-surface-muted);
}

.data-table__sort-button {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  font: inherit;
  cursor: pointer;
}

.data-table__sort-button:hover {
  color: var(--color-brand);
  text-decoration: underline;
  text-underline-offset: 0.25em;
}

@media (min-width: 576px) {
  .data-table__cards dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* From 992 px the filter controls take the table's smaller type. Below it they keep 1rem: Safari
   on iPhone zooms the page into a focused field whose text is smaller than 16 px. */
@media (min-width: 992px) {
  .data-table__filters :deep(.form-control) {
    font-size: 0.9375rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .data-table__more summary::before {
    transition: none;
  }
}
</style>
