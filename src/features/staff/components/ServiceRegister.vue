<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useSearchDraft } from '../../../composables/useSearchDraft.js'
import { formatActionType, formatCheckedDate } from '../../discovery/domain/servicePresentation.js'
import { buildServiceRegisterPage } from '../domain/staffRegisters.js'

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
  services: {
    type: Array,
    required: true,
  },
  metadata: {
    type: Object,
    default: () => ({}),
  },
  errorMessage: {
    type: String,
    default: '',
  },
  criteria: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits({
  retry: null,
  'update:criteria': (value) => typeof value === 'object' && value !== null,
})

const registerPage = computed(() => buildServiceRegisterPage(props.services, props.criteria))
const hasFilters = computed(() =>
  Boolean(props.criteria.search || props.criteria.action || props.criteria.location),
)

const resultLabel = computed(() => {
  const count = registerPage.value.totalResults
  return `${count} ${count === 1 ? 'listing' : 'listings'}`
})

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
    action: '',
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
  <section class="service-register" aria-labelledby="service-register-heading">
    <header class="service-register__header">
      <div>
        <p class="eyebrow">Published catalogue</p>
        <h2 id="service-register-heading" class="section-title">Service Register</h2>
      </div>

      <div v-if="status === 'ready'" class="service-register__summary">
        <output aria-live="polite">{{ resultLabel }}</output>
        <span v-if="metadata.checkedAt">
          Catalogue checked {{ formatCheckedDate(metadata.checkedAt) }}
        </span>
      </div>
    </header>

    <div v-if="status === 'loading' || status === 'idle'" class="state-panel" role="status">
      <span class="service-register__loader" aria-hidden="true"></span>
      <div>
        <h3>Loading the Service Register</h3>
        <p>Reading the current published catalogue…</p>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="state-panel service-register__error" role="alert">
      <div>
        <h3>Service Register unavailable</h3>
        <p>{{ errorMessage }}</p>
        <button class="button button--primary" type="button" @click="$emit('retry')">
          Try again
        </button>
      </div>
    </div>

    <template v-else>
      <fieldset class="surface surface--padded service-register__controls">
        <legend class="service-register__visually-hidden">Filter services</legend>
        <div class="service-register__field service-register__field--wide">
          <label for="staff-service-search">Search all columns</label>
          <input
            id="staff-service-search"
            class="form-control"
            name="service-search"
            type="search"
            autocomplete="off"
            maxlength="100"
            placeholder="Search names, items, or sources…"
            :value="searchInput.draft.value"
            @input="searchInput.onInput"
            @compositionstart="searchInput.onCompositionStart"
            @compositionend="searchInput.onCompositionEnd"
          />
        </div>

        <div class="service-register__field">
          <label for="staff-action-filter">Action</label>
          <select
            id="staff-action-filter"
            class="form-control"
            name="action-filter"
            autocomplete="off"
            :value="criteria.action"
            @change="updateFilters({ action: $event.target.value })"
          >
            <option value="">All actions</option>
            <option value="repair">Repair</option>
            <option value="reuse">Reuse or donate</option>
            <option value="recycle">Recycle</option>
          </select>
        </div>

        <div class="service-register__field">
          <label for="staff-location-filter">Location column</label>
          <input
            id="staff-location-filter"
            class="form-control"
            name="location-filter"
            type="search"
            autocomplete="off"
            maxlength="100"
            placeholder="Suburb or postcode…"
            :value="locationInput.draft.value"
            @input="locationInput.onInput"
            @compositionstart="locationInput.onCompositionStart"
            @compositionend="locationInput.onCompositionEnd"
          />
        </div>

        <div class="service-register__field service-register__mobile-sort">
          <label for="staff-sort">Sort</label>
          <select
            id="staff-sort"
            class="form-control"
            name="service-sort"
            autocomplete="off"
            :value="criteria.sort"
            @change="updateFilters({ sort: $event.target.value })"
          >
            <option value="name-asc">Service name: A–Z</option>
            <option value="name-desc">Service name: Z–A</option>
            <option value="location-asc">Location: A–Z</option>
            <option value="location-desc">Location: Z–A</option>
            <option value="checked-desc">Source checked: newest</option>
            <option value="checked-asc">Source checked: oldest</option>
          </select>
        </div>

        <button
          v-if="hasFilters"
          class="button button--secondary service-register__clear"
          type="button"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </fieldset>

      <div v-if="registerPage.rows.length" class="service-register__content">
        <ul class="service-register__cards" aria-label="Service Register results">
          <li v-for="service in registerPage.rows" :key="service.id" class="surface">
            <div class="service-register__card-heading">
              <div>
                <p class="eyebrow">Published</p>
                <h3>{{ service.name }}</h3>
              </div>
              <RouterLink
                :to="{ name: 'service-detail', params: { serviceId: service.id } }"
                :aria-label="`View public details for ${service.name}`"
              >
                View details
              </RouterLink>
            </div>

            <dl>
              <div>
                <dt>Action</dt>
                <dd>{{ service.actionTypes.map(formatActionType).join(', ') }}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{{ service.suburb }} {{ service.postcode }}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{{ service.source.organisation }}</dd>
              </div>
              <div>
                <dt>Source checked</dt>
                <dd>{{ formatCheckedDate(service.source.checkedAt) }}</dd>
              </div>
            </dl>
          </li>
        </ul>

        <div class="service-register__table-wrap surface">
          <table>
            <caption>
              Current published TurnAgain service listings
            </caption>
            <thead>
              <tr>
                <th :aria-sort="sortDirection('name')" scope="col">
                  <button type="button" @click="toggleSort('name')">
                    Service <span aria-hidden="true">{{ sortIndicator('name') }}</span>
                  </button>
                </th>
                <th scope="col">Action</th>
                <th :aria-sort="sortDirection('location')" scope="col">
                  <button type="button" @click="toggleSort('location')">
                    Location <span aria-hidden="true">{{ sortIndicator('location') }}</span>
                  </button>
                </th>
                <th scope="col">Source</th>
                <th :aria-sort="sortDirection('checked')" scope="col">
                  <button type="button" @click="toggleSort('checked', 'desc')">
                    Source checked
                    <span aria-hidden="true">{{ sortIndicator('checked') }}</span>
                  </button>
                </th>
                <th scope="col">Status</th>
                <th scope="col"><span class="service-register__visually-hidden">Action</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="service in registerPage.rows" :key="service.id">
                <th scope="row">{{ service.name }}</th>
                <td>{{ service.actionTypes.map(formatActionType).join(', ') }}</td>
                <td>{{ service.suburb }} {{ service.postcode }}</td>
                <td>{{ service.source.organisation }}</td>
                <td class="service-register__date">
                  {{ formatCheckedDate(service.source.checkedAt) }}
                </td>
                <td><span class="service-register__status">Published</span></td>
                <td>
                  <RouterLink
                    :to="{ name: 'service-detail', params: { serviceId: service.id } }"
                    :aria-label="`View public details for ${service.name}`"
                  >
                    View
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="state-panel service-register__empty">
        <div>
          <h3>
            {{ hasFilters ? 'No listings match these filters' : 'No listings published yet' }}
          </h3>
          <p v-if="hasFilters">
            Clear one or more filters to return to the published service register.
          </p>
          <p v-else>No published service record is available in the current catalogue.</p>
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

      <nav class="service-register__pagination" aria-label="Service Register pages">
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
.service-register {
  display: grid;
  gap: 1.25rem;
  margin-top: 2rem;
}

