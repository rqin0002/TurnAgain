/**
 * TurnAgain's three explicit motion effects. Each one reads the DOM it is given,
 * no-ops under `prefers-reduced-motion` (or when the preference cannot be read, or the tab is
 * hidden) and only then imports anime.js, so the library is a lazy chunk a reduced-motion visitor
 * never downloads. Everything else in the interface is a CSS transition on `--duration-fast`.
 * Components call these from `onMounted` or a watcher and never await them: a failed chunk load
 * never rejects; the effects render their end state (offline before the chunk was cached). A
 * second call on the same element supersedes the first, so a re-trigger never fights a running
 * effect.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const NAV_DURATION = 220
const SUMMARY_DURATION = 360
const REFERENCE_DURATION = 360
const ACTIVE_LINK = 'a[aria-current="page"], a.router-link-exact-active, a.is-current'

/** The position the underline is heading for per nav: a repeat call for it changes nothing. */
const indicatorTargets = new WeakMap()
/** Where the underline is drawn now per nav, mid-glide included, so the next move starts there. */
const indicatorRendered = new WeakMap()
/** The running underline animation per nav; a new move cancels it instead of fighting it. */
const indicatorAnimations = new WeakMap()
/** The running summary effect per root: the call that owns it and its animations to cancel. */
const summaryRuns = new WeakMap()

/** True when animation must be skipped: the preference is set, unreadable, or the tab is hidden. */
const shouldSkip = (element) => {
  const document = element?.ownerDocument
  const view = document?.defaultView
  if (!document || !view || document.hidden) return true
  return typeof view.matchMedia !== 'function' || view.matchMedia(REDUCED_MOTION).matches
}

/**
 * The one in-flight chunk request, resolving to anime.js's `animate`, or to null when the chunk
 * did not load. A failed load is forgotten so the next effect tries again. `loadedAnimate` is set
 * once the chunk has arrived, for the effect that must not start late.
 */
let chunk = null
let loadedAnimate = null
const loadAnimate = () => {
  chunk ??= (async () => {
    try {
      const { animate } = await import('animejs/animation')
      loadedAnimate = animate
      return animate
    } catch {
      chunk = null
      console.warn('[turnagain] motion skipped: the animation chunk did not load')
      return null
    }
  })()
  return chunk
}

const renderIndicator = (el, indicator, position) => {
  indicator.style.width = `${position.width}px`
  indicator.style.transform = `translate(${position.x}px, ${position.y}px) translateX(-50%)`
  indicatorRendered.set(el, { x: position.x, y: position.y, width: position.width })
}

const samePosition = (a, b) =>
  Boolean(a && b) && ['x', 'y', 'width'].every((key) => Math.abs(a[key] - b[key]) < 0.5)

/**
 * Moves a navigation element's shared underline (`[data-navigation-indicator]`) to its current
 * link. The first placement, an immediate one (a resize re-measures, it does not move), a
 * reduced-motion placement and a hidden-tab placement render at once; later ones glide from where
 * the underline is drawn. Without a current link the underline is hidden.
 *
 * @param {HTMLElement | null} el the <nav> holding the links and the indicator span
 * @param {{ immediate?: boolean }} [options] `immediate` renders the position without a glide
 * @returns {Promise<void>}
 */
export async function animateNavIndicator(el, { immediate = false } = {}) {
  const indicator = el?.querySelector('[data-navigation-indicator]')
  if (!indicator) return
  const view = el.ownerDocument.defaultView
  const active = el.querySelector(ACTIVE_LINK)
  const running = indicatorAnimations.get(el)
  running?.cancel()
  indicatorAnimations.delete(el)
  if (!active || !active.offsetWidth) {
    indicatorTargets.delete(el)
    indicatorRendered.delete(el)
    delete el.dataset.indicatorReady
    indicator.style.removeProperty('width')
    indicator.style.removeProperty('transform')
    return
  }

  // Layout coordinates of the positioned nav. A real width keeps the line centred; scaling a
  // 1px strip would scale its subpixel rounding error too.
  const next = {
    x: active.offsetLeft + active.offsetWidth / 2,
    y:
      active.offsetTop +
      active.offsetHeight -
      (parseFloat(view.getComputedStyle(indicator).height) || 1),
    width: active.offsetWidth,
  }
  if (samePosition(indicatorTargets.get(el), next)) {
    // The glide this call cancelled was heading here: land on it rather than stop mid-way.
    if (running || immediate) renderIndicator(el, indicator, next)
    return
  }
  indicatorTargets.set(el, next)
  el.dataset.indicatorReady = ''
  const previous = indicatorRendered.get(el)
  if (!previous || immediate || shouldSkip(el)) {
    renderIndicator(el, indicator, next)
    return
  }

  const animate = await loadAnimate()
  // A later call while the chunk loaded owns the underline now.
  if (indicatorTargets.get(el) !== next || !el.isConnected) return
  if (!animate) {
    renderIndicator(el, indicator, next)
    return
  }
  const position = { ...previous }
  const animation = animate(position, {
    ...next,
    duration: NAV_DURATION,
    ease: 'outCubic',
    onUpdate: () => renderIndicator(el, indicator, position),
  })
  indicatorAnimations.set(el, animation)
}

