<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useServiceCatalogue } from '../features/discovery/composables/useServiceCatalogue.js'
import ActivitySessionRegister from '../features/staff/components/ActivitySessionRegister.vue'
import ServiceRegister from '../features/staff/components/ServiceRegister.vue'
import {
  normalizeActivitySessionCriteria,
  normalizeServiceRegisterCriteria,
  toActivitySessionQuery,
  toServiceRegisterQuery,
} from '../features/staff/domain/staffRegisters.js'

const route = useRoute()
const router = useRouter()
const { status, services, metadata, errorMessage, retry } = useServiceCatalogue()

const activeRegister = computed(() => (route.query.view === 'sessions' ? 'sessions' : 'services'))
const serviceCriteria = computed(() => normalizeServiceRegisterCriteria(route.query))
// Session URL keys are prefixed; pass them explicitly so service filters cannot
// leak through the normalizer's component-state aliases (location, page, sort).
const sessionCriteria = computed(() =>
  normalizeActivitySessionCriteria({
    search: route.query.sq,
    status: route.query.sstatus,
    location: route.query.slocation,
    sort: route.query.ssort,
    page: route.query.spage,
  }),
)

const buildWorkspaceQuery = ({ panel = activeRegister.value, service, session } = {}) => ({
  ...(panel === 'sessions' ? { view: 'sessions' } : {}),
  ...toServiceRegisterQuery(service ?? serviceCriteria.value),
  ...toActivitySessionQuery(session ?? sessionCriteria.value),
})

// URL-backed operational state survives refresh, Back navigation, and a shared
// staff link without persisting catalogue criteria in a global store.
const updateServiceCriteria = (nextCriteria) =>
  router.replace({
    name: 'staff',
    query: buildWorkspaceQuery({ panel: 'services', service: nextCriteria }),
  })

const updateSessionCriteria = (nextCriteria) =>
  router.replace({
    name: 'staff',
    query: buildWorkspaceQuery({ panel: 'sessions', session: nextCriteria }),
  })
</script>

<template>
  <section class="page-section">
    <div class="shell staff-page">
      <header class="staff-page__intro">
        <p class="eyebrow">TurnAgain / Staff</p>
        <h1 class="page-title">Staff workspace</h1>
        <p class="staff-page__description">Browse the service catalogue and activity schedule.</p>
      </header>

      <nav class="staff-page__register-nav" aria-label="Staff registers">
        <RouterLink
          :to="{ name: 'staff', query: buildWorkspaceQuery({ panel: 'services' }) }"
          :aria-current="activeRegister === 'services' ? 'page' : undefined"
        >
          Service Register
        </RouterLink>
        <RouterLink
          :to="{ name: 'staff', query: buildWorkspaceQuery({ panel: 'sessions' }) }"
          :aria-current="activeRegister === 'sessions' ? 'page' : undefined"
        >
          Activity Sessions
        </RouterLink>
      </nav>

      <ServiceRegister
        v-if="activeRegister === 'services'"
        :status="status"
        :services="services"
        :metadata="metadata"
        :error-message="errorMessage"
        :criteria="serviceCriteria"
        @retry="retry"
        @update:criteria="updateServiceCriteria"
      />

      <ActivitySessionRegister
        v-else
        :criteria="sessionCriteria"
        @update:criteria="updateSessionCriteria"
      />
    </div>
  </section>
</template>

<style scoped>
.staff-page__intro {
  max-width: 48rem;
}

.staff-page__intro .page-title {
  font-weight: 650;
  letter-spacing: -0.035em;
}

.staff-page__intro .eyebrow {
  color: var(--color-text-muted);
}

.staff-page__description {
  margin: 1rem 0 0;
  color: var(--color-text-muted);
  font-size: 1.0625rem;
}

.staff-page__register-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 2rem;
  margin-top: clamp(2rem, 4vw, 3rem);
  border-bottom: 1px solid var(--color-border);
}

.staff-page__register-nav a {
  display: inline-flex;
  min-height: 3.25rem;
  align-items: center;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 0.75rem 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  font-weight: 600;
  text-decoration: none;
}

.staff-page__register-nav a:hover,
.staff-page__register-nav a[aria-current='page'] {
  border-bottom-color: var(--color-brand);
  color: var(--color-brand);
}

@media (max-width: 420px) {
  .staff-page__register-nav {
    gap: 0.25rem 1.25rem;
  }

  .staff-page__register-nav a {
    font-size: 0.875rem;
  }
}
</style>
