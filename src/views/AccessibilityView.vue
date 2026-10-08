<script setup>
import { RouterLink } from 'vue-router'

// The accessibility statement: what the site aims for, which checks were run and when, and where
// the records are. The two tables below are static copy kept in step with docs/ACCESSIBILITY.md,
// which holds the same facts next to the raw evidence (axe and Lighthouse reports, screenshots)
// under docs/evidence. A check that has not been run says so instead of disappearing.
const CHECKED_ON = '2026-10-08'

const tested = [
  {
    method: 'Keyboard only',
    what: 'Tab order from the skip link through the header, main content and footer on the six main pages, a visible focus ring on every stop, no keyboard trap, and Escape on the menu and the My bookings cancel dialog.',
    result: `Checked ${CHECKED_ON} on the six main pages in Chromium: the skip link is the first Tab stop, every stop shows a focus ring, Tab never gets stuck, and Escape closes the menu and the cancel dialog with focus returned.`,
  },
  {
    method: 'NVDA with Firefox',
    what: 'Headings, landmarks, form labels, error messages, live regions for result counts and status messages, and the names of the map and chart alternatives.',
    result: 'Not run yet. The checklist and the transcript template are in docs/ACCESSIBILITY.md.',
  },
  {
    method: 'TalkBack with Chrome on Android',
    what: 'Touch exploration of the same pages, 44 px targets, and the menu button announcing its state.',
    result: 'Not run.',
  },
  {
    method: 'axe in both themes',
    what: 'Automated checks on twelve pages (the six main pages and six further states) in the light and the dark theme, including colour contrast at AA.',
    result: `Checked ${CHECKED_ON} with axe-core 4.13.0 on twelve pages (the six main pages, the map view, an activity, a service, My bookings and the two staff registers) in both themes: no serious, critical, moderate or minor issue; the details are in docs/ACCESSIBILITY.md.`,
  },
  {
    method: '200% zoom',
    what: 'Layout at the recorded viewport widths, including a 200% browser-zoom layout proxy.',
    result: `Checked ${CHECKED_ON}: no horizontal page scrolling at the recorded widths. Text-only zoom and loss of content or functionality under actual browser zoom have not been checked.`,
  },
]

const evidence = [
  {
    item: 'axe reports (light and dark theme)',
    where: 'docs/ACCESSIBILITY.md, docs/evidence/axe/',
    lastRun: CHECKED_ON,
  },
  {
    item: 'Lighthouse reports (light and dark theme)',
    where: 'docs/ACCESSIBILITY.md, docs/evidence/lighthouse/',
    lastRun: CHECKED_ON,
  },
  {
    item: 'Screen-reader pass notes (NVDA, TalkBack)',
    where: 'docs/ACCESSIBILITY.md',
    lastRun: 'Not run',
  },
  {
    item: 'Keyboard walkthrough of the six main pages',
    where: 'docs/ACCESSIBILITY.md',
    lastRun: CHECKED_ON,
  },
  {
    item: 'Screenshots at each breakpoint and at the 200% zoom layout proxy',
    where: 'docs/evidence/screenshots/',
    lastRun: CHECKED_ON,
  },
]
</script>

