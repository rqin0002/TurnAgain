import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { animate } from 'animejs/animation'

// One entry point for TurnAgain's Anime.js behaviours. Components still own
// their state and markup; each behaviour below owns its animation cleanup.

// Page introductions, menus, disclosures and result updates.
// One motion vocabulary; the existing colour, type and layout tokens stay in CSS.
export const motionPresets = Object.freeze({
  page: { duration: 240, distance: 8 },
  disclosure: { duration: 180, distance: 4 },
  results: { duration: 160, distance: 4 },
})

/**
 * Progressive enhancement for explicitly selected DOM elements. This directive
 * never owns rendering, focus, routing, loading or the native disclosure state.
 * The injectable animator keeps lifecycle tests independent of a browser clock.
 */
export function createMotionDirective(animateElement = animate) {
  const states = new WeakMap()

  return {
    mounted(element, binding) {
      const document = element.ownerDocument
      const view = document.defaultView
      const preference = view.matchMedia('(prefers-reduced-motion: reduce)')
      let current = null

      const stop = () => {
        const animation = current
        current = null
        animation?.revert()
      }

      const play = (target, presetName) => {
        stop()
        if (!target || preference.matches || document.hidden) return

        const rect = target.getBoundingClientRect()
        if (
          !rect.width ||
          !rect.height ||
          rect.bottom <= 0 ||
          rect.top >= view.innerHeight ||
          target.contains(document.activeElement)
        ) {
          return
        }

        const preset = motionPresets[presetName]
        const animation = animateElement(target, {
          opacity: [0.92, 1],
          translateY: [preset.distance, 0],
          duration: preset.duration,
          ease: 'outCubic',
          autoplay: false,
          onComplete: () => {
            // A replaced animation must never cancel its successor.
            if (current === animation) stop()
          },
        })
        current = animation
        animation.play()
      }

      const onToggle = () => {
        const body = Array.from(element.children).find((child) => child.tagName !== 'SUMMARY')
        if (element.open) play(body, 'disclosure')
        else stop()
      }
      const onPreference = () => {
        if (preference.matches) stop()
      }
      const onVisibility = () => {
        if (document.hidden) stop()
      }

      element.addEventListener('pointerdown', stop)
      element.addEventListener('focusin', stop)
      preference.addEventListener('change', onPreference)
      document.addEventListener('visibilitychange', onVisibility)
      if (binding.arg === 'disclosure') element.addEventListener('toggle', onToggle)

      states.set(element, {
        play,
        stop,
        dispose() {
          stop()
          element.removeEventListener('pointerdown', stop)
          element.removeEventListener('focusin', stop)
          preference.removeEventListener('change', onPreference)
          document.removeEventListener('visibilitychange', onVisibility)
          element.removeEventListener('toggle', onToggle)
        },
      })

      if (!binding.arg) play(element, 'page')
      if (binding.arg === 'toggle' && binding.value) play(element, 'disclosure')
      if (binding.arg === 'results' && !binding.value.quietKey) play(element, 'results')
    },

    updated(element, binding) {
      const state = states.get(element)
      if (!state) return

      if (binding.arg === 'toggle' && binding.value !== binding.oldValue) {
        if (binding.value) state.play(element, 'disclosure')
        else state.stop()
      } else if (binding.arg === 'results') {
        if (binding.value.quietKey !== binding.oldValue.quietKey) state.stop()
        else if (binding.value.key !== binding.oldValue.key) state.play(element, 'results')
      } else if (!binding.arg && binding.value !== binding.oldValue) {
        state.play(element, 'page')
      }
    },

    beforeUnmount(element) {
      states.get(element)?.dispose()
      states.delete(element)
    },
  }
}

export const motion = createMotionDirective()

// Desktop navigation: move the shared underline between destinations.
const DURATION = 220

