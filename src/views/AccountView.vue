<script setup>
import '@/features/auth/styles/auth.css'

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { useAuthForm } from '@/features/auth/composables/useAuthForm.js'
import {
  PASSWORD_RULE,
  validateEmailChangeInput,
  validatePasswordChangeInput,
} from '@/features/auth/domain/authValidation.js'
import { describePasswordChangeFailure } from '@/features/auth/domain/passwordChangeCopy.js'
import { useAuthStore } from '@/features/auth/stores/authStore.js'
import { useServiceCatalogue } from '@/features/discovery/composables/useServiceCatalogue.js'
import AppButton from '@/shared/components/AppButton.vue'
import FormField from '@/shared/components/FormField.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import ThemeSwitch from '@/shared/components/ThemeSwitch.vue'
import { describeError } from '@/shared/domain/errorCopy.js'

/**
 * The account centre of a signed-in person: who is signed in (with Log out), a member's way to
 * their bookings, their saved services, the sign-in email and password, and the appearance setting.
 * Email and password show their current state and open an edit form in place only when asked;
 * every change goes through the auth store, which alone talks to Firebase Auth.
 */
const authStore = useAuthStore()

const ROLE_LABELS = Object.freeze({ member: 'Member', staff: 'Staff', admin: 'Admin' })
// The role is shown as a label only; this page offers no way to change it.
const roleLabel = computed(() => ROLE_LABELS[authStore.user?.role] ?? authStore.user?.role ?? '')
// Bookings are made from member accounts, so a staff or admin account has no bookings area here:
// any booking it made earlier stays stored and is not shown (its routes refuse it too).
const isMember = computed(() => authStore.user?.role === 'member')
// The first character of the name for the round badge; Array.from keeps an emoji or an accented
// letter whole.
const initial = computed(
  () => Array.from((authStore.user?.displayName ?? '').trim())[0]?.toLocaleUpperCase() ?? '',
)

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

/** Moves focus once the DOM shows the element, so focus never falls back to <body>. */
const focusById = async (id) => {
  await nextTick()
  document.getElementById(id)?.focus()
}

/**
 * Runs one auth request for the account on screen. Resolves true when it succeeded for that
 * account, false when another account (or none) holds the page by the time it settles; a
 * failure then is dropped too, because it belongs to the previous account. Any other failure
 * rejects as the request did.
 */
const forThisAccount = async (request) => {
  const uid = authStore.user?.uid
  try {
    await request()
  } catch (error) {
    if (authStore.user?.uid !== uid) {
      return false
    }
    throw error
  }
  return authStore.user?.uid === uid
}

// Email and password follow the WAI-ARIA disclosure pattern: the toggle reports aria-expanded,
// opening moves focus to the first field, Cancel or Escape closes and focus that was inside the
// panel returns to the toggle. Closing drops everything typed. The result lines sit outside the
// panels and stay mounted with empty text, so a closed panel never takes its outcome with it and
// assistive technology already watches each line when its text arrives. While a request is on
// its way, Cancel, Escape and the toggle do nothing, so a request is never abandoned on screen.

const emailOpen = ref(false)
const emailPanel = ref(null)
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
    if (!(await forThisAccount(() => authStore.requestEmailChange(validated.email)))) {
      return
    }
    // The confirmation sentence, with the address the link went to.
    emailNotice.value = `We sent a link to ${validated.email}. Your sign-in email changes when you open it; sign in again afterwards.`
    closeEmailPanel()
  },
})

const openEmailPanel = () => {
  emailNotice.value = ''
  resetEmailChange()
  emailOpen.value = true
  void focusById('account-new-email')
}
const closeEmailPanel = () => {
  const focusInside = emailPanel.value?.contains(document.activeElement) === true
  resetEmailChange()
  emailOpen.value = false
  if (focusInside) {
    void focusById('account-email-toggle')
  }
}
const cancelEmail = () => {
  if (!emailSubmitting.value) {
    closeEmailPanel()
  }
}
const toggleEmail = () => (emailOpen.value ? cancelEmail() : openEmailPanel())

const PASSWORD_CHANGED =
  'Your password has been changed. You are still signed in here; use the new password the next time you sign in.'

const passwordOpen = ref(false)
const passwordPanel = ref(null)
const passwordNotice = ref('')
const resetError = ref('')
const resetSending = ref(false)
const {
  values: passwordValues,
  errors: passwordErrors,
  summary: passwordSummary,
  submitting: passwordSubmitting,
  submit: submitPasswordChange,
  reset: resetPasswordChange,
} = useAuthForm({
  initial: { currentPassword: '', newPassword: '', passwordConfirmation: '' },
  validate: validatePasswordChangeInput,
  describeFailure: describePasswordChangeFailure,
  // The validator returns no password; the typed values go straight to the store and nowhere else.
  submit: async (_validated, raw) => {
    let changed
    try {
      changed = await forThisAccount(() =>
        authStore.changePassword({
          currentPassword: raw.currentPassword,
          newPassword: raw.newPassword,
        }),
      )
    } catch (error) {
      if (error?.code === 'invalid-credentials') {
        passwordErrors.currentPassword = 'This is not your current password.'
      }
      throw error
    }
    if (!changed) {
      return
    }
    passwordNotice.value = PASSWORD_CHANGED
    closePasswordPanel()
  },
})

