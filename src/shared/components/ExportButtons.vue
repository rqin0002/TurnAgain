<script setup>
import { nextTick, ref } from 'vue'

import AppButton from './AppButton.vue'
import { downloadTextFile } from '../composables/downloadFile.js'
import { buildCsvExport, buildJsonExport, exportFileName } from '../domain/tableExport.js'

/**
 * Export CSV and Export JSON beside a table's count: both files carry the
 * same labels and exactly the rows the table holds after its filters and sort (`result.allRows`,
 * every page), as the cell text the screen shows. A truncated read names both files
 * `-incomplete` and marks the JSON. No PDF.
 */
const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  dataset: { type: String, required: true },
  filters: { type: Object, default: () => ({}) },
  truncated: { type: Boolean, default: false },
  now: { type: Function, default: () => new Date() },
})

const FAILURE_MESSAGE = 'The file could not be created here.'
const status = ref('')

const buildFile = (extension, now) => {
  if (extension === 'csv') {
    return {
      text: buildCsvExport({ rows: props.rows, columns: props.columns }),
      type: 'text/csv;charset=utf-8',
    }
  }
  return {
    text: buildJsonExport({
      rows: props.rows,
      columns: props.columns,
      filters: props.filters,
      exportedAt: new Date(now).toISOString(),
      incomplete: props.truncated,
    }),
    type: 'application/json;charset=utf-8',
  }
}

/** Builds and offers one file; false (never a throw) when the browser cannot. */
const offer = (extension) => {
  try {
    const now = props.now()
    const fileName = exportFileName({
      dataset: props.dataset,
      extension,
      now,
      incomplete: props.truncated,
    })
    return downloadTextFile({ ...buildFile(extension, now), fileName })
  } catch {
    return false
  }
}

/**
 * Empties the status line first and writes a failure one tick later, so a second failure in a row
 * is a new text change that the polite `role="status"` line announces again.
 */
const exportAs = async (extension) => {
  const offered = offer(extension)
  status.value = ''
  if (offered) return
  await nextTick()
  status.value = FAILURE_MESSAGE
}
</script>

<template>
  <div class="export-buttons">
    <AppButton variant="secondary" @click="exportAs('csv')">Export CSV</AppButton>
    <AppButton variant="secondary" @click="exportAs('json')">Export JSON</AppButton>
    <p class="export-buttons__status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.export-buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.export-buttons__status {
  flex-basis: 100%;
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
}
</style>
