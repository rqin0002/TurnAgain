<script setup>
import { computed } from 'vue'

import { useSearchDraft } from '../../../composables/useSearchDraft.js'
import { useActivityCatalogue } from '../../activities/composables/useActivityCatalogue.js'
import { fetchStaffActivitySessions } from '../../activities/data/activityRepository.js'
import {
  formatSessionDate,
  formatSessionStatus,
  formatSessionTime,
  getRemainingCapacity,
} from '../../activities/domain/activityCatalogue.js'
import { buildActivitySessionPage } from '../domain/activitySessionRegister.js'

const props = defineProps({
  criteria: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits({
  'update:criteria': (value) => typeof value === 'object' && value !== null,
})

const { status, sessions, errorMessage, retry } = useActivityCatalogue({
  loader: fetchStaffActivitySessions,
})

const registerPage = computed(() => buildActivitySessionPage(sessions.value, props.criteria))
const hasFilters = computed(() =>
  Boolean(props.criteria.search || props.criteria.status || props.criteria.location),
)
const resultLabel = computed(() => {
  const count = registerPage.value.totalResults
  return `${count} ${count === 1 ? 'session' : 'sessions'}`
})

const hasKnownCapacity = (session) => getRemainingCapacity(session) !== null

const unknownCapacityLabel = (session) =>
  ['provider', 'drop-in'].includes(session?.registrationType) ? 'Provider managed' : '—'

const waitlistLabel = (session) =>
  Number.isInteger(session?.waitlistCount) && session.waitlistCount >= 0
    ? String(session.waitlistCount)
    : '—'

const updateFilters = (patch) => {
  emit('update:criteria', { ...props.criteria, ...patch, page: 1 })
}

const searchInput = useSearchDraft({
  value: () => props.criteria.search,
  onChange: (search) => updateFilters({ search }),
})
const locationInput = useSearchDraft({
  value: () => props.criteria.location,
  onChange: (location) => updateFilters({ location }),
})

const updatePage = (page) => {
  if (page >= 1 && page <= registerPage.value.totalPages) {
    emit('update:criteria', { ...props.criteria, page })
  }
}

const clearFilters = () => {
  emit('update:criteria', {
    search: '',
    status: '',
    location: '',
    sort: props.criteria.sort,
    page: 1,
  })
}

const sortDirection = (column) => {
  if (props.criteria.sort === `${column}-asc`) {
    return 'ascending'
  }
  if (props.criteria.sort === `${column}-desc`) {
    return 'descending'
  }
  return 'none'
}

const toggleSort = (column, preferredDirection = 'asc') => {
  const ascending = `${column}-asc`
  const descending = `${column}-desc`
  const nextSort =
    props.criteria.sort === ascending
      ? descending
      : props.criteria.sort === descending
        ? ascending
        : `${column}-${preferredDirection}`

  updateFilters({ sort: nextSort })
}

const sortIndicator = (column) => {
  const direction = sortDirection(column)
  return direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'
}
</script>

<template>
  <section class="session-register" aria-labelledby="session-register-heading">
    <header class="session-register__header">
      <div>
        <p class="eyebrow">Operational schedule</p>
        <h2 id="session-register-heading" class="section-title">Activity Sessions</h2>
      </div>
      <output v-if="status === 'ready'" class="session-register__summary" aria-live="polite">
        {{ resultLabel }}
      </output>
    </header>

    <div v-if="status === 'loading' || status === 'idle'" class="state-panel" role="status">
      <div>
        <h3>Loading Activity Sessions</h3>
        <p>Reading the current staff-visible session register…</p>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="state-panel session-register__error" role="alert">
      <div>
        <h3>Activity Sessions unavailable</h3>
        <p>{{ errorMessage }}</p>
        <button class="button button--primary" type="button" @click="retry">Try again</button>
      </div>
    </div>

    <template v-else>
      <fieldset class="surface surface--padded session-register__controls">
        <legend class="visually-hidden">Filter activity sessions</legend>

        <div class="session-register__field session-register__field--wide">
          <label for="staff-session-search">Search all columns</label>
          <input
            id="staff-session-search"
            class="form-control"
            name="session-search"
            type="search"
            autocomplete="off"
            maxlength="100"
            placeholder="Search activities, venues, or notices…"
            :value="searchInput.draft.value"
            @input="searchInput.onInput"
            @compositionstart="searchInput.onCompositionStart"
            @compositionend="searchInput.onCompositionEnd"
          />
        </div>

        <div class="session-register__field">
          <label for="staff-session-status">Status column</label>
          <select
            id="staff-session-status"
            class="form-control"
            name="session-status"
            autocomplete="off"
            :value="criteria.status"
            @change="updateFilters({ status: $event.target.value })"
          >
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="full">Full</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div class="session-register__field">
          <label for="staff-session-location">Location column</label>
          <input
            id="staff-session-location"
            class="form-control"
            name="session-location"
            type="search"
            autocomplete="off"
            maxlength="100"
            placeholder="Venue, suburb, or postcode…"
            :value="locationInput.draft.value"
            @input="locationInput.onInput"
            @compositionstart="locationInput.onCompositionStart"
            @compositionend="locationInput.onCompositionEnd"
          />
        </div>

        <div class="session-register__field session-register__mobile-sort">
          <label for="staff-session-sort">Sort</label>
          <select
            id="staff-session-sort"
            class="form-control"
            name="session-sort"
            autocomplete="off"
            :value="criteria.sort"
            @change="updateFilters({ sort: $event.target.value })"
          >
            <option value="date-asc">Session date: earliest</option>
            <option value="date-desc">Session date: latest</option>
            <option value="activity-asc">Activity: A–Z</option>
            <option value="activity-desc">Activity: Z–A</option>
            <option value="capacity-asc">Remaining places: lowest</option>
            <option value="capacity-desc">Remaining places: highest</option>
          </select>
        </div>

        <button
          v-if="hasFilters"
          class="button button--secondary session-register__clear"
          type="button"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </fieldset>

      <div v-if="registerPage.rows.length" class="session-register__content">
        <ul class="session-register__cards" aria-label="Activity Sessions results">
          <li v-for="session in registerPage.rows" :key="session.id" class="surface">
            <div class="session-register__card-heading">
              <div>
                <p class="eyebrow">{{ formatSessionStatus(session.status) }}</p>
                <h3>{{ session.activityTitle }}</h3>
              </div>
              <span class="session-register__readonly">Read-only</span>
            </div>

            <dl>
              <div>
                <dt>Date &amp; time</dt>
                <dd>
                  {{ formatSessionDate(session.startsAt) }}<br />
                  {{ formatSessionTime(session.startsAt, session.endsAt) }}
                </dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{{ session.venueName }}, {{ session.suburb }} {{ session.postcode }}</dd>
              </div>
              <div>
                <dt>Capacity</dt>
                <dd v-if="hasKnownCapacity(session)">
                  {{ session.bookedCount }}/{{ session.capacity }} booked ·
                  {{ getRemainingCapacity(session) }} remaining
                </dd>
                <dd v-else>{{ unknownCapacityLabel(session) }}</dd>
              </div>
              <div>
                <dt>Waitlist</dt>
                <dd>{{ waitlistLabel(session) }}</dd>
              </div>
            </dl>
          </li>
        </ul>

        <div class="session-register__table-wrap surface">
          <table>
            <caption>
              Current TurnAgain activity sessions
            </caption>
            <thead>
              <tr>
                <th :aria-sort="sortDirection('activity')" scope="col">
                  <button type="button" @click="toggleSort('activity')">
                    Activity <span aria-hidden="true">{{ sortIndicator('activity') }}</span>
                  </button>
                </th>
                <th :aria-sort="sortDirection('date')" scope="col">
                  <button type="button" @click="toggleSort('date')">
                    Date &amp; time <span aria-hidden="true">{{ sortIndicator('date') }}</span>
                  </button>
                </th>
                <th scope="col">Location</th>
                <th :aria-sort="sortDirection('capacity')" scope="col">
                  <button type="button" @click="toggleSort('capacity')">
                    Capacity <span aria-hidden="true">{{ sortIndicator('capacity') }}</span>
                  </button>
                </th>
                <th scope="col">Waitlist</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="session in registerPage.rows" :key="session.id">
                <th scope="row">{{ session.activityTitle }}</th>
                <td class="session-register__number">
                  {{ formatSessionDate(session.startsAt) }}<br />
                  {{ formatSessionTime(session.startsAt, session.endsAt) }}
                </td>
                <td>{{ session.venueName }}, {{ session.suburb }} {{ session.postcode }}</td>
                <td class="session-register__number">
                  <template v-if="hasKnownCapacity(session)">
                    {{ session.bookedCount }}/{{ session.capacity }} booked<br />
                    {{ getRemainingCapacity(session) }} remaining
                  </template>
                  <template v-else>{{ unknownCapacityLabel(session) }}</template>
                </td>
                <td class="session-register__number">{{ waitlistLabel(session) }}</td>
                <td>
                  <span class="session-register__status">
                    {{ formatSessionStatus(session.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="state-panel">
        <div>
          <h3>
            {{ hasFilters ? 'No sessions match these filters' : 'No sessions published yet' }}
          </h3>
          <p v-if="hasFilters">Clear one or more filters to return to the complete register.</p>
          <p v-else>
            No verified Activity Session record is available in Firestore for this environment.
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

      <nav class="session-register__pagination" aria-label="Activity Sessions pages">
        <button
          class="button button--secondary"
          type="button"
          :disabled="registerPage.page === 1"
          @click="updatePage(registerPage.page - 1)"
        >
          Previous
        </button>
        <p aria-live="polite">
          <span>
            Showing {{ registerPage.pageStart }}–{{ registerPage.pageEnd }} of
            {{ registerPage.totalResults }}
          </span>
          <span>Page {{ registerPage.page }} of {{ registerPage.totalPages }}</span>
        </p>
        <button
          class="button button--secondary"
          type="button"
          :disabled="registerPage.page === registerPage.totalPages"
          @click="updatePage(registerPage.page + 1)"
        >
          Next
        </button>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.session-register {
  display: grid;
  gap: 1.25rem;
  margin-top: 2rem;
}

.session-register__header {
  display: grid;
  gap: 1rem;
}

.session-register__intro {
  max-width: 50rem;
  margin: 0.65rem 0 0;
  color: var(--color-text-muted);
}

.session-register__summary {
  color: var(--color-heading);
  font-size: 1.1rem;
  font-weight: 800;
}

.session-register__error {
  border-left: 4px solid var(--color-danger);
}

.session-register__controls {
  display: grid;
  min-width: 0;
  gap: 1rem;
  margin: 0;
}

.session-register__field {
  display: grid;
  gap: 0.35rem;
}

.session-register__field label {
  color: var(--color-heading);
  font-weight: 750;
}

.session-register__clear {
  align-self: end;
}

.session-register__content {
  min-width: 0;
}

.session-register__cards {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.session-register__cards > li {
  padding: 1rem;
}

.session-register__card-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.session-register__card-heading h3 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.1rem;
}

.session-register__readonly,
.session-register__status {
  display: inline-flex;
  border: 1px solid var(--color-brand);
  border-radius: 999px;
  background: var(--color-brand-soft);
  padding: 0.2rem 0.55rem;
  color: var(--color-brand-strong);
  font-size: 0.8rem;
  font-weight: 750;
  white-space: nowrap;
}

.session-register__cards dl {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0 0;
}

.session-register__cards dl > div {
  display: grid;
  grid-template-columns: minmax(7rem, 0.35fr) minmax(0, 1fr);
  gap: 0.75rem;
  border-top: 1px solid var(--color-border);
  padding-top: 0.65rem;
}

.session-register__cards dt {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: 750;
}

.session-register__cards dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.session-register__table-wrap {
  display: none;
  overflow-x: auto;
}

.session-register table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
}

.session-register caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.session-register th,
.session-register td {
  border-bottom: 1px solid var(--color-border);
  padding: 0.8rem;
  text-align: left;
  vertical-align: middle;
}

.session-register thead th {
  background: var(--color-surface-muted);
  color: var(--color-heading);
  font-size: 0.85rem;
  white-space: nowrap;
}

.session-register tbody th {
  max-width: 17rem;
  color: var(--color-heading);
  font-weight: 750;
}

.session-register tbody tr:last-child th,
.session-register tbody tr:last-child td {
  border-bottom: 0;
}

.session-register thead button {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  border-radius: var(--radius-small);
  background: transparent;
  color: inherit;
  padding: 0.35rem;
  font-weight: inherit;
}

.session-register thead button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
}

.session-register__number,
.session-register__pagination {
  font-variant-numeric: tabular-nums;
}

.session-register__pagination {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
}

.session-register__pagination p {
  display: grid;
  grid-column: 1 / -1;
  grid-row: 1;
  gap: 0.1rem;
  margin: 0;
  color: var(--color-text-muted);
  text-align: center;
}

.session-register__pagination button:last-child {
  grid-column: 2;
}

.session-register__pagination button:disabled {
  cursor: not-allowed;
}

@media (min-width: 576px) {
  .session-register__header {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  .session-register__summary {
    text-align: right;
  }

  .session-register__controls,
  .session-register__cards dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .session-register__field--wide {
    grid-column: 1 / -1;
  }

  .session-register__pagination {
    display: flex;
    justify-content: space-between;
  }

  .session-register__pagination p {
    display: flex;
    flex-direction: column;
    grid-column: auto;
    grid-row: auto;
  }
}

@media (min-width: 768px) {
  .session-register__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
  }

  .session-register__field--wide {
    grid-column: 1 / -1;
  }

  .session-register__mobile-sort {
    grid-column: auto;
  }

  .session-register__clear {
    grid-column: auto;
    grid-row: auto;
  }

  .session-register__cards {
    display: none;
  }

  .session-register__table-wrap {
    display: block;
  }
}

@media (min-width: 1200px) {
  .session-register__controls {
    grid-template-columns: minmax(17rem, 1.35fr) repeat(3, minmax(10rem, 0.65fr)) auto;
  }

  .session-register__field--wide {
    grid-column: auto;
  }

  .session-register__mobile-sort {
    grid-column: auto;
  }

  .session-register__clear {
    grid-column: auto;
    grid-row: auto;
  }
}
</style>
