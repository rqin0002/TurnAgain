<script setup>
import { nextTick, onMounted, ref } from 'vue'

import { checkCategoryInput } from '@/features/discovery/domain/itemCategoryCatalogue.js'
import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'

import EntryListField from './EntryListField.vue'

/**
 * The area where an admin creates a shared item category without leaving the service form: a
 * name, optional other search words, Create category and Cancel. It checks the input first, then
 * calls `createCategory({ name, terms })` (the page's, which writes the shared catalogue) and
 * emits `created` with `{ outcome: 'created' | 'exists', id, label }`; a full catalogue or a
 * failure is said here and everything typed stays. It never touches the service draft: the form
 * decides whether to tick the category, and the service is still saved by the page's Save. One
 * create at a time: Create category is busy (it keeps the focus) and Cancel unavailable until it
 * settles. Enter in the name creates and Enter in a search word starts the next one, so neither
 * submits the service form. The name field takes the focus when the area opens; the failure line
 * is an alert region mounted with the area, empty until a create fails.
 */
const props = defineProps({
  createCategory: { type: Function, required: true },
})
const emit = defineEmits(['created', 'cancel'])

const NO_ERRORS = Object.freeze({ name: '', terms: '' })
const NO_ANSWER =
  'The answer did not arrive, so the category may or may not have been added. Press Create category again: it is never added twice.'
const FAILURES = Object.freeze({
  permission: 'Only an admin can add categories. If your role has changed, reload the page.',
  network: NO_ANSWER,
  offline: NO_ANSWER,
  conflict:
    'Another change to the category list was saved at the same moment. Press Create category again.',
  'invalid-data': 'The stored category list has an unexpected structure, so nothing was added.',
})
const FULL = 'The category list already holds 100 categories, the most it can hold.'
const OTHER_FAILURE = 'The category could not be created. Try again in a moment.'

const root = ref(null)
const nameInput = ref(null)
const name = ref('')
const terms = ref([])
const errors = ref(NO_ERRORS)
const failure = ref('')
const busy = ref(false)

onMounted(() => nameInput.value?.focus())

/** The line for a refused or unanswered create; reasons about a field go beside that field. */
const explain = (caught) => {
  if (caught?.code === 'invalid-data' && caught.details?.fields) {
    errors.value = { ...NO_ERRORS, ...caught.details.fields }
    return 'Check the name and the search words.'
  }
  return FAILURES[caught?.code] ?? OTHER_FAILURE
}

async function submit() {
  if (busy.value) return
  const checked = checkCategoryInput({ name: name.value, terms: terms.value })
  errors.value = checked.errors
  failure.value = ''
  if (!checked.isValid) {
    await nextTick()
    const target = checked.errors.name
      ? nameInput.value
      : root.value?.querySelector('#new-category-terms')
    target?.focus()
    return
  }
  busy.value = true
  try {
    const result = await props.createCategory({ name: name.value, terms: [...terms.value] })
    if (result?.outcome === 'full') failure.value = FULL
    else emit('created', result)
  } catch (caught) {
    failure.value = explain(caught)
  } finally {
    busy.value = false
  }
}

function onNameEnter(event) {
  // Enter while an input method is composing a character confirms that character. Safari sends
  // that Enter just after composing ends, marked only by the key code 229.
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <div ref="root" class="new-category" role="group" aria-labelledby="new-category-heading">
    <p id="new-category-heading" class="new-category__heading">New category</p>
    <p class="new-category__note">
      Other services can use a new category as soon as it is created. Ticking it here applies to
      this service when you save.
    </p>
    <FormField
      id="new-category-name"
      label="Category name"
      hint="2 to 60 characters, for example Musical instruments."
      :error="errors.name"
      required
    >
      <template #default="{ control }">
        <input
          ref="nameInput"
          v-bind="control"
          class="form-control"
          type="text"
          dir="auto"
          :value="name"
          @input="name = $event.target.value"
          @keydown.enter="onNameEnter"
        />
      </template>
    </FormField>
    <EntryListField
      id="new-category-terms"
      legend="Other words people search for (optional)"
      hint="One word or phrase per row, up to 10; the name is searched already."
      :entries="terms"
      entry-label="Word"
      add-label="Add word"
      count-noun="words"
      :maximum="10"
      :entry-maximum="60"
      :error="errors.terms"
      @update:entries="terms = $event"
    />
    <div class="new-category__actions">
      <AppButton :busy="busy" @click="submit">Create category</AppButton>
      <AppButton variant="text" :disabled="busy" @click="emit('cancel')">Cancel</AppButton>
    </div>
    <p class="new-category__failure" role="alert">{{ failure }}</p>
  </div>
</template>

<style scoped>
.new-category {
  display: grid;
  gap: 0.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.5rem;
  padding: 1rem;
  background: var(--color-surface);
}

.new-category__heading {
  margin: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.new-category__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.new-category__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.new-category__failure {
  margin: 0;
  color: var(--color-danger);
  font-weight: 600;
}
</style>
