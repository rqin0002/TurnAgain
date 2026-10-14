<script setup>
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'

/**
 * A row's "More actions" menu (WAI-ARIA APG menu button) for the staff tables, where a row has
 * more actions than its cell can show. The button reads "More actions" and the row's name, so
 * two rows' buttons never share a name. Enter, Space or Down Arrow open the menu on its first
 * item, Up Arrow on its last; Up and Down Arrow (wrapping), Home and End move between items;
 * Escape closes it and returns focus to the button; focus leaving the button and the menu (Tab,
 * a click elsewhere) closes it.
 * Choosing an item closes the menu and puts focus back on the button before anything else
 * happens, so the caller's confirm dialog and status line take over from a control that is still
 * on the page; then an action item emits `select` with its key, while a link item (`to`) just
 * navigates. A disabled item stays in the list and in the arrow order (as the APG recommends),
 * is announced as unavailable and does nothing when chosen; `disabled` is for action items.
 * The list stays next to the button in the page (so the Tab order is the row's), but is drawn
 * with fixed positioning from the button's rectangle: a table's sideways-scrolling box cannot
 * clip it. It sits under the button with their right edges aligned, above the button when the
 * window has no room below, and always inside the window; it closes when anything scrolls or the
 * window resizes, because a fixed menu would stay put while its row moved.
 *
 * Items: `{ key, label, to?, disabled? }`.
 */
const props = defineProps({
  items: { type: Array, required: true },
  name: { type: String, required: true },
  label: { type: String, default: 'More actions' },
})
const emit = defineEmits(['select'])

const id = useId()
const buttonId = `${id}-button`
const menuId = `${id}-menu`
const root = ref(null)
const button = ref(null)
const menu = ref(null)
const open = ref(false)
const position = ref({})

// The menu keeps this many CSS pixels from its button and from the window's edges.
const GAP = 4
const EDGE = 8

const menuItems = () => (menu.value ? [...menu.value.querySelectorAll('[role="menuitem"]')] : [])
/** Focuses the item at `index`, counting from the end when negative and wrapping past either end. */
const focusItem = (index) => {
  const list = menuItems()
  if (list.length === 0) return
  list[((index % list.length) + list.length) % list.length].focus({ preventScroll: true })
}

/** Places the open menu from the button's and its own measured rectangles. */
const place = () => {
  const anchor = button.value.getBoundingClientRect()
  const box = menu.value.getBoundingClientRect()
  const viewWidth = document.documentElement.clientWidth || window.innerWidth
  const viewHeight = window.innerHeight
  const left = Math.max(EDGE, Math.min(anchor.right - box.width, viewWidth - box.width - EDGE))
  const below = anchor.bottom + GAP
  const above = anchor.top - GAP - box.height
  const top = below + box.height > viewHeight - EDGE && above >= EDGE ? above : below
  position.value = { top: `${top}px`, left: `${left}px` }
}

const openMenu = async (at = 'first') => {
  open.value = true
  await nextTick()
  if (!menu.value) return
  place()
  focusItem(at === 'last' ? -1 : 0)
}
const closeMenu = (returnFocus) => {
  if (!open.value) return
  open.value = false
  position.value = {}
  if (returnFocus) button.value?.focus({ preventScroll: true })
}
const toggle = () => (open.value ? closeMenu(true) : openMenu())

const onButtonKeydown = (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    openMenu(event.key === 'ArrowUp' ? 'last' : 'first')
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    closeMenu(true)
  }
}

const onMenuKeydown = (event) => {
  const index = menuItems().indexOf(document.activeElement)
  const moves = { ArrowDown: index + 1, ArrowUp: index < 0 ? -1 : index - 1, Home: 0, End: -1 }
  if (Object.hasOwn(moves, event.key)) {
    event.preventDefault()
    focusItem(moves[event.key])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu(true)
  } else if (event.key === ' ' && event.target instanceof HTMLAnchorElement) {
    // A link answers Enter by itself; Space chooses it too, as it does the menu's buttons.
    event.preventDefault()
    event.target.click()
  }
}

