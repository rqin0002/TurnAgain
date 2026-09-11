<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useSearchDraft } from '../composables/useSearchDraft.js'
import ActivityCard from '../features/activities/components/ActivityCard.vue'
import { useActivityCatalogue } from '../features/activities/composables/useActivityCatalogue.js'
import {
  buildActivityCatalogue,
  normalizeActivityCriteria,
  toActivityQuery,
} from '../features/activities/domain/activityCatalogue.js'

const route = useRoute()
const router = useRouter()
const { status, activities, sessions, now, errorMessage, retry } = useActivityCatalogue()

const criteria = computed(() => normalizeActivityCriteria(route.query))
const catalogue = computed(() =>
  buildActivityCatalogue(activities.value, sessions.value, criteria.value, now.value),
)
const hasFilters = computed(() => Boolean(criteria.value.search || criteria.value.type))
const resultLabel = computed(() => {
  const count = catalogue.value.length
  return `${count} ${count === 1 ? 'activity' : 'activities'}`
})

const resultMotion = computed(() => ({
  key: catalogue.value.map((entry) => entry.activity.id).join('|'),
  quietKey: criteria.value.search,
}))

const updateCriteria = (patch) => {
  const nextCriteria = { ...criteria.value, ...patch }
  return router.replace({ name: 'activities', query: toActivityQuery(nextCriteria) })
}

const clearFilters = () => updateCriteria({ search: '', type: '', sort: criteria.value.sort })

const searchInput = useSearchDraft({
  value: () => criteria.value.search,
  onChange: (search) => updateCriteria({ search }),
})
</script>

<template>
  <section class="page-section">
    <div class="shell activities-page">
      <header v-motion class="activities-page__intro reading-width">
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

          <div class="activities-page__field activities-page__field--wide">
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

          <div class="activities-page__field">
            <label for="activity-type">Activity type</label>
            <select
              id="activity-type"
              class="form-control"
              name="activity-type"
              autocomplete="off"
              :value="criteria.type"
              @change="updateCriteria({ type: $event.target.value })"
            >
              <option value="">All activity types</option>
              <option value="repair">Repair</option>
              <option value="reuse">Reuse</option>
              <option value="workshop">Workshop</option>
            </select>
          </div>

          <div class="activities-page__field">
            <label for="activity-sort">Sort</label>
            <select
              id="activity-sort"
              class="form-control"
              name="activity-sort"
              autocomplete="off"
              :value="criteria.sort"
              @change="updateCriteria({ sort: $event.target.value })"
            >
              <option value="soonest">Next session</option>
              <option value="title-asc">Activity title: A–Z</option>
              <option value="title-desc">Activity title: Z–A</option>
            </select>
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
          <h2 class="section-title">Current activities</h2>
          <output aria-live="polite">{{ resultLabel }}</output>
        </div>

        <div v-if="catalogue.length" v-motion:results="resultMotion" class="activities-page__list">
          <ActivityCard
            v-for="entry in catalogue"
            :key="entry.activity.id"
            :activity="entry.activity"
            :next-session="entry.nextSession"
            :session-count="entry.sessions.length"
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

@media (min-width: 768px) {
  .activities-page {
    gap: 2.5rem;
  }

  .activities-page__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
  }

  .activities-page__field--wide {
    grid-column: 1 / -1;
  }

  .activities-page__clear {
    justify-self: start;
  }
}

@media (min-width: 1200px) {
  .activities-page__controls {
    grid-template-columns: minmax(18rem, 1.5fr) repeat(2, minmax(11rem, 0.65fr)) auto;
    gap: 1.25rem;
  }

  .activities-page__field--wide {
    grid-column: auto;
  }

  /* Text resizing can exhaust a wide screen's usable space. Keep the existing
     two-column arrangement when the catalogue is narrow relative to its type. */
  @container (max-width: 60rem) {
    .activities-page__controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .activities-page__field--wide {
      grid-column: 1 / -1;
    }
  }
}
</style>
