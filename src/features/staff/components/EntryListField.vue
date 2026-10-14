<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'

/**
 * A list of short text entries edited one row at a time: each entry is its own one-line text
 * area with a Remove button, and Add (or Enter in a row) starts a new row and puts the cursor in
 * it. An empty row that already exists is reused, so empty rows never stack up. A long entry
 * wraps inside its row and the row grows to show all of it, so a sentence can be read whole on a
 * phone; an entry stays one line of text: Enter (with or without Shift) starts the next row, and
 * a line break pasted into a row becomes a space.
 *
 * Data: the parent holds the list as an array of strings (`entries`, `update:entries`). Rows that
 * are empty or only spaces stay inside this component and are never handed back, so an added
 * empty row is never a change and never reaches the saved record. Values are handed back as
 * typed (a pasted line break aside); the caller trims them where it forms the saved value, so
 * typing never jumps the cursor or eats a space. When the parent replaces the list with a different one (a reset,
 * another record, "Use mine" after a conflict) the rows are rebuilt from it; a list equal to the
 * one this component last handed back or received (its own echo through v-model) changes nothing,
 * so an empty row stays. Each row has a key of its own that never leaves this component, so
 * removing or adding a row in the middle never moves a value or the focus to another row.
 *
 * Accessibility: a fieldset whose legend is the field's name; each input is labelled by its
 * position ("Item 2") and its Remove button names that row. The first row's input (or the Add
 * button when there is no row) carries `id`, so a page can focus the field by its id. An entry
 * longer than `entryMaximum` is marked beside its row as it is typed and is never shortened. A
 * group `error` (the page's alert summary announces it) marks the rows it is about: the
 * over-long rows, else the entries past `maximum`, else the first row, else the Add button, so
 * focusing the first invalid control lands where the person can fix the list. The count line is
 * a status region that is always mounted and has text only near the limit. It counts entries, so
 * an empty row is not counted; with `maximum` entries Add adds nothing (it is marked unavailable,
 * not disabled, so it keeps the focus).
 */
