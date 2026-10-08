<script setup>
import '@/features/auth/styles/auth.css'

import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { useAuthForm } from '@/features/auth/composables/useAuthForm.js'
import { validateEmailChangeInput } from '@/features/auth/domain/authValidation.js'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { useServiceCatalogue } from '@/features/discovery/composables/useServiceCatalogue.js'
import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import ThemeSwitch from '@/shared/components/ThemeSwitch.vue'
import { describeError } from '@/shared/domain/errorCopy.js'

const authStore = useAuthStore()
// Saved services are looked up in the public catalogue. A saved copy paints first, then a
// forced network read replaces it when it succeeds. An id missing from a saved copy, a failed
// read, a truncated read or a read that skipped records it could not read is never reported as
// no longer listed; only a complete network read can say that (see unlistedState below).
const {
  status: catalogueStatus,
  services,
  freshness,
  truncated: catalogueTruncated,
  skippedCount: catalogueSkippedCount,
  error: catalogueError,
  revalidating,
  load: loadCatalogue,
  retry: retryCatalogue,
} = useServiceCatalogue({ autoLoad: false })
onMounted(() => void loadCatalogue({ force: true }))

const savedIds = computed(() => authStore.user?.savedServiceIds ?? [])
const savedServices = computed(() =>
  savedIds.value
    .map((id) => services.value.find((service) => service.id === id))
    .filter((service) => service !== undefined),
)
const unlistedCount = computed(() => savedIds.value.length - savedServices.value.length)
// What the page may say about saved ids the catalogue on screen lacks: "checking" while a saved
// copy is revalidated; "unconfirmed" when the read failed and Try again may help; "truncated"
// when the network read stopped at the catalogue's cap, and "unreadable" when it skipped records
// it could not read (a saved service may be one of them; reading again gives the same records,
// so neither offers Try again); "unlisted" only after a complete network read with no record
// skipped.
const unlistedState = computed(() => {
  if (unlistedCount.value === 0) return 'none'
  if (revalidating.value) return 'checking'
  if (catalogueError.value || freshness.value !== 'fresh') return 'unconfirmed'
  if (catalogueTruncated.value) return 'truncated'
  return catalogueSkippedCount.value > 0 ? 'unreadable' : 'unlisted'
})
const savedCountLabel = (count) => (count === 1 ? '1 saved service' : `${count} saved services`)
const unlistedNote = computed(() => {
  const count = unlistedCount.value
  if (unlistedState.value === 'none') return ''
  if (unlistedState.value === 'checking') return `Checking ${savedCountLabel(count)}…`
  if (unlistedState.value === 'unconfirmed') {
    return `${savedCountLabel(count)} can't be shown right now.`
  }
  if (unlistedState.value === 'truncated') {
    return `${savedCountLabel(count)} can't be checked because the catalogue was only partly loaded.`
  }
  if (unlistedState.value === 'unreadable') {
    return `${savedCountLabel(count)} can't be checked because some listings could not be read.`
  }
  return count === 1
    ? '1 saved service is no longer listed.'
    : `${count} saved services are no longer listed.`
})

// Try again leaves as soon as the read restarts (the note turns to "Checking…"), so focus moves
// first to the status line that stays mounted and announces the outcome, never to <body>.
const unlistedStatus = ref(null)
const retryUnlisted = () => {
  unlistedStatus.value?.focus()
  void retryCatalogue()
}

const removing = ref('')
const savedError = ref('')
const remove = async (serviceId) => {
  if (removing.value) {
    return
  }
  removing.value = serviceId
  savedError.value = ''
  try {
    await authStore.unsaveService(serviceId)
  } catch (error) {
    savedError.value = describeError(error)
  } finally {
    removing.value = ''
  }
}

const emailNotice = ref('')
const {
  values: emailValues,
  errors: emailErrors,
  summary: emailSummary,
  submitting: emailSubmitting,
  submit: submitEmailChange,
  reset: resetEmailChange,
} = useAuthForm({
  initial: { email: '' },
  validate: validateEmailChangeInput,
  submit: async (validated) => {
    await authStore.requestEmailChange(validated.email)
    // The confirmation sentence, with the address the link went to.
    emailNotice.value = `We sent a link to ${validated.email}. Your sign-in email changes when you open it; sign in again afterwards.`
    resetEmailChange()
  },
})

// The sent-link notice belongs to the previous submit; it goes before validation runs, so a
// refused address never shows the success line above its own error.
const onEmailSubmit = (event) => {
  emailNotice.value = ''
  return submitEmailChange(event)
}

