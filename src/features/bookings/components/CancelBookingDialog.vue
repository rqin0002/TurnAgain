<script setup>
import { formatSessionWhen } from '@shared/melbourneTime.js'
import { onMounted, ref, watch } from 'vue'

import AppButton from '@/shared/components/AppButton.vue'
import { describeError } from '@/shared/domain/errorCopy.js'

// The cancel confirmation (spec 7.7 L956): a native <dialog> opened with showModal(), so focus is
// trapped and Escape closes it. It only asks; the page runs the cancel and passes `busy`/`error`.
const props = defineProps({
  booking: { type: Object, default: null },
  open: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  error: { type: Object, default: null },
})

const emit = defineEmits(['confirm', 'close'])

const dialog = ref(null)

const sync = (open) => {
  const element = dialog.value
  if (!element) return
  if (open && !element.open) element.showModal()
  if (!open && element.open) element.close()
}

onMounted(() => sync(props.open))
watch(
  () => props.open,
  (open) => sync(open),
  { flush: 'post' },
)
</script>

<template>
  <dialog
    ref="dialog"
    class="cancel-dialog"
    aria-labelledby="cancel-dialog-title"
    @close="emit('close')"
  >
    <h2 id="cancel-dialog-title">Cancel this booking?</h2>
    <p v-if="booking">
      {{ booking.activityTitle }}, {{ formatSessionWhen(booking.startsAt, booking.endsAt) }}.
      Reference {{ booking.reference }}.
    </p>
    <!-- Mounted with the dialog; only its text changes (M5-D17). -->
    <p class="cancel-dialog__error" role="alert">{{ error ? describeError(error) : '' }}</p>
    <div class="cancel-dialog__actions">
      <AppButton
        variant="primary"
        :busy="busy"
        :disabled="!booking"
        @click="emit('confirm', booking.id)"
      >
        Cancel booking
      </AppButton>
      <AppButton variant="secondary" :disabled="busy" @click="emit('close')">
        Keep booking
      </AppButton>
    </div>
  </dialog>
</template>

<style scoped>
.cancel-dialog {
  max-width: min(32rem, calc(100vw - 2rem));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-medium);
  background: var(--color-surface);
  padding: 1.5rem;
  color: var(--color-text);
}

.cancel-dialog::backdrop {
  background: color-mix(in srgb, var(--color-heading) 40%, transparent);
}

.cancel-dialog h2 {
  margin: 0 0 0.75rem;
  color: var(--color-heading);
  font-size: 1.25rem;
}

.cancel-dialog__error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 600;
}

.cancel-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.25rem;
}
</style>