/** Stops whatever a previous `animateRatingSummary` call left running on this root. */
const cancelSummary = (el) => {
  for (const animation of summaryRuns.get(el)?.animations ?? []) animation.cancel()
  summaryRuns.delete(el)
}

/**
 * Grows a rating summary's distribution bars and counts its average up from zero. The bars are
 * the `[data-rating-bar]` spans (their width is the component's; only a transform is animated).
 * The average is written into `[data-rating-average]` from the `average` the caller already
 * holds and lands on that exact string, so the target is never parsed out of the text being
 * animated. A second call on the same root (the summary changed while the count ran) cancels the
 * first, so the number ends on the latest value. The staff Overview reuses it in its "All rated
 * services" tile, which renders RatingSummary.vue.
 *
 * @param {HTMLElement | null} el the summary root
 * @param {{ average?: string | number | null, count?: number }} [values] the summary's average
 *   (a formatted string such as `'4.3'` keeps its decimals) and its rating count; with no
 *   count, or an average that is not a number, only the bars grow
 * @returns {Promise<void>}
 */
export async function animateRatingSummary(el, { average = null, count = 0 } = {}) {
  if (!el) return
  cancelSummary(el)
  if (shouldSkip(el)) return
  const bars = Array.from(el.querySelectorAll('[data-rating-bar]'))
  const averageElement = el.querySelector('[data-rating-average]')
  const target = count > 0 ? Number(average) : Number.NaN
  const countsUp = averageElement !== null && Number.isFinite(target)
  if (bars.length === 0 && !countsUp) return
  // First use: the summary is already painted at its final state, and growing it once the chunk
  // lands would replay it from zero. This call only warms the chunk for the next summary.
  if (loadedAnimate === null) {
    await loadAnimate()
    return
  }

  const run = { animations: [] }
  summaryRuns.set(el, run)
  const animate = await loadAnimate()
  // A later call while the chunk loaded owns the summary now; a removed root has nothing to paint;
  // without the chunk the summary keeps the full bars and the average it rendered.
  if (!animate || summaryRuns.get(el) !== run || !el.isConnected) return
  if (bars.length > 0) {
    for (const bar of bars) bar.style.transformOrigin = 'left center'
    run.animations.push(
      animate(bars, { scaleX: [0, 1], duration: SUMMARY_DURATION, ease: 'outCubic' }),
    )
  }
  if (countsUp) {
    const finalText = typeof average === 'string' ? average.trim() : target.toFixed(1)
    const decimals = (finalText.split('.')[1] ?? '').length
    const format = new Intl.NumberFormat('en-AU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    const counter = { value: 0 }
    run.animations.push(
      animate(counter, {
        value: target,
        duration: SUMMARY_DURATION,
        ease: 'outCubic',
        onUpdate: () => {
          averageElement.textContent = format.format(counter.value)
        },
        onComplete: () => {
          averageElement.textContent = finalText
        },
      }),
    )
  }
}

/**
 * Reveals a booking reference (the booking confirmation page) with a short fade and rise.
 *
 * @param {HTMLElement | null} el the element that shows the reference
 * @returns {Promise<void>}
 */
export async function animateBookingReference(el) {
  if (!el || shouldSkip(el)) return
  const animate = await loadAnimate()
  if (!animate || !el.isConnected) return
  animate(el, {
    opacity: [0, 1],
    translateY: [8, 0],
    duration: REFERENCE_DURATION,
    ease: 'outCubic',
  })
}
