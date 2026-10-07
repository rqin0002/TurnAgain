// The calendar's lazy chunk (only someone who opens the calendar downloads FullCalendar),
// in a module of its own so the loader's failure path can be tested. It resolves the component
// itself: defineAsyncComponent takes `.default` only from a value marked `__esModule` or
// `Symbol.toStringTag === 'Module'` (Vue 3.5.42, runtime-core.cjs.js 2715-2717), so every value
// the loader hands Vue is a component.
export const loadSessionCalendar = () =>
  import('./SessionCalendar.vue').then((module) => module.default)
