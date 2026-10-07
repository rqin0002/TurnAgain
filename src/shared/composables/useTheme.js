import { computed, ref } from 'vue'

import { normalizeTheme, resolveTheme, THEME_COLORS, THEME_STORAGE_KEY } from '../domain/theme.js'

const DARK_QUERY = '(prefers-color-scheme: dark)'

// One preference for the whole page: the Account page's ThemeSwitch and any later reader share
// these refs, and the media-query listener is attached once. public/theme-init.js applied the
// stored choice before first paint; this module takes over from the same storage key and keeps the
// document in step.
const preference = ref('system')
const prefersDark = ref(false)
const effective = computed(() => resolveTheme(preference.value, prefersDark.value))
let started = false

// Storage can throw (private mode, blocked site data); the theme then lasts the page.
const readStored = () => {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

const writeStored = (value) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value)
  } catch {
    // nothing to do: the in-memory preference still drives the page
  }
}

// jsdom has no matchMedia; an absent or throwing implementation reads as light.
const darkQuery = () => {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
  } catch {
    return null
  }
}

const applyToDocument = () => {
  const root = document.documentElement
  if (preference.value === 'system') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = preference.value
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', THEME_COLORS[effective.value])
  }
}

const start = () => {
  if (started) return
  started = true
  preference.value = readStored()
  const query = darkQuery()
  if (query) {
    prefersDark.value = query.matches === true
    const onChange = (event) => {
      prefersDark.value = event.matches === true
      applyToDocument()
    }
    // Safari before 14 only has addListener; the listener lives as long as the page.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange)
    } else if (typeof query.addListener === 'function') {
      query.addListener(onChange)
    }
  }
  applyToDocument()
}

const setPreference = (value) => {
  preference.value = normalizeTheme(value)
  writeStored(preference.value)
  applyToDocument()
}

/**
 * The stored theme preference and the theme the page currently renders.
 * @returns {{
 *   preference: import('vue').Ref<'system' | 'light' | 'dark'>,
 *   effective: import('vue').ComputedRef<'light' | 'dark'>,
 *   setPreference: (value: unknown) => void
 * }}
 */
export function useTheme() {
  start()
  return { preference, effective, setPreference }
}
