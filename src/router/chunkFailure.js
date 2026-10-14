import { shallowRef } from 'vue'

/**
 * Recovery for a page whose code could not be downloaded. Every page but Home is a script file
 * fetched on its first visit (the lazy `component` loaders in src/router/index.js). That download
 * fails offline, and after a new deployment it fails in every tab opened before it, because the
 * old page asks for file names that no longer exist. vue-router then rejects the navigation, a
 * link click changes nothing on screen, and the browser answers a second import of the same file
 * from its record of the failure, so no in-page retry can succeed.
 *
 * Online, the first failure for a destination loads the page afresh at that destination: a new
 * document, which also picks up the deployment. When that fresh load fails again, the tab cannot
 * keep the mark that records it, or the browser is offline, `routeLoadError` names the destination
 * and the shell (App.vue) shows a panel whose Try again loads the page afresh. A completed
 * navigation clears the panel and the destination's mark, so the next deployment is met with a
 * fresh load again. While the tab still shows the address of a first page that failed to load, a
 * destination that differs from it only by a #fragment (the footer's /about#privacy on /about) is
 * loaded afresh as well: see `navigateAfresh`.
 */

/** `{ to }` names the destination whose code could not be loaded while the panel shows; else null. */
export const routeLoadError = shallowRef(null)

// What Chromium, Firefox and Safari say when a dynamic import's download fails, and what Vite's
// preload helper says when a chunk's stylesheet does. The error's class is not the signal: a
// TypeError thrown by a guard must never reload the page.
const CHUNK_FAILURE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/iu

/** Whether a navigation error is a failed download of a page's code. */
export const isChunkLoadFailure = (error) => CHUNK_FAILURE.test(String(error?.message ?? ''))

// One mark per destination, for this tab only, so a server that keeps failing cannot loop.
const MARK_PREFIX = 'turnagain:reloaded-for:'

let deps = null
let activeRouter = null

// sessionStorage can be absent or refuse (a private window, blocked site data). A mark that cannot
// be read counts as set, and the automatic fresh load waits for its mark to be written: without
// the mark the next document could not tell it was the fresh load, and a server that keeps
// failing would reload the tab again and again. The panel's Try again needs no mark to be safe,
// because the person asks for each load.
const isMarked = (destination) => {
  try {
    return deps.storage().getItem(MARK_PREFIX + destination) !== null
  } catch {
    return true
  }
}
/** Writes or removes the destination's mark; returns false when the storage refused. */
const setMark = (destination, marked) => {
  try {
    const storage = deps.storage()
    if (marked) storage.setItem(MARK_PREFIX + destination, '1')
    else storage.removeItem(MARK_PREFIX + destination)
    return true
  } catch {
    return false
  }
}

/** Performs a full navigation to the destination (its href carries the history base). */
const freshLoad = (destination) => {
  deps.navigate(activeRouter.resolve(destination).href)
}

const withoutFragment = (url) => url.href.split('#')[0]

/**
 * The default full navigation: loads a new document at `url` (a path or an absolute address).
 * `location.assign` to an address that has a #fragment and otherwise equals the current address
 * only scrolls within the document (the HTML navigate algorithm), so for that address the current
 * history entry is given it with `history.replaceState`, keeping the entry's state, and the
 * document is reloaded there. Every other address goes to `location.assign` unchanged.
 * `location` and `history` default to the window's own; tests pass stand-ins.
 *
 * @param {string} url
 * @param {{ location?: Location, history?: History }} [browser]
 */
export function navigateAfresh(url, { location = window.location, history = window.history } = {}) {
  const target = new URL(url, location.href)
  if (
    target.href.includes('#') &&
    withoutFragment(target) === withoutFragment(new URL(location.href))
  ) {
    history.replaceState(history.state, '', target.href)
    location.reload()
    return
  }
  location.assign(url)
}

/**
 * Registers the handler on `router`. The options exist for tests: `navigate(url)` performs the
 * full navigation (`navigateAfresh`), `storage()` returns the Storage that holds the
 * per-destination marks (`window.sessionStorage`) and `isOnline()` is the connection hint.
 */
export function installChunkFailureHandler(
  router,
  {
    navigate = (url) => navigateAfresh(url),
    storage = () => window.sessionStorage,
    isOnline = () => navigator.onLine !== false,
  } = {},
) {
  deps = { navigate, storage, isOnline }
  activeRouter = router
  router.onError((error, to) => {
    // The router logs an uncaught navigation error only while it has no error listener, and
    // RouterLink swallows the rejection, so this listener logs every other error the same way.
    if (!isChunkLoadFailure(error)) {
      console.error(error)
      return
    }
    const destination = to.fullPath
    if (isOnline() && !isMarked(destination) && setMark(destination, true)) {
      freshLoad(destination)
      return
    }
    routeLoadError.value = { to: destination }
  })
  router.afterEach((to, from, failure) => {
    if (failure) return
    routeLoadError.value = null
    setMark(to.fullPath, false)
  })
}

/**
 * The panel's Try again: a fresh load of the page at the destination that failed. The mark is set
 * when the storage allows it, so a fresh load that fails again shows the panel, not another load.
 */
export function retryRouteLoad() {
  const destination = routeLoadError.value?.to
  if (!destination || !deps) return
  setMark(destination, true)
  freshLoad(destination)
}