const choose = (item, event) => {
  if (item.disabled) {
    event.preventDefault()
    return
  }
  closeMenu(true)
  if (!item.to) emit('select', item.key)
}

// Focus moving anywhere outside the button and the menu closes it, without taking focus back.
const onFocusOut = (event) => {
  if (!root.value?.contains(event.relatedTarget)) closeMenu(false)
}

// A scroll anywhere (captured, so a table's own box counts) or a resize closes the menu; focus
// that was inside it goes back to the button rather than to the page.
const onViewportChange = () => closeMenu(menu.value?.contains(document.activeElement) ?? false)
const listen = (on) => {
  const method = on ? 'addEventListener' : 'removeEventListener'
  window[method]('scroll', onViewportChange, true)
  window[method]('resize', onViewportChange)
}
watch(open, listen)
onBeforeUnmount(() => listen(false))
</script>

<template>
  <div ref="root" class="actions-menu" @focusout="onFocusOut">
    <!-- mousedown is prevented so a pointer press never moves focus by itself (Safari gives a
         pressed button no focus): the menu decides where focus goes. -->
    <button
      :id="buttonId"
      ref="button"
      type="button"
      class="actions-menu__button"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? menuId : undefined"
      @mousedown.prevent
      @click="toggle"
      @keydown="onButtonKeydown"
    >
      {{ label }} <span class="visually-hidden">{{ name }}</span>
    </button>
    <ul
      v-if="open"
      :id="menuId"
      ref="menu"
      class="actions-menu__list"
      role="menu"
      :aria-labelledby="buttonId"
      :style="position"
      @keydown="onMenuKeydown"
      @mousedown.prevent
    >
      <li v-for="item in props.items" :key="item.key" role="none">
        <RouterLink
          v-if="item.to"
          :to="item.to"
          class="actions-menu__item"
          role="menuitem"
          tabindex="-1"
          @click="choose(item, $event)"
          >{{ item.label }}</RouterLink
        >
        <button
          v-else
          type="button"
          class="actions-menu__item"
          role="menuitem"
          tabindex="-1"
          :aria-disabled="item.disabled ? 'true' : undefined"
          @click="choose(item, $event)"
        >
          {{ item.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.actions-menu {
  display: inline-flex;
}

.actions-menu__button {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-small);
  background: var(--color-surface);
  color: var(--color-brand-strong);
  padding: 0 0.75rem;
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

/* A downward chevron drawn with borders, so the button's text is only its name. */
.actions-menu__button::after {
  width: 0.45rem;
  height: 0.45rem;
  border-right: 2px solid currentcolor;
  border-bottom: 2px solid currentcolor;
  content: '';
  transform: translateY(-25%) rotate(45deg);
}

.actions-menu__button:hover,
.actions-menu__button[aria-expanded='true'] {
  background: var(--color-brand-soft);
}

.actions-menu__list {
  position: fixed;
  z-index: 20;
  min-width: 12rem;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-small);
  background: var(--color-surface);
  padding: 0.375rem;
  box-shadow: 0 0.5rem 1.5rem color-mix(in srgb, var(--color-heading) 18%, transparent);
  list-style: none;
}

.actions-menu__item {
  display: flex;
  width: 100%;
  min-height: 2.75rem;
  align-items: center;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text);
  padding: 0 0.75rem;
  font: inherit;
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.actions-menu__item:hover,
.actions-menu__item:focus-visible {
  background: var(--color-brand-soft);
  color: var(--color-brand-strong);
}

/* The ring sits inside the item so the list's edge never cuts it off. */
.actions-menu__item:focus-visible {
  outline-offset: -3px;
}

.actions-menu__item[aria-disabled='true'] {
  color: var(--color-text-muted);
  cursor: not-allowed;
}
</style>