// A result line belongs to the previous attempt; it goes before the next one starts.
const onPasswordSubmit = (event) => {
  passwordNotice.value = ''
  resetError.value = ''
  return submitPasswordChange(event)
}

const openPasswordPanel = () => {
  passwordNotice.value = ''
  resetError.value = ''
  resetPasswordChange()
  passwordOpen.value = true
  void focusById('account-current-password')
}
const closePasswordPanel = () => {
  const focusInside = passwordPanel.value?.contains(document.activeElement) === true
  resetPasswordChange()
  passwordOpen.value = false
  if (focusInside) {
    void focusById('account-password-toggle')
  }
}
const cancelPassword = () => {
  if (!passwordSubmitting.value) {
    closePasswordPanel()
  }
}
const togglePassword = () => (passwordOpen.value ? cancelPassword() : openPasswordPanel())

// "Forgot your current password?": the reset email goes to the signed-in address from this page,
// because the forgot-password page is for signed-out visitors. Sending it changes nothing yet.
const sendReset = async () => {
  if (resetSending.value) {
    return
  }
  const email = authStore.user?.email ?? ''
  resetSending.value = true
  passwordNotice.value = ''
  resetError.value = ''
  try {
    if (await forThisAccount(() => authStore.requestPasswordReset(email))) {
      passwordNotice.value = `We sent a password reset link to ${email}. Your password has not changed; it changes only if you choose a new one from that link.`
    }
  } catch (error) {
    resetError.value = describeError(error)
  } finally {
    resetSending.value = false
  }
}

// Another account signed in here, or this one signed out: nothing typed or reported for the
// previous account stays on the page.
watch(
  () => authStore.user?.uid,
  () => {
    closeEmailPanel()
    closePasswordPanel()
    emailNotice.value = ''
    passwordNotice.value = ''
    resetError.value = ''
  },
)

