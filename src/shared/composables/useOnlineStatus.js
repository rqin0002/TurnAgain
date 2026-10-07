import { ref } from 'vue'

/**
 * Module singleton over `navigator.onLine` and the `online`/`offline` events. The flag
 * is a hint for the banner and never a decision: no request is skipped because it says false and
 * no data is trusted because it says true; the failed request's own code decides what shows.
 */

const online = ref(true)
let listening = false

const goOnline = () => {
  online.value = true
}
const goOffline = () => {
  online.value = false
}

// Node and older engines expose no boolean here; a missing hint means "assume online".
const currentHint = () =>
  typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true

/** @returns {{ online: import('vue').Ref<boolean> }} */
export function useOnlineStatus() {
  if (!listening) {
    // The hint is read once, when the listeners attach; from then on the events own the value.
    listening = true
    online.value = currentHint()
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', goOnline)
      window.addEventListener('offline', goOffline)
    }
  }
  return { online }
}
