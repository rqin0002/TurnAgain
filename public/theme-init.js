// Applies the stored theme before first paint (spec 10.1). Loaded as a classic script from
// index.html <head>, so it runs while the document is still parsing and no module has loaded;
// the key, the three values and the colours duplicate src/shared/domain/theme.js on purpose.
;(function () {
  var STORAGE_KEY = 'turnagain:theme'
  var COLORS = { light: '#ffffff', dark: '#121214' }

  // Anything but 'light' or 'dark' (junk, null, a throwing storage) reads as 'system'.
  function readPreference() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY)
      return stored === 'light' || stored === 'dark' ? stored : 'system'
    } catch {
      return 'system'
    }
  }

  function readPrefersDark() {
    try {
      return (
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches === true
      )
    } catch {
      return false
    }
  }

  var preference = readPreference()
  var effective = preference === 'system' ? (readPrefersDark() ? 'dark' : 'light') : preference
  var root = document.documentElement
  if (preference === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', preference)
  }
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', COLORS[effective])
})()