// Leaving the page drops anything typed with the forms' state.
onBeforeUnmount(() => {
  resetEmailChange()
  resetPasswordChange()
})

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
          {{ isMember ? 'Your bookings, saved services' : 'Your saved services' }}, sign-in details
          and appearance, in one place.
        </p>
      </header>

      <div class="account-page__layout">
        <div class="account-page__aside">
          <section class="account-identity" aria-labelledby="account-profile-heading">
            <h2 id="account-profile-heading" class="visually-hidden">Profile</h2>
            <span class="account-identity__avatar" aria-hidden="true">{{ initial }}</span>
            <div class="account-identity__text">
              <p class="account-identity__name" dir="auto">{{ authStore.user?.displayName }}</p>
              <p class="account-identity__email">{{ authStore.user?.email }}</p>
              <p class="account-identity__role">
                <span class="visually-hidden">Account type: </span>{{ roleLabel }}
              </p>
            </div>
            <div class="account-identity__actions">
              <AppButton variant="secondary" type="button" :busy="loggingOut" @click="logOut">
                Log out
              </AppButton>
              <p v-if="logoutError" class="account-page__error" role="alert">{{ logoutError }}</p>
            </div>
          </section>

          <section v-if="isMember" class="account-card" aria-labelledby="account-bookings-heading">
            <h2 id="account-bookings-heading">Your bookings</h2>
            <RouterLink
              class="button button--primary account-bookings__action"
              :to="{ name: 'my-bookings' }"
            >
              View my bookings
            </RouterLink>
            <p class="account-page__note account-bookings__note">
              Bookings keep the email address they were made with. If you cancel and book again, the
              new booking uses your current sign-in email.
            </p>
          </section>
        </div>

        <div class="account-page__main">
          <section class="account-card" aria-labelledby="account-saved-heading">
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
                    Remove <span class="visually-hidden">{{ service.name }}</span>
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

          <section class="account-card" aria-labelledby="account-security-heading">
            <h2 id="account-security-heading">Sign-in and security</h2>

            <div class="account-setting">
              <div class="account-setting__head">
                <div class="account-setting__summary">
                  <h3 id="account-email-heading" class="account-setting__title">Email</h3>
                  <p class="account-setting__value">{{ authStore.user?.email }}</p>
                </div>
                <AppButton
                  id="account-email-toggle"
                  variant="secondary"
                  type="button"
                  :aria-expanded="String(emailOpen)"
                  aria-controls="account-email-panel"
                  @click="toggleEmail"
                >
                  Change email
                </AppButton>
              </div>
              <p id="account-email-status" class="account-page__notice" role="status">
                {{ emailNotice }}
              </p>
              <div
                v-if="emailOpen"
                id="account-email-panel"
                ref="emailPanel"
                class="account-setting__panel"
                @keydown.esc="cancelEmail"
              >
                <p class="account-page__note">
                  We send a link to the new address. Your sign-in email changes when you open it;
                  sign in again afterwards.
                </p>
                <form
                  id="account-email-form"
                  class="auth-form"
                  novalidate
                  aria-labelledby="account-email-heading"
                  :aria-busy="emailSubmitting"
                  @submit.prevent="submitEmailChange"
                >
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
                  <div class="account-setting__actions">
                    <AppButton
                      variant="primary"
                      type="submit"
                      :busy="emailSubmitting"
                      :disabled="authStore.emailSyncPending"
                    >
                      Send the link
                    </AppButton>
                    <AppButton variant="secondary" type="button" @click="cancelEmail">
                      Cancel
                    </AppButton>
                  </div>
                </form>
              </div>
            </div>

            <div class="account-setting">
              <div class="account-setting__head">
                <div class="account-setting__summary">
                  <h3 id="account-password-heading" class="account-setting__title">Password</h3>
                  <p class="account-setting__value">Change the password you sign in with.</p>
                </div>
                <AppButton
                  id="account-password-toggle"
                  variant="secondary"
                  type="button"
                  :aria-expanded="String(passwordOpen)"
                  aria-controls="account-password-panel"
                  @click="togglePassword"
                >
                  Change password
                </AppButton>
              </div>
              <p id="account-password-status" class="account-page__notice" role="status">
                {{ passwordNotice }}
              </p>
              <p
                id="account-password-reset-error"
                class="account-page__notice account-page__notice--error"
                role="alert"
              >
                {{ resetError }}
              </p>
              <div
                v-if="passwordOpen"
                id="account-password-panel"
                ref="passwordPanel"
                class="account-setting__panel"
                @keydown.esc="cancelPassword"
              >
                <form
                  id="account-password-form"
                  class="auth-form"
                  novalidate
                  aria-labelledby="account-password-heading"
                  :aria-busy="passwordSubmitting"
                  @submit.prevent="onPasswordSubmit"
                >
                  <p
                    v-if="passwordSummary"
                    class="auth-form__summary"
                    role="alert"
                    tabindex="-1"
                    data-form-summary
                  >
                    {{ passwordSummary }}
                  </p>
                  <!-- Password managers file the new password under this account's sign-in email. -->
                  <input
                    type="email"
                    name="username"
                    autocomplete="username"
                    :value="authStore.user?.email ?? ''"
                    readonly
                    hidden
                  />
                  <FormField
                    id="account-current-password"
                    label="Current password"
                    :error="passwordErrors.currentPassword"
                    required
                  >
                    <template #default="{ control }">
                      <input
                        v-bind="control"
                        v-model="passwordValues.currentPassword"
                        class="form-control"
                        name="currentPassword"
                        type="password"
                        autocomplete="current-password"
                      />
                    </template>
                  </FormField>
                  <FormField
                    id="account-new-password"
                    label="New password"
                    :hint="PASSWORD_RULE"
                    :error="passwordErrors.newPassword"
                    required
                  >
                    <template #default="{ control }">
                      <input
                        v-bind="control"
                        v-model="passwordValues.newPassword"
                        class="form-control"
                        name="newPassword"
                        type="password"
                        autocomplete="new-password"
                      />
                    </template>
                  </FormField>
                  <FormField
                    id="account-confirm-password"
                    label="Confirm new password"
                    :error="passwordErrors.passwordConfirmation"
                    required
                  >
                    <template #default="{ control }">
                      <input
                        v-bind="control"
                        v-model="passwordValues.passwordConfirmation"
                        class="form-control"
                        name="passwordConfirmation"
                        type="password"
                        autocomplete="new-password"
                      />
                    </template>
                  </FormField>
                  <div class="account-setting__actions">
                    <AppButton variant="primary" type="submit" :busy="passwordSubmitting">
                      Save new password
                    </AppButton>
                    <AppButton variant="secondary" type="button" @click="cancelPassword">
                      Cancel
                    </AppButton>
                  </div>
                </form>
                <p class="account-setting__recovery">
                  <span>Forgot your current password?</span>
                  <AppButton
                    variant="text"
                    type="button"
                    :busy="resetSending"
                    :disabled="authStore.emailSyncPending"
                    @click="sendReset"
                  >
                    Email me a reset link
                  </AppButton>
                </p>
              </div>
            </div>
          </section>

          <section class="account-card" aria-labelledby="account-appearance-heading">
            <h2 id="account-appearance-heading">Appearance</h2>
            <p class="account-page__note">Your choice applies on this device.</p>
            <ThemeSwitch />
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* One column up to 992 px in reading order: who is signed in, bookings (member accounts only),
   saved services, sign-in and security, appearance. From 992 px the identity and the bookings
   form a narrow aside beside the rest. */
