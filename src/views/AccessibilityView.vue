<script setup>
import { RouterLink } from 'vue-router'

// The accessibility statement for visitors: what TurnAgain aims for, how to use it with a
// keyboard, a screen reader, zoom or the device's theme and motion settings, what is known not
// to work well, what has and has not been checked, and where to report a problem. The detailed
// records (tools, versions, pages, raw results and the checks still to run) live in
// docs/ACCESSIBILITY.md, which carries the same facts for the people who maintain the site;
// change the two together. The two dates are kept apart on purpose: the checks ran on one day
// and this wording was revised on another, and revising the wording must never make an old
// check look new.
const CHECKED_ON = Object.freeze({ iso: '2026-10-08', label: '8 October 2026' })
const UPDATED_ON = Object.freeze({ iso: '2026-10-14', label: '14 October 2026' })
</script>

<template>
  <article class="page-section accessibility-page">
    <div class="shell reading-width">
      <header class="accessibility-page__intro">
        <p class="eyebrow">Accessibility statement</p>
        <h1 class="page-title">Accessibility</h1>
        <p>
          TurnAgain helps people find places to repair, reuse or recycle things, and it should work
          for everyone who uses it. We aim to meet the Web Content Accessibility Guidelines (WCAG)
          2.1 at level AA. This page explains how you can use the site, where you may still run into
          difficulty, and how to tell us about a problem.
        </p>
      </header>

      <section aria-labelledby="a11y-using-title">
        <h2 id="a11y-using-title" class="section-title">Using TurnAgain</h2>
        <ul class="accessibility-page__bullets">
          <li>
            <strong>Keyboard.</strong> You can move through TurnAgain with the keyboard: “Skip to
            main content” is the first stop when you press Tab, the control in focus always shows an
            outline, and Escape closes the menu and the dialog for cancelling a booking.
          </li>
          <li>
            <strong>Moving between pages.</strong> After a link takes you to a new page, focus moves
            to the start of its main content. A link to a section, such as Contact on the About
            page, moves focus to that section.
          </li>
          <li>
            <strong>Screen readers.</strong> Pages are built with headings, landmarks and labelled
            form fields, and messages such as the number of results are set up to be announced when
            they change.
          </li>
          <li>
            <strong>Zoom and small screens.</strong> Pages rearrange themselves to fit narrow
            screens, so zooming in should not make you scroll sideways.
          </li>
          <li>
            <strong>Maps.</strong> Every place on the Find nearby map is also in the results list,
            with the same details and actions. On the map, Previous place and Next place move from
            pin to pin and name each place they reach.
          </li>
        </ul>
      </section>

      <section aria-labelledby="a11y-display-title">
        <h2 id="a11y-display-title" class="section-title">Light, dark and motion</h2>
        <p>
          TurnAgain follows your device's light or dark setting. When you are signed in, you can
          choose for yourself with the Dark mode switch under Appearance on your Account page; the
          choice is remembered in this browser.
        </p>
        <p>
          If your device is set to reduce motion, TurnAgain turns its animations and transitions
          off, and content appears in place.
        </p>
      </section>

      <section aria-labelledby="a11y-limits-title">
        <h2 id="a11y-limits-title" class="section-title">Known limitations</h2>
        <ul class="accessibility-page__bullets">
          <li>
            The maps are a visual aid and have not been tried with a screen reader. If a map is hard
            to use, the Find nearby results list has every place on it, and each service page gives
            its address in words above the map.
          </li>
          <li>
            Without a connection, TurnAgain offers cached browsing of already-loaded pages: pages
            and results you opened during this visit keep working, but a page you have not opened
            yet, or reopening TurnAgain, needs a connection.
          </li>
          <li>
            Listings link to council and provider websites. Those pages are outside TurnAgain and
            may not meet the same standard.
          </li>
        </ul>
      </section>

      <section aria-labelledby="a11y-checked-title">
        <h2 id="a11y-checked-title" class="section-title">What we have checked</h2>
        <p>
          We last checked TurnAgain on
          <time :datetime="CHECKED_ON.iso">{{ CHECKED_ON.label }}</time
          >, on the main pages you reach from the header and several more:
        </p>
        <ul class="accessibility-page__bullets">
          <li>
            Moving through the main pages with the keyboard alone: every control showed a focus
            outline and focus never got stuck.
          </li>
          <li>
            Automated checks for common problems, including colour contrast, in both the light and
            the dark theme: none were found on the pages checked.
          </li>
          <li>
            Layout at phone, tablet and desktop widths and in a zoomed-in layout: no page needed
            sideways scrolling.
          </li>
        </ul>
        <p>
          Some things have not been checked. No screen-reader testing has been done yet, and real
          browser zoom and larger text settings have not been tried, so we cannot yet say how well
          TurnAgain works with them. Automated checks do not find every problem, and these checks
          did not cover every page.
        </p>
      </section>

      <section aria-labelledby="a11y-contact-title">
        <h2 id="a11y-contact-title" class="section-title">Report a problem</h2>
        <p>
          If something on TurnAgain is hard to use, or does not work with the way you browse, please
          tell us which page you were on, what you were trying to do and what happened. You do not
          need to name a service or activity. Naming your browser, or any assistive technology you
          use, can help us find the problem, but it is optional.
        </p>
        <p>
          Reports go to TurnAgain's public issue tracker on GitHub, where anyone can read them, and
          opening one needs a free GitHub account. Leave out personal details you would not want to
          share. The Contact and corrections section of the About page has the link.
        </p>
        <RouterLink class="button button--secondary" to="/about#contact">
          Contact and corrections
        </RouterLink>
      </section>

      <p class="accessibility-page__updated">
        This statement was updated on
        <time :datetime="UPDATED_ON.iso">{{ UPDATED_ON.label }}</time
        >.
      </p>
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
.accessibility-page li {
  color: var(--color-text-muted);
  line-height: 1.75;
}

/* The short lead word of a bullet reads as its label. */
.accessibility-page strong {
  color: var(--color-heading);
  font-weight: 600;
}

.accessibility-page__bullets {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0;
  padding-left: 1.25rem;
}

.accessibility-page .button {
  margin-top: 1rem;
}

.accessibility-page__updated {
  margin-top: clamp(2rem, 4vw, 3rem);
  font-size: 0.9375rem;
}
</style>
