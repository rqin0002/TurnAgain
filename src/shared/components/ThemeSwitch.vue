<script setup>
import { computed, useId } from 'vue'

import { useTheme } from '../composables/useTheme.js'

// A two-state switch. It shows the effective theme, so a device
// in dark mode reads On until the person chooses; flipping stores an explicit light or dark choice
// on this device, which theme-init.js applies before the first paint of every later visit.
const { effective, setPreference } = useTheme()
const isDark = computed(() => effective.value === 'dark')
const labelId = useId()

const toggle = () => setPreference(isDark.value ? 'light' : 'dark')
</script>

<template>
  <div class="theme-switch">
    <button
      type="button"
      class="theme-switch__track"
      :class="{ 'theme-switch__track--dark': isDark }"
      role="switch"
      :aria-checked="String(isDark)"
      :aria-labelledby="labelId"
      @click="toggle"
    >
      <svg
        class="theme-switch__icon theme-switch__icon--sun"
        :class="{ 'theme-switch__icon--shown': !isDark }"
        data-theme-icon="sun"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
        <path
          d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
      <svg
        class="theme-switch__icon theme-switch__icon--moon"
        :class="{ 'theme-switch__icon--shown': isDark }"
        data-theme-icon="moon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" />
        <path
          d="M17 3.5v2M16 4.5h2M20.5 8v1.4M19.8 8.7h1.4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
      <span class="theme-switch__knob" aria-hidden="true"></span>
    </button>
    <div class="theme-switch__text">
      <p :id="labelId" class="theme-switch__label">Dark mode</p>
    </div>
  </div>
</template>

<style scoped>
.theme-switch {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* The two track colours are the switch's own: white icons and knob keep
   at least 3:1 against either. The switch shows the effective theme, so the orange track only ever
   sits on the light page, which it already stands out from, and the near-black track only on the
   dark page, which needs the border to separate them. The border stays 1px wide in both states so
   the knob travels the same box. */
.theme-switch__track {
  position: relative;
  flex: none;
  width: 4.75rem;
  height: 2.5rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: #e8430e;
  color: #ffffff;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) ease,
    border-color var(--duration-fast) ease;
}

.theme-switch__track--dark {
  border-color: var(--color-border-strong);
  background: #1a1a1c;
}

/* Inside the border the box is 74 by 38px: a 32px knob 3px from the left travels 36px to sit 3px
   from the right, the same gap as above and below it. */
.theme-switch__knob {
  position: absolute;
  top: 50%;
  left: 0.1875rem;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: #ffffff;
  transform: translate(2.25rem, -50%);
  transition: transform var(--duration-fast) ease;
}

.theme-switch__track--dark .theme-switch__knob {
  transform: translate(0, -50%);
}

/* Both icons stay drawn and cross-fade, so the sliding knob never passes over an icon that has
   just appeared. */
.theme-switch__icon {
  position: absolute;
  top: 50%;
  width: 1.25rem;
  height: 1.25rem;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity var(--duration-fast) ease;
}

.theme-switch__icon--sun {
  left: 0.6rem;
}

.theme-switch__icon--moon {
  right: 0.6rem;
}

.theme-switch__icon--shown {
  opacity: 1;
}

.theme-switch__label {
  margin: 0;
  font-weight: 600;
}
</style>