const props = defineProps({
  id: { type: String, required: true },
  legend: { type: String, required: true },
  hint: { type: String, default: '' },
  entries: { type: Array, required: true },
  entryLabel: { type: String, required: true },
  addLabel: { type: String, required: true },
  countNoun: { type: String, required: true },
  maximum: { type: Number, required: true },
  entryMaximum: { type: Number, required: true },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:entries'])

let lastKey = 0
const toRow = (value) => {
  lastKey += 1
  return { key: lastKey, value: String(value ?? '') }
}
// A new, empty list (a blank create form) starts with one empty row ready to type in.
const rowsFrom = (entries) => (entries.length > 0 ? entries.map(toRow) : [toRow('')])
const isBlank = (row) => row.value.trim() === ''
const sameList = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const rows = ref(rowsFrom(props.entries))
const filledRows = computed(() => rows.value.filter((row) => !isBlank(row)))
// The list the parent holds, as this component last handed it back or received it.
let parentEntries = [...props.entries]

watch(
  () => props.entries,
  (incoming) => {
    if (sameList(incoming, parentEntries)) return
    parentEntries = [...incoming]
    rows.value = rowsFrom(incoming)
  },
  { deep: true },
)

/** Hands the non-empty rows back to the parent when they differ from the list it holds. */
const commit = () => {
  const next = filledRows.value.map((row) => row.value)
  if (sameList(next, parentEntries)) return
  parentEntries = next
  emit('update:entries', [...next])
}

const inputs = new Map()
const inputRef = (key) => (element) => {
  if (element) inputs.set(key, element)
  else inputs.delete(key)
}
const addButton = ref(null)
const focusRow = async (key) => {
  await nextTick()
  inputs.get(key)?.focus()
}
const focusAdd = async () => {
  await nextTick()
  addButton.value?.$el?.focus()
}

const atLimit = computed(() => filledRows.value.length >= props.maximum)

async function addRow() {
  const blank = rows.value.find(isBlank)
  if (blank) {
    await focusRow(blank.key)
    return
  }
  if (atLimit.value) return
  const row = toRow('')
  rows.value = [...rows.value, row]
  await focusRow(row.key)
}

// A row is as tall as its wrapped text, never shorter than the field's own minimum. The height is
// set on the element (not a style attribute, which the production content policy refuses) after
// each change of its text or of the list's width.
const fitHeight = (element) => {
  if (!element) return
  element.style.height = 'auto'
  const borders = element.offsetHeight - element.clientHeight
  element.style.height = `${element.scrollHeight + borders}px`
}
const fitAll = () => {
  for (const element of inputs.values()) fitHeight(element)
}
watch(rows, () => nextTick(fitAll))
const group = ref(null)
let widthObserver = null
onMounted(() => {
  nextTick(fitAll)
  // A narrower list wraps the text onto more lines, so every row is fitted again.
  if (typeof ResizeObserver === 'function' && group.value) {
    widthObserver = new ResizeObserver(fitAll)
    widthObserver.observe(group.value)
  }
})
onBeforeUnmount(() => widthObserver?.disconnect())

function editRow(key, element) {
  const row = rows.value.find((candidate) => candidate.key === key)
  if (!row) return
  if (/[\r\n]/u.test(element.value)) element.value = element.value.replace(/\r?\n|\r/gu, ' ')
  row.value = element.value
  fitHeight(element)
  commit()
}

async function removeRow(index) {
  rows.value = rows.value.filter((_, position) => position !== index)
  commit()
  const neighbour = rows.value[index] ?? rows.value[index - 1]
  if (neighbour) await focusRow(neighbour.key)
  else await focusAdd()
}

function onEnter(event) {
  // Enter while an input method is composing a character confirms that character. Safari sends
  // that Enter just after composing ends, marked only by the key code 229.
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  addRow()
}

const rowName = (index) => `${props.entryLabel} ${index + 1}`
const inputId = (index, row) => (index === 0 ? props.id : `${props.id}-${row.key}`)
const rowErrorId = (row) => `${props.id}-${row.key}-error`
const hintId = computed(() => `${props.id}-hint`)
const errorId = computed(() => `${props.id}-error`)
const isLong = (row) => row.value.trim().length > props.entryMaximum

// The rows a group error is about when no row is over-long: the entries past the maximum, else
// the first row (the list has no entry).
const errorRows = computed(() => {
  if (!props.error || rows.value.some(isLong)) return new Set()
  const about =
    filledRows.value.length > props.maximum
      ? filledRows.value.slice(props.maximum)
      : rows.value.slice(0, 1)
  return new Set(about.map((row) => row.key))
})
const rowInvalid = (row) => isLong(row) || errorRows.value.has(row.key)
const rowDescribedBy = (row) => {
  const ids = []
  if (isLong(row)) ids.push(rowErrorId(row))
  if (props.error && rowInvalid(row)) ids.push(errorId.value)
  return ids.length > 0 ? ids.join(' ') : undefined
}
const addInvalid = computed(() => Boolean(props.error) && rows.value.length === 0)
const groupDescribedBy = computed(() => {
  const ids = []
  if (props.hint) ids.push(hintId.value)
  if (props.error) ids.push(errorId.value)
  return ids.length > 0 ? ids.join(' ') : undefined
})

const countText = computed(() => {
  const count = filledRows.value.length
  const tally = `${count} of ${props.maximum} ${props.countNoun}.`
  if (count > props.maximum) return `${tally} Remove ${count - props.maximum} before saving.`
  if (count === props.maximum) return `${tally} Remove one to add another.`
  return count >= props.maximum - 2 ? tally : ''
})
</script>

<template>
  <fieldset ref="group" class="entry-list" :aria-describedby="groupDescribedBy">
    <legend class="entry-list__legend">{{ legend }}</legend>
    <p v-if="hint" :id="hintId" class="entry-list__hint">{{ hint }}</p>
    <ol v-if="rows.length > 0" class="entry-list__rows">
      <li v-for="(row, index) in rows" :key="row.key" class="entry-list__row">
        <label class="visually-hidden" :for="inputId(index, row)">{{ rowName(index) }}</label>
        <textarea
          :id="inputId(index, row)"
          :ref="inputRef(row.key)"
          class="form-control entry-list__input"
          rows="1"
          dir="auto"
          :value="row.value"
          :aria-invalid="rowInvalid(row) ? 'true' : undefined"
          :aria-describedby="rowDescribedBy(row)"
          @input="editRow(row.key, $event.target)"
          @keydown.enter="onEnter"
        ></textarea>
        <AppButton variant="text" class="entry-list__remove" @click="removeRow(index)">
          Remove
          <span class="visually-hidden">{{ rowName(index).toLocaleLowerCase('en-AU') }}</span>
        </AppButton>
        <p v-if="isLong(row)" :id="rowErrorId(row)" class="entry-list__row-error">
          Use {{ entryMaximum }} characters or fewer.
        </p>
      </li>
    </ol>
    <div class="entry-list__footer">
      <AppButton
        :id="rows.length === 0 ? id : `${id}-add`"
        ref="addButton"
        variant="secondary"
        :aria-disabled="atLimit ? 'true' : undefined"
        :aria-invalid="addInvalid ? 'true' : undefined"
        :aria-describedby="addInvalid ? errorId : undefined"
        @click="addRow"
      >
        {{ addLabel }}
      </AppButton>
      <p class="entry-list__count" role="status">{{ countText }}</p>
    </div>
    <p v-if="error" :id="errorId" class="entry-list__error">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.entry-list {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
}

.entry-list__legend {
  padding: 0 0.25rem;
  color: var(--color-heading);
  font-weight: 600;
}

.entry-list__hint,
.entry-list__count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.entry-list__rows {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The row's text takes the rest of the line with a 12rem floor; Remove wraps under it only when
   the group is narrower than that, so neither the text nor the field is squeezed. Remove stays
   level with the first line of a row that has grown to several. */
.entry-list__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.25rem 0.5rem;
}

/* One line high until the text wraps; the script sets the height that shows all of it, so the
   row never scrolls inside itself and the resize handle is not needed. */
.entry-list__input {
  flex: 1 1 12rem;
  min-width: 0;
  overflow: hidden;
  resize: none;
  line-height: 1.5;
}

.entry-list__remove {
  flex: none;
}

.entry-list__row-error,
.entry-list__error {
  flex-basis: 100%;
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
  font-weight: 600;
}

.entry-list__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.entry-list__footer [aria-disabled='true'] {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
