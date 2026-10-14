<script setup>
import { computed, ref } from 'vue'

import { focusAfterAction } from '@/shared/composables/focusAfterAction.js'
import { GENERIC_FAILURE } from '@/shared/domain/errorCopy.js'

// Loading, empty, error, offline and notice states in one place. `error` is read by
// duck typing (`code`, `message`): a shared component imports nothing from a data layer, and a
// RepositoryError already carries the copy for its code, so the panel renders that message and
// only supplies its own when the caller gives neither a message nor an error message.
const props = defineProps({
  variant: {
    type: String,
    required: true,
    validator: (value) => ['loading', 'empty', 'error', 'offline', 'notice'].includes(value),
  },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  error: { type: Object, default: null },
  retryLabel: { type: String, default: 'Try again' },
  /** False drops the live role where the page already announces the change. */
  live: { type: Boolean, default: true },
  /** A failure the person just caused is announced at once, whatever the variant. */
  assertive: { type: Boolean, default: false },
})

const emit = defineEmits(['retry'])

const DEFAULT_MESSAGES = Object.freeze({
  loading: 'Loading…',
  empty: 'Nothing to show yet.',
  error: GENERIC_FAILURE,
  offline: "You appear to be offline. Pages you've already opened still work.",
  notice: '',
})

// "check your connection" appears only for the network and offline codes.
const CONNECTION_CODES = Object.freeze(['network', 'offline'])

const resolvedMessage = computed(() => {
  if (props.message) return props.message
  const errorMessage = typeof props.error?.message === 'string' ? props.error.message : ''
  if (errorMessage) return errorMessage
  if (CONNECTION_CODES.includes(props.error?.code)) {
    return 'Check your connection and try again.'
  }
  return DEFAULT_MESSAGES[props.variant]
})

// An error, or any panel raised by `assertive`, interrupts; everything else is a polite status.
// The live region holds the title and message only, so Retry and slotted content are never read
// out as part of it.
const role = computed(() => {
  if (!props.live) return undefined
  return props.variant === 'error' || props.assertive ? 'alert' : 'status'
})

const showRetry = computed(() => props.variant === 'error' || props.variant === 'offline')

// Try again usually swaps this panel for a loading one, so the button just pressed leaves the page
// and focus would fall to <body>, sending the next Tab back to the top (WCAG 2.4.3 Focus Order).
// Focus goes instead to the enclosing section's heading marked tabindex="-1" (the results list
// keeps such a heading mounted through loading and error), or, when there is no such heading, to
// the page's main landmark (#main-content), which the app shell keeps mounted. The section is
// found before the emit, while this panel is still in the page. Focus that the owner's handler
// moved elsewhere stays there, and a button that stays in the page keeps it.
const root = ref(null)
const retry = () => {
  const section = root.value?.closest('section')
  return focusAfterAction(
    () => emit('retry'),
    () =>
      section?.querySelector('h1[tabindex="-1"], h2[tabindex="-1"]') ??
      document.getElementById('main-content'),
  )
}
</script>

<template>
  <div
    ref="root"
    class="state-panel"
    :class="`state-panel--${variant}`"
    :aria-busy="variant === 'loading' ? 'true' : undefined"
    :data-error-code="error?.code"
  >
    <span v-if="variant === 'loading'" class="state-panel__spinner" aria-hidden="true"></span>
    <div class="state-panel__body">
      <div class="state-panel__text" :role="role">
        <p v-if="title" class="state-panel__title">{{ title }}</p>
        <p v-if="resolvedMessage" class="state-panel__message">{{ resolvedMessage }}</p>
      </div>
      <slot />
      <button
        v-if="showRetry"
        class="button button--primary state-panel__retry"
        type="button"
        @click="retry"
      >
        {{ retryLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.state-panel__body,
.state-panel__text {
  display: grid;
  gap: 0.75rem;
}

.state-panel__title {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.2rem;
  font-weight: 600;
}

.state-panel__message {
  margin: 0;
}

.state-panel__retry {
  justify-self: start;
}

.state-panel--error {
  border-color: var(--color-danger);
}

.state-panel--offline {
  border-color: var(--color-warning);
  background: var(--color-warning-soft);
}

.state-panel__spinner {
  width: 1.25rem;
  height: 1.25rem;
  flex: none;
  margin-top: 0.2rem;
  border: 2px solid color-mix(in srgb, currentcolor 35%, transparent);
  border-top-color: currentcolor;
  border-radius: 50%;
  animation: state-panel-spin 0.8s linear infinite;
}

@keyframes state-panel-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .state-panel__spinner {
    animation: none;
  }
}
</style>
