/**
 * Theme vocabulary shared by public/theme-init.js (which inlines the same validator because it
 * runs before any module loads) and useTheme() (spec 10.1). Pure: no imports.
 */

export const THEMES = Object.freeze(['system', 'light', 'dark'])

/** localStorage key holding the raw preference string, one of THEMES. */
export const THEME_STORAGE_KEY = 'turnagain:theme'

/** Values for meta[name="theme-color"], keyed by the effective theme. */
export const THEME_COLORS = Object.freeze({ light: '#ffffff', dark: '#121214' })

/** Anything that is not one of THEMES (junk, null, an older build's value) reads as 'system'. */
export const normalizeTheme = (value) => (THEMES.includes(value) ? value : 'system')

/**
 * The theme the page renders: an explicit choice wins; 'system' follows the OS preference.
 * @param {unknown} preference
 * @param {boolean} prefersDark - the `(prefers-color-scheme: dark)` match, false when unknown
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(preference, prefersDark) {
  const choice = normalizeTheme(preference)
  if (choice === 'system') {
    return prefersDark === true ? 'dark' : 'light'
  }
  return choice
}
