<script setup>
import { nextTick, useId, ref, watch } from 'vue'
const props = defineProps({
  page: { type: Number, required: true },
  pageCount: { type: Number, required: true },
  pageSize: { type: Number, default: 10 },
  total: { type: Number, required: true },
  from: { type: Number, required: true },
  to: { type: Number, required: true },
  allowPageSize: { type: Boolean, default: true },
  /** False renders the range as plain text where the page already announces the change. */
  live: { type: Boolean, default: true },
})
const emit = defineEmits(['update:page', 'update:pageSize'])
const id = useId()
const root = ref(null)
watch(
  () => props.page,
  async () => {
    await nextTick()
    const active = document.activeElement
    if (root.value?.contains(active) && active.disabled) {
      root.value.closest('section')?.querySelector('h2[tabindex="-1"]')?.focus()
    }
  },
)
const changePage = async (page, event) => {
  const target = event.currentTarget
  const region = target.closest('section')
  emit('update:page', page)
  await nextTick()
  if (target.disabled) region?.querySelector('h2[tabindex="-1"]')?.focus()
}
</script>

<template>
  <div ref="root" class="result-pagination">
    <output v-if="live" aria-live="polite">{{ from }}–{{ to }} of {{ total }}</output>
    <p v-else class="result-pagination__range">{{ from }}–{{ to }} of {{ total }}</p>
    <div v-if="allowPageSize && total > 0" class="result-pagination__size">
      <label :for="id">Per page</label>
      <select
        :id="id"
        class="form-control"
        :value="pageSize"
        @change="emit('update:pageSize', Number($event.target.value))"
      >
        <option :value="10">10</option>
        <option :value="20">20</option>
      </select>
    </div>
    <nav v-if="props.pageCount > 1" aria-label="Results pages" class="result-pagination__buttons">
      <button
        class="button button--secondary"
        type="button"
        :disabled="page <= 1"
        @click="changePage(page - 1, $event)"
      >
        Previous
      </button>
      <span>Page {{ page }} of {{ pageCount }}</span>
      <button
        class="button button--secondary"
        type="button"
        :disabled="page >= pageCount"
        @click="changePage(page + 1, $event)"
      >
        Next
      </button>
    </nav>
  </div>
</template>

<style scoped>
.result-pagination,
.result-pagination__buttons,
.result-pagination__size {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.result-pagination {
  justify-content: space-between;
  border-top: 1px solid var(--color-border);
  padding-block: 1.25rem;
  margin-top: 1rem;
}
.result-pagination output,
.result-pagination__range {
  margin: 0;
  color: var(--color-text-muted);
}
.result-pagination__size {
  font-size: 0.9375rem;
}
.result-pagination__size select {
  width: auto;
  min-width: 5rem;
}
.result-pagination__buttons {
  gap: 0.5rem;
}
.result-pagination__buttons span {
  font-size: 0.875rem;
}
@media (max-width: 575px) {
  .result-pagination__buttons {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
