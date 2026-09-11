<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useSearchDraft } from '../../../composables/useSearchDraft.js'
import { formatActionType, formatCheckedDate } from '../../discovery/domain/servicePresentation.js'
import { buildServiceRegisterPage } from '../domain/staffRegisters.js'
import '../styles/register.css'

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
const resultMotion = computed(() => ({
  key: registerPage.value.rows.map((row) => row.id).join('|'),
  quietKey:
    props.criteria.search || props.criteria.location
      ? JSON.stringify([props.criteria.search, props.criteria.location])
      : '',
}))
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
  <section class="register service-register" aria-labelledby="service-register-heading">
    <header v-motion.fade class="register__header">
      <div>
        <p class="eyebrow">Published catalogue</p>
        <h2 id="service-register-heading" class="section-title">Service Register</h2>
      </div>

      <div v-if="status === 'ready'" class="register__summary">
        <output class="register__count" aria-live="polite">{{ resultLabel }}</output>
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

    <div v-else-if="status === 'error'" class="state-panel register__error" role="alert">
      <div>
        <h3>Service Register unavailable</h3>
        <p>{{ errorMessage }}</p>
        <button class="button button--primary" type="button" @click="$emit('retry')">
          Try again
        </button>
      </div>
    </div>

    <template v-else>
      <fieldset class="register__controls">
        <legend class="visually-hidden">Filter services</legend>
        <div class="register__field register__field--wide">
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

        <div class="register__field">
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

        <div class="register__field">
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

        <div class="register__field">
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
          aria-label="Service Register results"
        >
          <li v-for="service in registerPage.rows" :key="service.id">
            <div class="register__card-heading">
              <div>
                <p class="eyebrow">Published</p>
                <h3>{{ service.name }}</h3>
              </div>
              <RouterLink
                class="service-register__detail-link"
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

        <div
          class="register__table-wrap"
          role="region"
          aria-label="Service Register table"
          tabindex="0"
        >
          <table>
            <caption class="visually-hidden">
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
                <th class="register__compact-cell" scope="col">Status</th>
                <th class="register__compact-cell service-register__actions" scope="col">
                  Details
                </th>
              </tr>
            </thead>
            <tbody v-motion:results.fade="resultMotion">
              <tr v-for="service in registerPage.rows" :key="service.id">
                <th scope="row">{{ service.name }}</th>
                <td>{{ service.actionTypes.map(formatActionType).join(', ') }}</td>
                <td>{{ service.suburb }} {{ service.postcode }}</td>
                <td>{{ service.source.organisation }}</td>
                <td class="register__number">
                  {{ formatCheckedDate(service.source.checkedAt) }}
                </td>
                <td class="register__compact-cell">
                  <span class="register__status">Published</span>
                </td>
                <td class="register__compact-cell service-register__actions">
                  <RouterLink
                    class="service-register__detail-link"
                    :to="{ name: 'service-detail', params: { serviceId: service.id } }"
                    :aria-label="`View public details for ${service.name}`"
                  >
                    View details
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else v-motion:results.fade="resultMotion" class="state-panel">
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

      <nav class="register__pagination" aria-label="Service Register pages">
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
.service-register__actions a {
  font-weight: 500;
}

.service-register__detail-link {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
}

.service-register__loader {
  width: 1.5rem;
  height: 1.5rem;
  flex: 0 0 auto;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-brand);
  border-radius: 50%;
  animation: register-spin 0.8s linear infinite;
}

@keyframes register-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .service-register__loader {
    animation: none;
  }
}
</style>