<template>
  <article class="page-section accessibility-page">
    <div class="shell reading-width">
      <header class="accessibility-page__intro">
        <p class="eyebrow">Accessibility statement</p>
        <h1 class="page-title">Accessibility</h1>
        <p>
          TurnAgain aims to meet WCAG 2.1 AA on every page. Accessibility is a requirement of the
          project, not a feature: the map and the charts are never the only way to reach
          information, and every action has a text alternative.
        </p>
      </header>

      <section aria-labelledby="a11y-tested-title">
        <h2 id="a11y-tested-title" class="section-title">What is tested</h2>
        <p>
          Five checks, each with its latest result. The keyboard, zoom and axe runs carry the date
          they were made; a screen-reader pass that has not been run says so.
        </p>
        <dl class="accessibility-page__list">
          <div v-for="entry in tested" :key="entry.method">
            <dt>{{ entry.method }}</dt>
            <dd>{{ entry.what }}</dd>
            <dd class="accessibility-page__result">{{ entry.result }}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="a11y-limits-title">
        <h2 id="a11y-limits-title" class="section-title">Known limitations</h2>
        <ul class="accessibility-page__bullets">
          <li>
            The map is never the only way to reach a result: every place on the map is also in the
            list, with the same details and actions. The map itself is a visual aid and is not
            operable with a screen reader beyond its list.
          </li>
          <li>
            Offline, TurnAgain is cached browsing of already-loaded pages: pages and results you
            opened in this session keep working without a connection, but a page you have not opened
            yet, and a fresh start, need a connection. There is no service worker.
          </li>
          <li>
            Provider pages linked from a listing are outside TurnAgain and may not meet the same
            standard.
          </li>
        </ul>
      </section>

      <section aria-labelledby="a11y-theme-title">
        <h2 id="a11y-theme-title" class="section-title">Theme and motion</h2>
        <p>
          TurnAgain has light and dark themes with AA contrast in both. It follows your device
          setting; signed in, you can choose light or dark under Account > Appearance, and the
          choice is remembered in this browser.
        </p>
        <p>
          Animation is small and optional. When your device asks for reduced motion
          (<code>prefers-reduced-motion</code>), transitions are turned off and content appears in
          place.
        </p>
      </section>

      <section aria-labelledby="a11y-evidence-title">
        <h2 id="a11y-evidence-title" class="section-title">Evidence</h2>
        <table class="accessibility-page__table">
          <caption>
            Where each piece of evidence lives and when it was last produced. The evidence folder
            and docs/ACCESSIBILITY.md belong to the project's documentation and travel with the
            submission.
          </caption>
          <thead>
            <tr>
              <th scope="col">Evidence</th>
              <th scope="col">Location</th>
              <th scope="col">Last run</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in evidence" :key="row.item">
              <th scope="row">{{ row.item }}</th>
              <td>{{ row.where }}</td>
              <td>{{ row.lastRun }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="a11y-contact-title">
        <h2 id="a11y-contact-title" class="section-title">Tell us about a problem</h2>
        <p>
          If something on TurnAgain does not work for you, tell us which page and what happened.
        </p>
        <RouterLink class="button button--secondary" to="/about#contact">
          Contact and corrections
        </RouterLink>
      </section>
    </div>
  </article>
</template>

<style scoped>
.accessibility-page__intro {
  margin-bottom: clamp(2rem, 4vw, 3rem);
}

.accessibility-page__intro .page-title {
  font-weight: 650;
  letter-spacing: -0.035em;
}

.accessibility-page__intro .eyebrow {
  color: var(--color-text-muted);
}

.accessibility-page section + section {
  margin-top: clamp(2rem, 4vw, 3rem);
}

.accessibility-page p,
.accessibility-page li,
.accessibility-page dd,
.accessibility-page td {
  color: var(--color-text-muted);
  line-height: 1.75;
}

.accessibility-page__list {
  display: grid;
  gap: 1rem;
  margin: 1.25rem 0 0;
}

.accessibility-page__list > div {
  display: grid;
  gap: 0.25rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 1rem;
}

.accessibility-page__list > div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.accessibility-page__list dt {
  color: var(--color-heading);
  font-weight: 600;
}

.accessibility-page__list dd {
  margin: 0;
}

.accessibility-page__result {
  color: var(--color-heading);
  font-size: 0.9375rem;
}

.accessibility-page__bullets {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0 0;
  padding-left: 1.25rem;
}

.accessibility-page code {
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 0.1em 0.35em;
  font-size: 0.9375em;
}

.accessibility-page__table {
  width: 100%;
  margin-top: 1rem;
  border-collapse: collapse;
}

.accessibility-page__table caption {
  margin-bottom: 0.75rem;
  color: var(--color-text-muted);
  text-align: left;
  caption-side: top;
}

.accessibility-page__table th,
.accessibility-page__table td {
  border-bottom: 1px solid var(--color-border);
  padding: 0.75rem 0.5rem;
  text-align: left;
  vertical-align: top;
}

.accessibility-page__table th {
  color: var(--color-heading);
  font-weight: 600;
}

.accessibility-page .button {
  margin-top: 1rem;
}
</style>
