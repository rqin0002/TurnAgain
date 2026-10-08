// Loads SessionCalendar, and FullCalendar with it, as a separate chunk, so only visitors who open
// the calendar download it. Resolves to the component itself rather than the module namespace, so
// the loader always hands Vue a component (its failure fallback is one too). Kept in its own
// module so tests can replace this import and exercise the loader's failure path.
export const loadSessionCalendar = () =>
  import('./SessionCalendar.vue').then((module) => module.default)
