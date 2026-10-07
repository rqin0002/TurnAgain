// The charts' lazy chunk (spec 8.6, M6-D20): only a staff member who opens the Overview downloads
// Chart.js, and it lands in its own chartSetup-<hash>.js file. A module of its own so ChartCanvas's
// failure path can be tested (the sessionCalendarChunk.js pattern).
export const loadChart = () => import('./chartSetup.js').then((module) => module.Chart)