.account-page {
  display: grid;
  max-width: 46rem;
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

.account-page__layout,
.account-page__aside,
.account-page__main {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 1.5rem;
}

.account-page h2 {
  margin: 0 0 1.25rem;
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.3;
}

/* Who is signed in: the one tinted card, so it reads first. */
.account-identity {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem 1.25rem;
  border-radius: var(--radius-medium);
  background: var(--color-brand-soft);
  padding: clamp(1.25rem, 4vw, 1.75rem);
}

.account-identity__avatar {
  display: grid;
  width: 3.5rem;
  height: 3.5rem;
  place-items: center;
  border-radius: 50%;
  background: var(--color-brand);
  color: var(--color-on-brand);
  font-size: 1.5rem;
  font-weight: 600;
}

.account-identity__text {
  min-width: 0;
}

.account-identity__name {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.account-identity__email {
  margin: 0.25rem 0 0;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.account-identity__role {
  display: inline-block;
  margin: 0.625rem 0 0;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  padding: 0.125rem 0.625rem;
  color: var(--color-heading);
  font-size: 0.875rem;
  font-weight: 600;
}

.account-identity__actions {
  grid-column: 1 / -1;
  min-width: 0;
}

.account-identity__actions .button {
  width: 100%;
}

/* The secondary button's hover tint is this card's own background; the surface keeps it visible. */
.account-identity .button--secondary:hover {
  background: var(--color-surface);
}

.account-card {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: clamp(1.25rem, 4vw, 1.75rem);
}

.account-bookings__action {
  width: 100%;
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

.account-bookings__note {
  margin: 1rem 0 0;
  font-size: 0.9375rem;
}

.account-page__unlisted:empty {
  margin: 0;
}

.account-page__error {
  margin: 1rem 0 0;
  border-radius: var(--radius-small);
  background: var(--color-danger-soft);
  padding: 0.875rem 1rem;
  color: var(--color-danger);
}

/* A setting: what it is and its current value, the button that opens its form, the result line
   and, while open, the form on the muted panel colour. */
.account-setting + .account-setting {
  margin-top: 1.25rem;
  border-top: 1px solid var(--color-border);
  padding-top: 1.25rem;
}

.account-setting__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
}

.account-setting__summary {
  min-width: 0;
  flex: 1 1 14rem;
}

.account-setting__title {
  margin: 0;
  color: var(--color-heading);
  font-size: 1rem;
  font-weight: 600;
}

.account-setting__value {
  margin: 0.25rem 0 0;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.account-setting__panel {
  margin-top: 1rem;
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: clamp(1rem, 3vw, 1.5rem);
}

.account-setting__panel .auth-form {
  max-width: 28rem;
}

.account-setting__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.account-setting__recovery {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 0.25rem;
  margin: 1rem 0 0;
  color: var(--color-text-muted);
}

/* Result lines stay in the page with empty text, so assistive technology already watches them;
   they take no room until they have something to say. A long address in a line wraps inside the
   card instead of widening it. */
.account-page__notice {
  margin: 0;
  overflow-wrap: anywhere;
}

.account-page__notice:not(:empty) {
  margin-top: 1rem;
  border: 1px solid var(--color-brand);
  border-radius: var(--radius-small);
  background: var(--color-brand-soft);
  padding: 0.75rem;
  color: var(--color-brand-strong);
}

.account-page__notice--error:not(:empty) {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

@media (min-width: 576px) {
  .account-identity {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .account-identity__actions {
    grid-column: auto;
  }

  .account-identity__actions .button,
  .account-bookings__action {
    width: auto;
  }
}

@media (min-width: 992px) {
  .account-page {
    max-width: none;
  }

  .account-page__layout {
    grid-template-columns: minmax(15rem, 19rem) minmax(0, 1fr);
    align-items: start;
    gap: 2rem;
  }

  /* The aside is narrow again: the identity card stacks and its buttons fill the aside. */
  .account-identity {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .account-identity__actions {
    grid-column: 1 / -1;
  }

  .account-identity__actions .button,
  .account-bookings__action {
    width: 100%;
  }
}

@media (min-width: 1200px) {
  .account-page__layout {
    grid-template-columns: 20rem minmax(0, 1fr);
    gap: 2.5rem;
  }
}
</style>
