<script setup>
import { computed } from 'vue'

import { ACCESS_FACTS, ACCESS_NOTES } from '../domain/accessDraft.js'
import { entryListHint } from '../domain/recordDrafts.js'

import EntryListField from './EntryListField.vue'

/**
 * The staff editor for a service's access information: the common facts as ticks (wheelchair
 * access, a step-free entrance, parking, public transport nearby) and the specifics as notes
 * entered a row at a time. It edits the access draft of accessDraft.js (`modelValue`,
 * `update:modelValue`), which saves each ticked fact as its phrase and then the notes. The first
 * tick carries `id`, so a page can focus the field by its id; the form's `error` is about the
 * notes and is passed to them.
 */
const props = defineProps({
  id: { type: String, required: true },
  modelValue: { type: Object, required: true },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const draft = computed(() => props.modelValue)
const update = (changes) => emit('update:modelValue', { ...props.modelValue, ...changes })
// The ticked facts stay in checklist order, whatever order they were ticked in.
const toggle = (fact, checked) =>
  update({
    facts: ACCESS_FACTS.filter((candidate) =>
      candidate === fact ? checked : draft.value.facts.includes(candidate),
    ),
  })
const factId = (index) => (index === 0 ? props.id : `${props.id}-${index}`)
const hintId = computed(() => `${props.id}-hint`)
</script>

<template>
  <fieldset class="access-checklist" :aria-describedby="hintId">
    <legend class="access-checklist__legend">Access</legend>
    <p :id="hintId" class="access-checklist__hint">
      Tick what the source confirms. Add the specifics, such as bus numbers or the walk from the
      station, as notes.
    </p>
    <div class="access-checklist__facts">
      <label
        v-for="(fact, index) in ACCESS_FACTS"
        :key="fact"
        class="access-checklist__fact"
        :for="factId(index)"
      >
        <input
          :id="factId(index)"
          type="checkbox"
          :checked="draft.facts.includes(fact)"
          @change="toggle(fact, $event.target.checked)"
        />
        {{ fact }}
      </label>
    </div>
    <EntryListField
      :id="`${id}-notes`"
      legend="Access notes"
      :hint="entryListHint('note', ACCESS_NOTES)"
      :entries="draft.notes"
      entry-label="Access note"
      add-label="Add access note"
      count-noun="access notes"
      :maximum="ACCESS_NOTES.maximum"
      :entry-maximum="ACCESS_NOTES.entryMaximum"
      :error="error"
      @update:entries="update({ notes: $event })"
    />
  </fieldset>
</template>

<style scoped>
.access-checklist {
  display: grid;
  gap: 1rem;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
}

.access-checklist__legend {
  padding: 0 0.25rem;
  color: var(--color-heading);
  font-weight: 600;
}

.access-checklist__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

/* The facts in one column on a phone and two from 768px, each a whole-line target. */
.access-checklist__facts {
  display: grid;
  gap: 0 1rem;
}

.access-checklist__fact {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
}

/* The notes are part of this field: their group needs no frame of its own. */
.access-checklist :deep(.entry-list) {
  border: 0;
  padding: 0;
}

@media (min-width: 768px) {
  .access-checklist__facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