/** A single underline follows the current desktop destination without moving links. */
export function createNavigationIndicator(animatePosition = animate) {
  const states = new WeakMap()

  return {
    mounted(element) {
      const indicator = element.querySelector('.primary-nav__indicator')
      const document = element.ownerDocument
      const view = document.defaultView
      const reduced = view.matchMedia('(prefers-reduced-motion: reduce)')
      const compact = view.matchMedia('(max-width: 899px)')
      const position = { x: 0, y: 0, width: 0 }
      let destination = null
      let animation = null

      const cancel = () => {
        animation?.cancel()
        animation = null
      }
      const render = () => {
        indicator.style.width = `${position.width}px`
        indicator.style.transform = `translate(${position.x}px, ${position.y}px) translateX(-50%)`
      }
      const update = (allowAnimation = false) => {
        const active = element.querySelector('a.is-current, a.router-link-exact-active')
        if (!active || compact.matches) {
          cancel()
          destination = null
          delete element.dataset.indicatorReady
          return
        }

        // Use the positioned nav's layout coordinates. Scaling a 1px strip also
        // scales its subpixel rounding error; a real width keeps the line centred.
        const next = {
          x: active.offsetLeft + active.offsetWidth / 2,
          y: active.offsetTop + active.offsetHeight - 1,
          width: active.offsetWidth,
        }
        if (!next.width) return
        if (
          allowAnimation &&
          destination &&
          Object.keys(next).every((key) => Math.abs(next[key] - destination[key]) < 0.1)
        )
          return

        cancel()
        const shouldAnimate = allowAnimation && destination && !reduced.matches && !document.hidden
        destination = next
        element.dataset.indicatorReady = ''

        if (!shouldAnimate) {
          Object.assign(position, next)
          render()
          return
        }

        // Cancelling keeps the last rendered position: rapid clicks continue
        // from the visible line instead of jumping back to an earlier tab.
        animation = animatePosition(position, {
          ...next,
          duration: DURATION,
          ease: 'outCubic',
          onUpdate: render,
        })
      }

      const settle = () => update(false)
      const observer = new view.ResizeObserver(settle)
      observer.observe(element)
      reduced.addEventListener('change', settle)
      compact.addEventListener('change', settle)
      document.addEventListener('visibilitychange', settle)

      states.set(element, {
        update,
        dispose() {
          cancel()
          observer.disconnect()
          reduced.removeEventListener('change', settle)
          compact.removeEventListener('change', settle)
          document.removeEventListener('visibilitychange', settle)
          delete element.dataset.indicatorReady
          indicator.style.removeProperty('transform')
          indicator.style.removeProperty('width')
        },
      })
      settle()
    },

    updated(element) {
      states.get(element)?.update(true)
    },

    beforeUnmount(element) {
      states.get(element)?.dispose()
      states.delete(element)
    },
  }
}

export const navigationIndicator = createNavigationIndicator()

// Rating panels: connect loading, editing and saved states without a jump.
/** Keep a rating panel's footprint continuous while Vue replaces its contents. */
export function useRatingPanelMotion(panel, content, state, context) {
  let resizeAnimation = null
  let revealAnimation = null
  let generation = 0
  let preference
  let view
  let document

  const stop = () => {
    ++generation
    resizeAnimation?.cancel()
    revealAnimation?.revert()
    resizeAnimation = null
    revealAnimation = null
    panel.value?.style.removeProperty('height')
  }
  const canAnimate = (element) => {
    if (!preference || preference.matches || document.hidden) return false
    const bounds = element.getBoundingClientRect()
    return bounds.width > 0 && bounds.bottom > 0 && bounds.top < view.innerHeight
  }

  watch([state, context], async ([, currentContext], [, previousContext]) => {
    const element = panel.value
    if (!element) return
    const previousHeight = element.offsetHeight
    stop()
    // A new service or identity must discard its previous presentation immediately.
    if (!currentContext || currentContext !== previousContext || !canAnimate(element)) return
    const currentGeneration = generation

    // Lock before Vue patches: even a very short successful response cannot
    // collapse the page between the form and its saved state.
    element.style.height = `${previousHeight}px`
    await nextTick()
    if (generation !== currentGeneration || !element.isConnected) return
    const body = content.value
    if (!body || !canAnimate(element)) {
      stop()
      return
    }
    const styles = view.getComputedStyle(element)
    const nextHeight =
      body.offsetTop +
      body.offsetHeight +
      parseFloat(styles.paddingBottom) +
      parseFloat(styles.borderBottomWidth)

    if (Math.abs(nextHeight - previousHeight) > 1) {
      resizeAnimation = animate(element, {
        height: [previousHeight, nextHeight],
        duration: 240,
        ease: 'outCubic',
        onComplete: () => {
          if (generation === currentGeneration) {
            element.style.removeProperty('height')
            resizeAnimation = null
          }
        },
      })
    } else {
      element.style.removeProperty('height')
    }

    // Keep focused controls steady. Numbers always show the actual saved values.
    if (
      !body.contains(document.activeElement) &&
      !body.querySelector('form[aria-busy="true"], [role="alert"]')
    ) {
      revealAnimation = animate(body, {
        opacity: [0.92, 1],
        duration: 180,
        ease: 'outCubic',
        onComplete: () => {
          if (generation === currentGeneration) {
            revealAnimation?.revert()
            revealAnimation = null
          }
        },
      })
    }
  })

  onMounted(() => {
    const element = panel.value
    document = element.ownerDocument
    view = document.defaultView
    preference = view.matchMedia('(prefers-reduced-motion: reduce)')
    // Let the click reach its control before settling the panel. Changing page
    // height on pointerdown can move a button away before pointerup lands.
    element.addEventListener('click', stop)
    element.addEventListener('keydown', stop)
    preference.addEventListener('change', stop)
    view.addEventListener('resize', stop)
    document.addEventListener('visibilitychange', stop)
  })

  onBeforeUnmount(() => {
    stop()
    panel.value?.removeEventListener('click', stop)
    panel.value?.removeEventListener('keydown', stop)
    preference?.removeEventListener('change', stop)
    view?.removeEventListener('resize', stop)
    document?.removeEventListener('visibilitychange', stop)
  })
}
