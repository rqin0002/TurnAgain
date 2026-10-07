<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

/** "Back online" stays up this long after the connection returns (spec 11). */
const BACK_ONLINE_MS = 5000

const props = defineProps({
  online: { type: Boolean, required: true },
})

const backOnline = ref(false)
let timer

// The live region stays in the document the whole time so a change of text is announced;
// only the text comes and goes.
const message = computed(() => {
  if (!props.online) {
    return "You may be offline. Pages you've already opened still work."
  }
  return backOnline.value ? 'Back online' : ''
})

watch(
  () => props.online,
  (isOnline, wasOnline) => {
    clearTimeout(timer)
    backOnline.value = false
    if (isOnline && wasOnline === false) {
      backOnline.value = true
      timer = setTimeout(() => {
        backOnline.value = false
      }, BACK_ONLINE_MS)
    }
  },
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    class="offline-banner"
    :class="{ 'offline-banner--idle': message === '', 'offline-banner--online': backOnline }"
    role="status"
    aria-live="polite"
  >
    <p v-if="message" class="shell offline-banner__text">{{ message }}</p>
  </div>
</template>

<style scoped>
.offline-banner {
  border-bottom: 1px solid var(--color-border-strong);
  background: var(--color-surface-muted);
  color: var(--color-text);
  transition: background-color var(--duration-fast);
}

.offline-banner--idle {
  border-bottom: 0;
}

.offline-banner--online {
  background: var(--color-brand-soft);
}

.offline-banner__text {
  margin: 0;
  padding-block: 0.625rem;
  font-size: 0.9375rem;
}
</style>
