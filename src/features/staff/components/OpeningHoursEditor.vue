<script setup>
import { computed, nextTick, ref } from 'vue'

import { WEEKDAYS } from '@/features/discovery/domain/openingHours.js'
import { DAY_LABELS } from '@/features/discovery/domain/weeklyHours.js'
import AppButton from '@/shared/components/AppButton.vue'

import {
  HOURS_NOTES,
  checkHoursDraft,
  copyMondayToWeekdays,
  hoursProblems,
  listedLineKept,
} from '../domain/hoursDraft.js'
import { entryListHint } from '../domain/recordDrafts.js'

import EntryListField from './EntryListField.vue'

/**
 * The staff editor for a service's opening hours: the week Monday to Sunday, each day Open or
 * Closed with its opening and closing times (15-minute steps; a second pair for a break), "Copy
 * Monday to Tue–Fri", a "Closed on public holidays" tick and notes entered a row at a time. It
 * edits the hours draft of hoursDraft.js (`modelValue`, `update:modelValue`), which says how the
 * week becomes the stored lines. A stored first line the week cannot stand in for is shown above
 * the week as the provider wrote it, with what saving will do to it: an unreadable one stays
 * until a day is set open or the person removes it; a readable one that says more than the week
 * stays as written until the week changes.
 *
 * Accessibility: one fieldset for the field and one per day, whose legend is the day's name; the
 * day's Open and Closed are radios with one name, so the arrow keys move between them; each time
 * field is named with its day ("Monday Opens"). Monday's Open carries `id`, so a page can focus
 * the field by its id. Once the form reports an `error`, the time to fix is marked invalid and
 * its day says why, worked out again from the draft as the person types; a week too long for one
 * line is said under the week and marks the first open time. Removing the second time moves the
 * focus to "Add a second time", removing the listed line moves it to Monday's Open, and Copy
 * keeps it and says what it did in a status line mounted from the start.
 */
