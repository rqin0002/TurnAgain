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
import { buildActivitySessionPage } from '../domain/staffRegisters.js'
import '../styles/register.css'

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
const resultMotion = computed(() => ({
  key: registerPage.value.rows.map((row) => row.id).join('|'),
  quietKey:
    props.criteria.search || props.criteria.location
      ? JSON.stringify([props.criteria.search, props.criteria.location])
      : '',
}))
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
  <section class="register session-register" aria-labelledby="session-register-heading">
    <header v-motion.fade class="register__header">
      <div>
        <p class="eyebrow">Operational schedule</p>
        <h2 id="session-register-heading" class="section-title">Activity Sessions</h2>
      </div>
      <output
        v-if="status === 'ready'"
        class="register__summary register__count"
        aria-live="polite"
      >
        {{ resultLabel }}
      </output>
    </header>

    <div v-if="status === 'loading' || status === 'idle'" class="state-panel" role="status">
      <div>
        <h3>Loading Activity Sessions</h3>
        <p>Reading the current staff-visible session register…</p>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="state-panel register__error" role="alert">
      <div>
        <h3>Activity Sessions unavailable</h3>
        <p>{{ errorMessage }}</p>
        <button class="button button--primary" type="button" @click="retry">Try again</button>
      </div>
    </div>

    <template v-else>
      <fieldset class="register__controls">
        <legend class="visually-hidden">Filter activity sessions</legend>

        <div class="register__field register__field--wide">
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

        <div class="register__field">
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

        <div class="register__field">
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

        <div class="register__field">
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
          class="button button--secondary register__clear"
          type="button"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </fieldset>

      <div v-if="registerPage.rows.length" class="register__content">
        <ul
          v-motion:results.fade="resultMotion"
          class="register__cards"
          aria-label="Activity Sessions results"
        >
          <li v-for="session in registerPage.rows" :key="session.id">
            <div class="register__card-heading">
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

        <div
          class="register__table-wrap"
          role="region"
          aria-label="Activity Sessions table"
          tabindex="0"
        >
          <table>
            <caption class="visually-hidden">
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
                <th class="register__compact-cell" scope="col">Status</th>
              </tr>
            </thead>
            <tbody v-motion:results.fade="resultMotion">
              <tr v-for="session in registerPage.rows" :key="session.id">
                <th scope="row">{{ session.activityTitle }}</th>
                <td class="register__number">
                  {{ formatSessionDate(session.startsAt) }}<br />
                  {{ formatSessionTime(session.startsAt, session.endsAt) }}
                </td>
                <td>{{ session.venueName }}, {{ session.suburb }} {{ session.postcode }}</td>
                <td class="register__number">
                  <template v-if="hasKnownCapacity(session)">
                    {{ session.bookedCount }}/{{ session.capacity }} booked<br />
                    {{ getRemainingCapacity(session) }} remaining
                  </template>
                  <template v-else>{{ unknownCapacityLabel(session) }}</template>
                </td>
                <td class="register__number">{{ waitlistLabel(session) }}</td>
                <td class="register__compact-cell">
                  <span class="register__status">
                    {{ formatSessionStatus(session.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else v-motion:results.fade="resultMotion" class="state-panel">
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

      <nav class="register__pagination" aria-label="Activity Sessions pages">
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
.session-register__readonly {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
</style>
