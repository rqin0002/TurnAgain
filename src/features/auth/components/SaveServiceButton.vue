<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import AppButton from '@/shared/components/AppButton.vue'
import { describeError } from '@/shared/domain/errorCopy.js'

/**
 * Saving one service to the signed-in person's Saved services, in two sizes that behave alike:
 * the default one in the Service Detail header, and `compact` on every result card (the Find
 * nearby lists and Home's Top rated).
 *
 * Signed in: a toggle button with `aria-pressed`, read from the user's savedServiceIds and
 * labelled "Save this place" or "Saved"; compact, "Save" or "Saved", with an accessible name that
 * adds the place ("Save Monash Repair Cafe", "Saved: Monash Repair Cafe"), so a list of cards
 * never offers several controls with one name. It saves or unsaves through the auth store, which
 * updates `user` in place (a saved-list change is not an identity change, so identityEpoch does
 * not move), so the card, the detail page and the Account page's Saved services list all read
 * the same ids. The button stays the same element while it is busy and after its label changes,
 * and nothing here moves focus or scrolls the page.
 *
 * Signed out: a link to the login page ("Sign in to save this place"; compact, "Sign in to save",
 * named "Sign in to save Monash Repair Cafe") whose `redirect` query is the current page's full
 * path, so the person comes back to this page, or to this list of results with its query (the
 * login page checks the path with resolveSafeRedirect). While the session is still restoring or
 * could not be read, nothing renders, so a signed-in person never sees the sign-in link flash.
 *
 * Components may not import a data module (an ESLint boundary rule), so a refused write is shown
 * through the shared describeError, in an alert that is mounted with the button and stays empty
 * until there is something to say.
 */
const props = defineProps({
  serviceId: { type: String, required: true },
  /**
   * The result card's size. Its wrapper draws no box of its own (`display: contents`), so the
   * parent's grid lays out the control, in the grid area named `save`, and the alert, which once
   * it has a message takes a row of its own across every column. The parent defines that area.
   */
  compact: { type: Boolean, default: false },
  /** The place's name, which ends the compact control's accessible name. */
  serviceName: { type: String, default: '' },
})

const authStore = useAuthStore()
const route = useRoute()

const signedIn = computed(() => authStore.status === 'signed-in')
const signedOut = computed(() => authStore.status === 'signed-out')
const isSaved = computed(() => authStore.user?.savedServiceIds?.includes(props.serviceId) === true)
const signInTarget = computed(() => ({ name: 'login', query: { redirect: route.fullPath } }))
const toggleLabel = computed(() => {
  if (isSaved.value) return 'Saved'
  return props.compact ? 'Save' : 'Save this place'
})
const signInLabel = computed(() =>
  props.compact ? 'Sign in to save' : 'Sign in to save this place',
)
// The compact control's accessible name: its visible label, then the place. An aria-label, not
// visually hidden text after the label: that text is laid out as a block of its own, and the
// browser then reads a space into the name ("Saved : Monash Repair Cafe").
const compactName = computed(() => {
  if (!props.compact) return undefined
  if (!signedIn.value) return `Sign in to save ${props.serviceName}`
  return isSaved.value ? `Saved: ${props.serviceName}` : `Save ${props.serviceName}`
})
const pending = ref(false)
const error = ref('')

const toggle = async () => {
  if (pending.value) {
    return
  }
  pending.value = true
  error.value = ''
  try {
    if (isSaved.value) {
      await authStore.unsaveService(props.serviceId)
    } else {
      await authStore.saveService(props.serviceId)
    }
  } catch (failure) {
    error.value = describeError(failure)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div v-if="signedIn" class="save-service" :class="{ 'save-service--compact': compact }">
    <AppButton
      class="save-service__control"
      variant="secondary"
      type="button"
      :busy="pending"
      :aria-pressed="isSaved ? 'true' : 'false'"
      :aria-label="compactName"
      @click="toggle"
    >
      {{ toggleLabel }}
    </AppButton>
    <p class="save-service__error" role="alert">{{ error }}</p>
  </div>
  <div v-else-if="signedOut" class="save-service" :class="{ 'save-service--compact': compact }">
    <RouterLink
      class="button button--secondary save-service__control"
      :to="signInTarget"
      :aria-label="compactName"
    >
      {{ signInLabel }}
    </RouterLink>
  </div>
</template>

<style scoped>
.save-service {
  display: grid;
  justify-items: start;
  gap: 0.5rem;
}

/* Saved reads as a pressed control without hovering it: the tinted fill and the brand border. */
.button[aria-pressed='true'] {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}

.save-service__error {
  margin: 0;
  color: var(--color-danger);
}

/* Never display: none, which would remove the live region; an empty alert only loses its space. */
.save-service__error:empty {
  display: block;
  height: 0;
  margin-top: -0.5rem;
}

/* Compact, on a result card: no box of its own, so the card's grid places the control and the
   alert. The control keeps a 44 px target at the card's fact size, starts its row when it has one
   to itself, and lets its label wrap rather than push a narrow card wider at a large text size. */
.save-service--compact {
  display: contents;
}

.save-service--compact .save-service__control {
  min-height: 2.75rem;
  grid-area: save;
  justify-self: start;
  padding: 0.45rem 0.875rem;
  font-size: 0.9375rem;
}

/* One width for Save, Saved and the busy spinner beside either, so pressing the toggle never
   moves the card's other content. */
.save-service--compact .button[aria-pressed] {
  min-width: 6.5rem;
}

.save-service--compact .save-service__error {
  grid-column: 1 / -1;
  font-size: 0.9375rem;
}

/* An empty alert in a card is taken out of the flow: it adds no row and no gap to the card's
   grid, and it stays in the accessibility tree, ready to speak. */
.save-service--compact .save-service__error:empty {
  position: absolute;
  margin: 0;
}
</style>
