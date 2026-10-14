<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { focusAfterAction } from '@/shared/composables/focusAfterAction.js'
import { useSearchDraft } from '@/shared/composables/useSearchDraft.js'
import ActivityCard from '@/features/activities/components/ActivityCard.vue'
import SessionCalendarLoader from '@/features/bookings/components/SessionCalendarLoader.vue'
import { useMyBookings } from '@/features/bookings/composables/useMyBookings.js'
import {
  initialCalendarDate,
  toCalendarEvents,
} from '@/features/bookings/domain/sessionCalendar.js'
import Chip from '@/shared/components/Chip.vue'
import ResultPagination from '@/shared/components/ResultPagination.vue'
import { paginateRecords } from '@/shared/domain/pagination.js'
import { formatRelativeTime } from '@/shared/domain/relativeTime.js'
import { useActivityCatalogue } from '@/features/activities/composables/useActivityCatalogue.js'
import {
  buildActivityCatalogue,
  formatActivityType,
  normalizeActivityCriteria,
  toActivityQuery,
} from '@/features/activities/domain/activityCatalogue.js'
import { ACTIVITY_TYPES } from '@/features/activities/domain/activitySchema.js'

const route = useRoute()
const router = useRouter()
const { status, activities, sessions, truncated, now, freshness, savedAt, errorMessage, retry } =
  useActivityCatalogue()
const criteria = computed(() => normalizeActivityCriteria(route.query))
// Only the calendar marks the member's bookings on this page, so the list never loads them.
const { bookings: myBookings } = useMyBookings({
  withSessions: false,
  autoLoad: () => criteria.value.view === 'calendar',
})
const catalogue = computed(() =>
  buildActivityCatalogue(activities.value, sessions.value, criteria.value, now.value),
)
const hasFilters = computed(() => Boolean(criteria.value.search || criteria.value.type))
const paged = computed(() => paginateRecords(catalogue.value, criteria.value))
const resultLabel = computed(() => {
  const count = catalogue.value.length
  return `${count} ${count === 1 ? 'activity' : 'activities'}`
})

const updateCriteria = (patch) => {
  const nextCriteria = { ...criteria.value, page: 1, ...patch }
  return router.replace({ name: 'activities', query: toActivityQuery(nextCriteria) })
}
watch([() => route.fullPath, status, () => paged.value.page], () => {
  if (status.value !== 'ready') return
  const query = toActivityQuery({ ...criteria.value, page: paged.value.page })
  if (router.resolve({ name: 'activities', query }).fullPath !== route.fullPath) {
    void router.replace({ name: 'activities', query })
  }
})

// The type chips, "All activities" first, named as the cards and the detail page name the types.
// One type at a time: choosing another type replaces it, and pressing the chosen type again shows
// every type, as "All activities" does.
const typeChips = ACTIVITY_TYPES.map((value) => ({ value, label: formatActivityType(value) }))
const chooseType = (type) => updateCriteria({ type: criteria.value.type === type ? '' : type })

// Clear filters clears the search and the type and keeps the sort. Both copies of the button show
// only while a search or a type is set, so the one pressed leaves the page: focus moves to the
// "All activities" chip, which now shows the cleared state, instead of falling to <body>.
const allTypesChip = ref(null)
const clearFilters = () =>
  focusAfterAction(
    () => updateCriteria({ search: '', type: '', sort: criteria.value.sort }),
    () => allTypesChip.value?.$el,
  )

// The calendar shows the sessions of the activities the filters keep.
const calendarSessions = computed(() => catalogue.value.flatMap((row) => row.sessions))
const calendarEvents = computed(() =>
  toCalendarEvents(
    calendarSessions.value,
    new Map(catalogue.value.map((row) => [row.activity.id, row.activity])),
    myBookings.value,
    now.value,
    { withActivityTitle: true },
  ),
)
const calendarDate = computed(() => initialCalendarDate(calendarEvents.value, now.value))
// This page has no session rows: an event opens its activity, which focuses the row.
const openSession = ({ sessionId, activityId }) =>
  router.push({ name: 'activity-detail', params: { activityId }, query: { session: sessionId } })

