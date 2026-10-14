<script setup>
import { ref } from 'vue'

/**
 * One section of the staff Overview: a card with an h3 that names the section, an optional lead
 * line under it, the body and an optional footer. Every Overview section is built from it, so all
 * of them share one heading level and size, one surface and one spacing scale. The card fills the
 * height its grid row gives it and keeps the footer on its bottom edge, so the cards that sit side
 * by side end on one line. The heading takes focus on request (`focusHeading`), for a control in
 * the section that leaves the page when it is used.
 */
defineProps({
  /** The heading's id; the section is labelled by it. */
  headingId: { type: String, required: true },
})

const heading = ref(null)
const focusHeading = () => heading.value?.focus()

defineExpose({ focusHeading })
</script>

<template>
  <section class="overview-panel" :aria-labelledby="headingId">
    <h3 :id="headingId" ref="heading" class="overview-panel__title" tabindex="-1">
      <slot name="title" />
    </h3>
    <p v-if="$slots.lead" class="overview-panel__lead"><slot name="lead" /></p>
    <div class="overview-panel__body"><slot /></div>
    <div v-if="$slots.footer" class="overview-panel__footer"><slot name="footer" /></div>
  </section>
</template>

<style scoped>
.overview-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: clamp(1rem, 3vw, 1.5rem);
}

.overview-panel__title {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

/* The lead belongs to the heading, so it sits closer to it than the body does. */
.overview-panel__lead {
  margin: -0.5rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

/* The body takes the height the row leaves, which keeps the footer on the card's bottom edge. */
.overview-panel__body {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1rem;
}

.overview-panel__footer {
  border-top: 1px solid var(--color-border);
  padding-top: 0.5rem;
}

/* A loading, empty or error panel inside a card is a quiet inset, not a second card. */
.overview-panel__body :deep(.state-panel) {
  min-height: 0;
  margin: 0;
  border-radius: var(--radius-small);
  background: var(--color-surface-muted);
  padding: 1rem;
}

@media (forced-colors: active) {
  .overview-panel {
    border-color: CanvasText;
  }
}
</style>
