<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, useId, useSlots, watch } from 'vue'

import AppButton from './AppButton.vue'
import DataTableFilter from './DataTableFilter.vue'
import ResultPagination from './ResultPagination.vue'
import { useSearchDraft } from '../composables/useSearchDraft.js'
import { cellText } from '../domain/tableQuery.js'

/**
 * The staff tables (WAI-ARIA APG sortable table): a native table with a caption,
 * one sort button per data column (`aria-sort` on the sorted header only), a labelled filter per
 * column, 10 rows a page through `ResultPagination` (its polite output is the count), and below
 * 992 px cards with the filters in a `<details>` and the sort as a `<select>`. The table holds no
 * state: `state` and `result` come from `useTableState`, every change is an event. The column
 * list is read once for the text-filter drafts, so views pass a constant list.
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
})
const emit = defineEmits(['filter', 'clear-filters', 'sort', 'page'])

const id = useId()
const root = ref(null)
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
const activeFilterCount = computed(
  () => Object.values(props.state.filters ?? {}).filter((value) => value !== '').length,
)
const isFiltered = computed(() => activeFilterCount.value > 0)
const filterSummary = computed(() =>
  isFiltered.value ? `Filters (${activeFilterCount.value} active)` : 'Filters',
)
const firstColumn = computed(() => props.columns[0])
const otherColumns = computed(() => props.columns.slice(1))

// One cell's content for both layouts (the card and the table row): the view's `cell-<key>` slot
// with the row and its cell text, or the text in a `dir="auto"` span, since cells hold typed text.
const slots = useSlots()
const ColumnCell = ({ column, row }) => {
  const text = cellText(column, row)
  const cellSlot = slots[`cell-${column.key}`]
  return cellSlot ? cellSlot({ row, text }) : h('span', { dir: 'auto' }, text)
}
ColumnCell.props = ['column', 'row']

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
      <p v-if="isFiltered" class="data-table__filtered">
        Filtered: showing {{ result.total }} of {{ totalCount }}
      </p>
      <AppButton v-if="isFiltered" variant="text" @click="clearFilters">Clear filters</AppButton>
      <div v-if="$slots.toolbar" class="data-table__toolbar"><slot name="toolbar" /></div>
    </div>

    <template v-if="!wide">
      <p :id="captionId" class="data-table__caption">{{ captionText }}</p>
      <div class="data-table__narrow-controls">
        <div class="data-table__field">
          <label :for="sortSelectId">Sort by</label>
          <select :id="sortSelectId" class="form-control" :value="sortValue" @change="selectSort">
            <option v-if="!state.sort" value="">Not sorted</option>
            <template v-for="column in columns" :key="column.key">
              <option :value="`${column.key}:asc`">{{ column.label }} (ascending)</option>
              <option :value="`${column.key}:desc`">{{ column.label }} (descending)</option>
            </template>
          </select>
        </div>
        <details class="data-table__filters">
          <summary>{{ filterSummary }}</summary>
          <div class="data-table__filter-grid">
            <div v-for="column in columns" :key="column.key" class="data-table__field">
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
      <p v-if="result.total === 0" class="data-table__empty">{{ emptyMessage }}</p>
      <ul v-else class="data-table__cards" :aria-labelledby="captionId">
        <li v-for="row in result.rows" :key="rowKey(row)">
          <div class="data-table__card-head">
            <div v-if="$slots.select" class="data-table__card-select">
              <slot name="select" :row="row" />
            </div>
            <h3><ColumnCell :column="firstColumn" :row="row" /></h3>
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

    <div v-else class="data-table__scroll">
      <table class="data-table__table">
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
              :aria-sort="ariaSort(column)"
            >
              <button type="button" class="data-table__sort-button" @click="toggleSort(column)">
                {{ column.label }}
                <span class="data-table__sort-icon" aria-hidden="true">{{ sortIcon(column) }}</span>
              </button>
            </th>
            <th v-if="$slots.actions" scope="col">Actions</th>
          </tr>
          <tr class="data-table__filter-row">
            <td v-if="$slots.select"></td>
            <td v-for="column in columns" :key="column.key">
              <DataTableFilter
                :id="filterId(column)"
                :column="column"
                :value="state.filters?.[column.key] ?? ''"
                :search-draft="textDrafts[column.key]"
                hide-label
                @change="changeFilter(column.key, $event)"
              />
            </td>
            <td v-if="$slots.actions"></td>
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
              <th scope="row"><ColumnCell :column="firstColumn" :row="row" /></th>
              <td v-for="column in otherColumns" :key="column.key">
                <ColumnCell :column="column" :row="row" />
              </td>
              <td v-if="$slots.actions"><slot name="actions" :row="row" /></td>
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

.data-table__filtered {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.data-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-left: auto;
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

.data-table__narrow-controls,
.data-table__filter-grid {
  display: grid;
  gap: 1rem;
}

.data-table__field {
  display: grid;
  min-width: 0;
  gap: 0.5rem;
}

.data-table__field :deep(label) {
  color: var(--color-heading);
  font-size: 0.875rem;
  font-weight: 600;
}

.data-table__filters {
  border-block: 1px solid var(--color-border);
  padding-block: 0.25rem 0.75rem;
}

.data-table__filters summary {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  color: var(--color-heading);
  font-weight: 600;
  cursor: pointer;
}

.data-table__filter-grid {
  margin-top: 0.75rem;
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

.data-table__card-head h3 {
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

.data-table__scroll {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  overflow-x: auto;
}

.data-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
  line-height: 1.55;
}

.data-table__table th,
.data-table__table td {
  border-bottom: 1px solid var(--color-border);
  padding: 0.875rem;
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.data-table__table thead th {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  padding-block: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}

.data-table__filter-row td {
  background: var(--color-surface-muted);
  padding-block: 0 0.75rem;
}

.data-table__filter-row :deep(.form-control) {
  min-width: 8rem;
}

.data-table__table tbody th {
  color: var(--color-heading);
  font-weight: 600;
}

.data-table__table tbody tr:last-child > * {
  border-bottom: 0;
}

.data-table__table tbody tr:focus-within {
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
  .data-table__narrow-controls {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    align-items: start;
  }

  .data-table__filter-grid,
  .data-table__cards dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