const resultsHeading = ref(null)
// The loader and its focused "Show the list" button unmount with the calendar, so focus moves to
// the list's heading instead of <body>.
const showList = async () => {
  await updateCriteria({ view: 'list' })
  await nextTick()
  resultsHeading.value?.focus()
}

const searchInput = useSearchDraft({
  value: () => criteria.value.search,
  onChange: (search) => updateCriteria({ search }),
})
</script>

<template>
  <section class="page-section">
    <div class="shell activities-page">
      <header class="activities-page__intro reading-width">
        <p class="activities-page__context">Repair &amp; reuse activities</p>
        <h1 class="page-title">Learn, repair, and keep useful things moving.</h1>
        <p>
          Compare published community activities before you sign in. Check suitability, session
          details, availability, and the original provider source before attending.
        </p>
      </header>

      <div v-if="status === 'loading' || status === 'idle'" class="state-panel" role="status">
        <div>
          <h2>Loading activities</h2>
          <p>Reading the current activity and session catalogue…</p>
        </div>
      </div>

      <div v-else-if="status === 'error'" class="state-panel activities-page__error" role="alert">
        <div>
          <h2>Activities are unavailable</h2>
          <p>{{ errorMessage }}</p>
          <button class="button button--primary" type="button" @click="retry">Try again</button>
        </div>
      </div>

      <template v-else>
        <fieldset class="activities-page__controls">
          <legend class="visually-hidden">Filter activities</legend>

          <div class="activities-page__field">
            <label for="activity-search">Search activities</label>
            <input
              id="activity-search"
              class="form-control"
              name="activity-search"
              type="search"
              autocomplete="off"
              maxlength="100"
              placeholder="Search activities, items, or locations…"
              :value="searchInput.draft.value"
              @input="searchInput.onInput"
              @compositionstart="searchInput.onCompositionStart"
              @compositionend="searchInput.onCompositionEnd"
            />
          </div>

          <div class="activities-page__refine">
            <div class="activities-page__types" role="group" aria-label="Activity type">
              <Chip
                ref="allTypesChip"
                label="All activities"
                :pressed="criteria.type === ''"
                @toggle="updateCriteria({ type: '' })"
              />
              <Chip
                v-for="typeChip in typeChips"
                :key="typeChip.value"
                :label="typeChip.label"
                :pressed="criteria.type === typeChip.value"
                @toggle="chooseType(typeChip.value)"
              />
            </div>

            <!-- The order applies to the list. The calendar keeps every session on its own date, so
                 the control shows with the list only; the choice stays in the URL for the way back. -->
            <label v-if="criteria.view === 'list'" class="activities-page__sort">
              <span>Sort</span>
              <select
                id="activity-sort"
                name="activity-sort"
                autocomplete="off"
                :value="criteria.sort"
                @change="updateCriteria({ sort: $event.target.value })"
              >
                <option value="soonest">Next session</option>
                <option value="title-asc">Activity title: A–Z</option>
                <option value="title-desc">Activity title: Z–A</option>
              </select>
            </label>
          </div>

          <button
            v-if="hasFilters"
            class="button button--secondary activities-page__clear"
            type="button"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </fieldset>

        <div class="activities-page__results-heading">
          <h2 ref="resultsHeading" class="section-title" tabindex="-1">Current activities</h2>
          <output aria-live="polite">{{ resultLabel }}</output>
          <div class="activities-page__views" role="group" aria-label="Show activities as">
            <Chip
              label="List"
              :pressed="criteria.view === 'list'"
              @toggle="updateCriteria({ view: 'list' })"
            />
            <Chip
              label="Calendar"
              :pressed="criteria.view === 'calendar'"
              @toggle="updateCriteria({ view: 'calendar' })"
            />
          </div>
        </div>
        <p v-if="truncated" role="status">Results incomplete: showing the first 1,000 records.</p>
        <p v-if="freshness === 'cached' && savedAt" class="catalogue-freshness" role="status">
          Showing results saved {{ formatRelativeTime(savedAt, { now }) }}
        </p>

        <template v-if="criteria.view === 'calendar' && catalogue.length">
          <SessionCalendarLoader
            :events="calendarEvents"
            :initial-date="calendarDate"
            skip-target="activities-calendar-end"
            :heading-level="3"
            @select-session="openSession"
            @show-list="showList"
          />
          <span id="activities-calendar-end" tabindex="-1"></span>
        </template>
        <div v-else-if="catalogue.length" class="activities-page__list">
          <ActivityCard
            v-for="entry in paged.items"
            :key="entry.activity.id"
            :activity="entry.activity"
            :next-session="entry.nextSession"
            :session-count="entry.sessions.length"
            :now="now"
          />
        </div>
        <div v-else class="state-panel">
          <div>
            <h2>
              {{ hasFilters ? 'No activities match these filters' : 'No activities published yet' }}
            </h2>
            <p v-if="hasFilters">
              Clear one or more filters to return to the complete activity catalogue.
            </p>
            <p v-else>
              TurnAgain has not published a verified activity record. Check again later or use Find
              nearby for current repair and reuse services.
            </p>
            <button
              v-if="hasFilters"
              class="button button--secondary"
              type="button"
              @click="clearFilters"
            >
              Clear filters
            </button>
          </div>
        </div>
        <ResultPagination
          v-if="criteria.view === 'list'"
          v-bind="paged"
          @update:page="updateCriteria({ page: $event })"
          @update:page-size="updateCriteria({ pageSize: $event })"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.activities-page {
  display: grid;
  container-type: inline-size;
  gap: 2rem;
}