.service-register__header {
  display: grid;
  gap: 1rem;
}

.service-register__summary {
  display: grid;
  align-content: start;
  gap: 0.2rem;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.service-register__summary output {
  color: var(--color-heading);
  font-size: 1.1rem;
  font-weight: 800;
}

.service-register__controls {
  display: grid;
  min-width: 0;
  gap: 1rem;
  margin: 0;
}

.service-register__field {
  display: grid;
  gap: 0.35rem;
}

.service-register__field label {
  color: var(--color-heading);
  font-weight: 750;
}

.service-register__clear {
  align-self: end;
}

.service-register__loader {
  width: 1.5rem;
  height: 1.5rem;
  flex: 0 0 auto;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-brand);
  border-radius: 50%;
  animation: register-spin 0.8s linear infinite;
}

.service-register__error {
  border-left: 4px solid var(--color-danger);
}

.service-register__content {
  min-width: 0;
}

.service-register__cards {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.service-register__cards > li {
  padding: 1rem;
}

.service-register__card-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.service-register__card-heading h3 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.1rem;
}

.service-register__cards dl {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0 0;
}

.service-register__cards dl > div {
  display: grid;
  grid-template-columns: minmax(6.5rem, 0.38fr) minmax(0, 1fr);
  gap: 0.75rem;
  border-top: 1px solid var(--color-border);
  padding-top: 0.65rem;
}

.service-register__cards dt {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: 750;
}

.service-register__cards dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.service-register__table-wrap {
  display: none;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
}

caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

th,
td {
  border-bottom: 1px solid var(--color-border);
  padding: 0.8rem;
  text-align: left;
  vertical-align: middle;
}

thead th {
  background: var(--color-surface-muted);
  color: var(--color-heading);
  font-size: 0.85rem;
  white-space: nowrap;
}

tbody th {
  max-width: 17rem;
  color: var(--color-heading);
  font-weight: 750;
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
}

thead button {
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

thead button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
}

.service-register__date,
.service-register__pagination {
  font-variant-numeric: tabular-nums;
}

.service-register__status {
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

.service-register__pagination {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
}

.service-register__pagination p {
  display: grid;
  grid-column: 1 / -1;
  grid-row: 1;
  gap: 0.1rem;
  margin: 0;
  color: var(--color-text-muted);
  text-align: center;
}

.service-register__pagination button:last-child {
  grid-column: 2;
}

.service-register__pagination button:disabled {
  cursor: not-allowed;
}

.service-register__visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes register-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (min-width: 576px) {
  .service-register__header {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  .service-register__summary {
    text-align: right;
  }

  .service-register__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .service-register__field--wide {
    grid-column: 1 / -1;
  }

  .service-register__cards dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .service-register__pagination {
    display: flex;
    justify-content: space-between;
  }

  .service-register__pagination p {
    display: flex;
    flex-direction: column;
    grid-column: auto;
    grid-row: auto;
  }
}

@media (min-width: 768px) {
  .service-register__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
  }

  .service-register__field--wide {
    grid-column: 1 / -1;
  }

  .service-register__mobile-sort {
    grid-column: auto;
  }

  .service-register__clear {
    grid-column: auto;
    grid-row: auto;
  }

  .service-register__cards {
    display: none;
  }

  .service-register__table-wrap {
    display: block;
  }
}

@media (min-width: 1200px) {
  .service-register__controls {
    grid-template-columns: minmax(17rem, 1.35fr) repeat(3, minmax(10rem, 0.65fr)) auto;
  }

  .service-register__field--wide {
    grid-column: auto;
  }

  .service-register__mobile-sort {
    grid-column: auto;
  }

  .service-register__clear {
    grid-column: auto;
    grid-row: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .service-register__loader {
    animation: none;
    border-top-color: var(--color-border);
  }
}
</style>