const loggingOut = ref(false)
const logoutError = ref('')
const logOut = async () => {
  if (loggingOut.value) {
    return
  }
  loggingOut.value = true
  logoutError.value = ''
  try {
    // The store replaces the route to /login; nothing to navigate here.
    await authStore.logout()
  } catch (error) {
    logoutError.value = describeError(error)
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <section class="page-section">
    <div class="shell account-page">
      <header class="account-page__header">
        <h1 class="account-page__title">Your account</h1>
        <p class="account-page__lead">
          Your profile, saved services and sign-in email, in one place.
        </p>
      </header>

      <section class="account-page__profile" aria-labelledby="account-profile-heading">
        <h2 id="account-profile-heading">Profile</h2>
        <dl class="account-page__details">
          <div>
            <dt>Name</dt>
            <dd dir="auto">{{ authStore.user?.displayName }}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{{ authStore.user?.email }}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{{ authStore.user?.role }}</dd>
          </div>
        </dl>
      </section>

      <section class="account-page__section" aria-labelledby="account-bookings-heading">
        <h2 id="account-bookings-heading">Your bookings</h2>
        <p class="account-page__note">
          Bookings keep the email address they were made with. If you cancel and book again, the new
          booking uses your current sign-in email.
        </p>
        <RouterLink :to="{ name: 'my-bookings' }">View my bookings</RouterLink>
      </section>

      <section class="account-page__section" aria-labelledby="account-saved-heading">
        <h2 id="account-saved-heading">Saved services</h2>
        <p v-if="savedIds.length === 0" class="account-page__note">
          You have not saved any services yet.
        </p>
        <StatePanel
          v-else-if="catalogueStatus === 'loading' || catalogueStatus === 'idle'"
          variant="loading"
          title="Loading your saved services"
        />
        <StatePanel
          v-else-if="catalogueStatus === 'error'"
          variant="error"
          title="Couldn't load the catalogue"
          message="Your saved services are listed once the catalogue loads."
          retry-label="Try again"
          @retry="retryCatalogue"
        />
        <template v-else>
          <ul class="account-page__saved">
            <li v-for="service in savedServices" :key="service.id">
              <RouterLink :to="{ name: 'service-detail', params: { serviceId: service.id } }">
                {{ service.name }}
              </RouterLink>
              <span class="account-page__saved-place">{{ service.suburb }}</span>
              <AppButton
                variant="text"
                type="button"
                :busy="removing === service.id"
                :disabled="removing !== '' && removing !== service.id"
                @click="remove(service.id)"
              >
                Remove<span class="visually-hidden"> {{ service.name }}</span>
              </AppButton>
            </li>
          </ul>
          <p
            ref="unlistedStatus"
            class="account-page__note account-page__unlisted"
            role="status"
            tabindex="-1"
          >
            {{ unlistedNote }}
          </p>
          <AppButton
            v-if="unlistedState === 'unconfirmed'"
            variant="secondary"
            type="button"
            @click="retryUnlisted"
          >
            Try again
          </AppButton>
        </template>
        <p v-if="savedError" class="account-page__error" role="alert">{{ savedError }}</p>
      </section>

      <section class="account-page__section" aria-labelledby="account-appearance-heading">
        <h2 id="account-appearance-heading">Appearance</h2>
        <ThemeSwitch />
      </section>

      <section class="account-page__section" aria-labelledby="account-email-heading">
        <h2 id="account-email-heading">Change email</h2>
        <p class="account-page__note">
          We send a link to the new address. Your sign-in email changes when you open it; sign in
          again afterwards.
        </p>
        <form
          class="auth-form"
          novalidate
          :aria-busy="emailSubmitting"
          @submit.prevent="onEmailSubmit"
        >
          <p v-if="emailNotice" class="auth-form__summary auth-form__summary--info" role="status">
            {{ emailNotice }}
          </p>
          <p
            v-if="emailSummary"
            class="auth-form__summary"
            role="alert"
            tabindex="-1"
            data-form-summary
          >
            {{ emailSummary }}
          </p>
          <FormField
            id="account-new-email"
            label="New email address"
            :error="emailErrors.email"
            required
          >
            <template #default="{ control }">
              <input
                v-bind="control"
                v-model="emailValues.email"
                class="form-control"
                name="email"
                type="email"
                autocomplete="email"
                spellcheck="false"
                :disabled="authStore.emailSyncPending"
              />
            </template>
          </FormField>
          <AppButton
            variant="secondary"
            type="submit"
            :busy="emailSubmitting"
            :disabled="authStore.emailSyncPending"
          >
            Send the link
          </AppButton>
        </form>
      </section>

      <p v-if="logoutError" class="account-page__error" role="alert">{{ logoutError }}</p>
      <div class="account-page__actions">
        <AppButton variant="secondary" type="button" :busy="loggingOut" @click="logOut">
          Log out
        </AppButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.account-page {
  display: grid;
  max-width: 40rem;
  gap: 2rem;
}

.account-page__header {
  margin: 0;
}

.account-page__title {
  margin: 0;
  color: var(--color-heading);
  font-size: clamp(2rem, 4vw, 2.5rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.15;
}

.account-page__lead {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.account-page__profile,
.account-page__section {
  border-radius: var(--radius-medium);
  background: var(--color-surface-muted);
  padding: clamp(1.25rem, 4vw, 2rem);
}

.account-page h2 {
  margin: 0 0 1.25rem;
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.3;
}

.account-page__details {
  display: grid;
  margin: 0;
}

.account-page__details > div {
  display: grid;
  min-width: 0;
  gap: 0.375rem;
  padding-block: 1rem;
}

.account-page__details > div:first-child {
  padding-top: 0;
}

.account-page__details > div:last-child {
  padding-bottom: 0;
}

.account-page__details > div + div {
  border-top: 1px solid var(--color-border);
}

.account-page__details dt {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  font-weight: 400;
}

.account-page__details dd {
  min-width: 0;
  margin: 0;
  color: var(--color-heading);
  font-weight: 500;
  overflow-wrap: anywhere;
}

.account-page__saved {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.account-page__saved li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 1rem;
  padding-block: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.account-page__saved li:first-child {
  border-top: 0;
}

.account-page__saved a {
  min-width: 0;
  color: var(--color-link);
  font-weight: 600;
}

.account-page__saved-place {
  flex: 1 1 auto;
  color: var(--color-text-muted);
}

.account-page__note {
  margin: 0 0 1rem;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.account-page__unlisted:empty {
  margin: 0;
}

.account-page__actions {
  display: flex;
}

.account-page__error {
  margin: 1rem 0 0;
  border-radius: var(--radius-small);
  background: var(--color-danger-soft);
  padding: 0.875rem 1rem;
  color: var(--color-danger);
}

@media (min-width: 576px) {
  .account-page__details > div {
    grid-template-columns: 6rem minmax(0, 1fr);
    align-items: baseline;
    gap: 1.5rem;
  }
}
</style>