.activities-page__intro {
  max-width: 54rem;
  padding-block: 0.5rem 1rem;
}

.activities-page__intro .page-title {
  max-width: 20ch;
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.activities-page__context {
  margin: 0 0 0.875rem;
  color: var(--color-text-muted);
  font-size: 1rem;
  font-weight: 600;
}

.activities-page__intro p:last-child {
  max-width: 64ch;
  margin: 1.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 1.125rem;
  line-height: 1.65;
}

.activities-page__error {
  border-left: 3px solid var(--color-danger);
}

.activities-page__controls {
  display: grid;
  min-width: 0;
  gap: 1rem;
  margin: 0;
  border: 0;
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.activities-page__field {
  display: grid;
  gap: 0.5rem;
}

.activities-page__field label {
  color: var(--color-heading);
  font-size: 0.9375rem;
  font-weight: 600;
}

/* The type chips and Sort share one row: the chips at the start, Sort at the end. When the row
   has no room for both, Sort moves to a line of its own at the start; on a narrow screen the
   chips themselves wrap too. */
.activities-page__refine {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}

.activities-page__types {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* A native select wearing the chip outline, as on Find nearby: the word Sort sits inside the
   pill, and the select itself keeps a 44 px target. */
.activities-page__sort {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface);
  padding: 0 0.5rem 0 0.9rem;
  color: var(--color-text);
  font-size: 0.9375rem;
  font-weight: 600;
}

.activities-page__sort select {
  min-height: 2.75rem;
  border: 0;
  background: transparent;
  color: var(--color-brand-strong);
  font: inherit;
  cursor: pointer;
}

.activities-page__clear {
  justify-self: start;
}

.activities-page__results-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-top: 0.5rem;
}

.activities-page__results-heading output {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.activities-page__list {
  display: grid;
  gap: 1.25rem;
}

.activities-page__views {
  display: flex;
  gap: 0.5rem;
}

@media (min-width: 768px) {
  .activities-page {
    gap: 2.5rem;
  }
}

/* From 1200 px the search and the chip row share one line, the search on the left; Clear filters
   stays below them. */
@media (min-width: 1200px) {
  .activities-page__controls {
    grid-template-columns: minmax(18rem, 1fr) auto;
    align-items: end;
    gap: 1.25rem;
  }

  .activities-page__clear {
    grid-column: 1 / -1;
  }

  /* Text resizing can exhaust a wide screen's usable space: when the catalogue is narrow relative
     to its type, the filters stay stacked. */
  @container (max-width: 60rem) {
    .activities-page__controls {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
