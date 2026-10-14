// Loads SessionCalendar, and FullCalendar with it, as a separate chunk, so only visitors who open
// the calendar download it. Resolves to the component itself rather than the module namespace, so
// the loader always hands Vue a component (its failure fallback is one too). Kept in its own
// module so tests can replace this import and exercise the loader's failure path.
export const loadSessionCalendar = () =>
  import('./SessionCalendar.vue').then((module) => module.default)

/**
 * A fresh load of the page, for the loader's recovery control. The browser keeps a record of a
 * script file whose download failed and answers a later import of the same file from that
 * record, without downloading again, so only a new page can fetch the calendar after a failure.
 * The address keeps `?view=calendar`, so the calendar is asked for again on arrival. Lives here
 * so the loader's tests can replace it beside the loader itself.
 */
export const reloadPage = () => window.location.reload()