const props = defineProps({
  id: { type: String, required: true },
  modelValue: { type: Object, required: true },
  /** The form's message for the week ('' until a save finds a problem). */
  error: { type: String, default: '' },
  /** The form's message for the notes. */
  notesError: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const STATES = Object.freeze([
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
])
const NOTES_HINT = `Anything else about the hours, such as holiday dates. ${entryListHint('note', HOURS_NOTES)}`

const draft = computed(() => props.modelValue)
const copyMessage = ref('')
// Every change but Copy clears the line that says what Copy did, so it never describes an older
// week.
const update = (changes, message = '') => {
  copyMessage.value = message
  emit('update:modelValue', { ...props.modelValue, ...changes })
}
const setDay = (day, changes) =>
  update({ days: { ...draft.value.days, [day]: { ...draft.value.days[day], ...changes } } })
const setTime = (day, index, part, value) =>
  setDay(day, {
    ranges: draft.value.days[day].ranges.map((range, position) =>
      position === index ? { ...range, [part]: value } : range,
    ),
  })

const stateId = (day, state) =>
  day === 'mon' && state === 'open' ? props.id : `${props.id}-${day}-${state}`
const timeId = (day, index, part) => `${props.id}-${day}-${index}-${part}`
const addId = (day) => `${props.id}-${day}-add`
const dayErrorId = (day) => `${props.id}-${day}-error`
const errorId = computed(() => `${props.id}-error`)
const hintId = computed(() => `${props.id}-hint`)

const focusById = async (id) => {
  await nextTick()
  document.getElementById(id)?.focus()
}
const addSecond = (day) => {
  setDay(day, { ranges: [...draft.value.days[day].ranges, { opens: '', closes: '' }] })
  return focusById(timeId(day, 1, 'opens'))
}
const removeSecond = (day) => {
  setDay(day, { ranges: draft.value.days[day].ranges.slice(0, 1) })
  return focusById(addId(day))
}
const copyMonday = () => {
  const copied = copyMondayToWeekdays(draft.value)
  update({ days: copied.days }, "Tuesday to Friday now have Monday's hours.")
}
const removeListed = () => {
  update({ listed: null })
  return focusById(props.id)
}

// The problems are shown only after the form has reported one, then follow the draft.
const problems = computed(() => (props.error ? hoursProblems(draft.value) : {}))
const weekError = computed(() =>
  props.error && Object.keys(problems.value).length === 0 ? checkHoursDraft(draft.value) : '',
)
const firstOpenDay = computed(() => WEEKDAYS.find((day) => draft.value.days[day].open))
const timeInvalid = (day, index, part) => {
  const problem = problems.value[day]
  if (problem && problem.range === index) {
    if (problem.kind === 'order') return part === 'closes'
    if (problem.kind === 'overlap') return part === 'opens'
    const range = draft.value.days[day].ranges[index]
    return range[part] === '' || (range.opens !== '' && range.closes !== '' && part === 'opens')
  }
  return Boolean(weekError.value) && day === firstOpenDay.value && index === 0 && part === 'opens'
}
const timeDescribedBy = (day, index, part) => {
  if (!timeInvalid(day, index, part)) return undefined
  return problems.value[day] ? dayErrorId(day) : errorId.value
}
const groupDescribedBy = computed(() =>
  [hintId.value, weekError.value ? errorId.value : ''].filter(Boolean).join(' '),
)

const listed = computed(() => draft.value.listed)
const listedKept = computed(() => listedLineKept(draft.value))
const listedTitle = computed(() =>
  listed.value?.readable
    ? 'Hours as currently listed'
    : 'Hours as currently listed (could not be read)',
)
const listedNote = computed(() => {
  if (listed.value?.readable) {
    return listedKept.value
      ? 'The week below was read from this line, which is saved as written until you change the week. Add anything else it says as a note.'
      : 'The week below replaces this line when you save. Add anything else it says as a note.'
  }
  return listedKept.value
    ? 'Enter the week below to replace this line. Until you do, it is saved as it is.'
    : 'The week below replaces this line when you save.'
})
</script>

<template>
  <fieldset class="hours-editor" :aria-describedby="groupDescribedBy">
    <legend class="hours-editor__legend">Opening hours</legend>
    <p :id="hintId" class="hours-editor__hint">
      Set each day to Open or Closed and give its times. Visitors see this week on the listing, and
      "Open now" reads it.
    </p>

    <div
      v-if="listed"
      class="hours-editor__listed"
      :class="{ 'hours-editor__listed--unread': !listed.readable }"
    >
      <p class="hours-editor__listed-title">{{ listedTitle }}</p>
      <p class="hours-editor__listed-text" dir="auto">{{ listed.text }}</p>
      <p class="hours-editor__listed-note" role="status">{{ listedNote }}</p>
      <AppButton
        v-if="!listed.readable"
        variant="text"
        class="hours-editor__listed-remove"
        @click="removeListed"
      >
        Remove this line
      </AppButton>
    </div>

    <div class="hours-editor__days">
      <fieldset
        v-for="day in WEEKDAYS"
        :key="day"
        class="hours-day"
        :class="{ 'hours-day--open': draft.days[day].open }"
      >
        <legend class="hours-day__name">{{ DAY_LABELS[day] }}</legend>
        <div class="hours-day__state">
          <label v-for="state in STATES" :key="state.value" class="hours-day__choice">
            <input
              :id="stateId(day, state.value)"
              class="visually-hidden"
              type="radio"
              :name="`${id}-${day}`"
              :value="state.value"
              :checked="(state.value === 'open') === draft.days[day].open"
              @change="setDay(day, { open: state.value === 'open' })"
            />
            <span>{{ state.label }}</span>
          </label>
        </div>
        <div v-if="draft.days[day].open" class="hours-day__times">
          <div
            v-for="(range, index) in draft.days[day].ranges"
            :key="index"
            class="hours-day__range"
          >
            <span class="hours-day__time">
              <label class="hours-day__time-label" :for="timeId(day, index, 'opens')"
                ><span class="visually-hidden">{{ `${DAY_LABELS[day]} ` }}</span
                >{{ index === 0 ? 'Opens' : 'Reopens' }}</label
              >
              <input
                :id="timeId(day, index, 'opens')"
                class="form-control hours-day__input"
                type="time"
                step="900"
                :value="range.opens"
                :aria-invalid="timeInvalid(day, index, 'opens') ? 'true' : undefined"
                :aria-describedby="timeDescribedBy(day, index, 'opens')"
                @input="setTime(day, index, 'opens', $event.target.value)"
              />
            </span>
            <span class="hours-day__time">
              <label class="hours-day__time-label" :for="timeId(day, index, 'closes')"
                ><span class="visually-hidden">{{ `${DAY_LABELS[day]} ` }}</span
                >Closes<span v-if="index === 1" class="visually-hidden">{{ ' again' }}</span></label
              >
              <input
                :id="timeId(day, index, 'closes')"
                class="form-control hours-day__input"
                type="time"
                step="900"
                :value="range.closes"
                :aria-invalid="timeInvalid(day, index, 'closes') ? 'true' : undefined"
                :aria-describedby="timeDescribedBy(day, index, 'closes')"
                @input="setTime(day, index, 'closes', $event.target.value)"
              />
            </span>
            <AppButton
              v-if="index === 1"
              variant="text"
              class="hours-day__remove"
              @click="removeSecond(day)"
            >
              Remove<span class="visually-hidden"> the second time on {{ DAY_LABELS[day] }}</span>
            </AppButton>
            <AppButton
              v-else-if="draft.days[day].ranges.length === 1"
              :id="addId(day)"
              variant="text"
              class="hours-day__add"
              @click="addSecond(day)"
            >
              Add a second time<span class="visually-hidden"> on {{ DAY_LABELS[day] }}</span>
            </AppButton>
          </div>
          <p v-if="problems[day]" :id="dayErrorId(day)" class="hours-day__error">
            {{ problems[day].message }}
          </p>
        </div>
      </fieldset>
    </div>

    <div class="hours-editor__tools">
      <AppButton variant="secondary" @click="copyMonday">Copy Monday to Tue–Fri</AppButton>
      <p class="hours-editor__status" role="status">{{ copyMessage }}</p>
    </div>

    <label class="hours-editor__holidays" :for="`${id}-holidays`">
      <input
        :id="`${id}-holidays`"
        type="checkbox"
        :checked="draft.holidaysClosed"
        @change="update({ holidaysClosed: $event.target.checked })"
      />
      Closed on public holidays
    </label>

    <EntryListField
      :id="`${id}-notes`"
      legend="Notes about hours"
      :hint="NOTES_HINT"
      :entries="draft.notes"
      entry-label="Note"
      add-label="Add a note"
      count-noun="notes"
      :maximum="HOURS_NOTES.maximum"
      :entry-maximum="HOURS_NOTES.entryMaximum"
      :error="notesError"
      @update:entries="update({ notes: $event })"
    />

    <p v-if="weekError" :id="errorId" class="hours-editor__error">{{ weekError }}</p>
  </fieldset>
</template>

<style scoped>
.hours-editor {
  display: grid;
  gap: 1rem;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
}

.hours-editor__legend {
  padding: 0 0.25rem;
  color: var(--color-heading);
  font-weight: 600;
}

.hours-editor__hint,
.hours-editor__status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

/* The stored line the week cannot stand in for, as the provider wrote it, set apart from the
   controls by a rule at its start; an unreadable one is drawn in the warning colours. */
.hours-editor__listed {
  display: grid;
  justify-items: start;
  gap: 0.375rem;
  border-inline-start: 3px solid var(--color-border-strong);
  border-radius: 0 var(--radius-small) var(--radius-small) 0;
  background: var(--color-surface-muted);
  padding: 0.75rem 1rem;
}

.hours-editor__listed--unread {
  border-inline-start-color: var(--color-warning);
  background: var(--color-warning-soft);
}

.hours-editor__listed p {
  margin: 0;
}

.hours-editor__listed-title {
  color: var(--color-heading);
  font-size: 0.875rem;
  font-weight: 600;
}

.hours-editor__listed-text {
  color: var(--color-heading);
  overflow-wrap: anywhere;
}

.hours-editor__listed-note {
  color: var(--color-text);
  font-size: 0.875rem;
}

/* The button's own padding is its target; its text lines up with the panel's. */
.hours-editor__listed-remove {
  margin-inline-start: -0.45rem;
}

/* The week reads as a table: one ruled row per day. Its width, not the window's, decides
   whether a day's times sit beside its name or under it. */
.hours-editor__days {
  container-type: inline-size;
  border-top: 1px solid var(--color-border);
}

.hours-day {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem 1rem;
  min-width: 0;
  margin: 0;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 0.75rem 0;
}

/* A floated legend takes part in the row's grid like any other child. */
.hours-day__name {
  float: left;
  padding: 0;
  color: var(--color-heading);
  font-weight: 600;
}

.hours-day__state {
  display: inline-flex;
  justify-self: end;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  padding: 0.125rem;
}

.hours-day__choice {
  position: relative;
  display: inline-flex;
  min-width: 4.5rem;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
}

.hours-day__choice:has(input:checked) {
  background: var(--color-brand);
  color: var(--color-on-brand);
}

/* The radio itself is hidden, so its focus ring is drawn on the label around it. */
.hours-day__choice:has(input:focus-visible) {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.hours-day__times {
  display: grid;
  grid-column: 1 / -1;
  justify-items: start;
  gap: 0.5rem;
  min-width: 0;
}

/* One time per line: its opening and closing fields side by side (sharing a phone's width), then
   Add a second time or Remove, which wraps under them when the line is full. */
.hours-day__range {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem 0.75rem;
  width: 100%;
}

.hours-day__time {
  display: grid;
  flex: 1 1 7.25rem;
  gap: 0.25rem;
  max-width: 8.5rem;
}

.hours-day__time-label {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.hours-day__input {
  width: 100%;
}

/* Level with the fields beside it, whose bottom it shares. */
.hours-day__add,
.hours-day__remove {
  margin-bottom: 0.1875rem;
}

.hours-day__error,
.hours-editor__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
  font-weight: 600;
}

.hours-editor__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.hours-editor__holidays {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
  justify-self: start;
}

/* The notes are part of this field: their group needs no frame of its own. */
.hours-editor :deep(.entry-list) {
  border: 0;
  padding: 0;
}

/* Wide enough, a day reads across: its name, Open or Closed, then its times. */
@container (min-width: 36rem) {
  .hours-day {
    grid-template-columns: 6.5rem auto minmax(0, 1fr);
  }

  .hours-day__state {
    justify-self: start;
  }

  .hours-day__times {
    grid-column: auto;
  }
}

@media (forced-colors: active) {
  .hours-day__choice:has(input:checked) {
    forced-color-adjust: none;
    background: Highlight;
    color: HighlightText;
  }
}
</style>
