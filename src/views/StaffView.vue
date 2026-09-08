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
        <h1 class="page-title">Staff workspace</h1>
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

.staff-page__register-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.5rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.75rem;
}

.staff-page__register-nav a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-small);
  background: var(--color-surface);
  padding: 0.55rem 0.9rem;
  color: var(--color-text);
  font-weight: 750;
  text-decoration: none;
}

.staff-page__register-nav a:hover,
.staff-page__register-nav a[aria-current='page'] {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
}
</style>
