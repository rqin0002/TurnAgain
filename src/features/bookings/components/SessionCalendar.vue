<script setup>
import '@fullcalendar/vue3/skeleton.css'
import '@fullcalendar/vue3/themes/classic/theme.css'
import '@fullcalendar/vue3/themes/classic/palette.css'

import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/vue3/daygrid'
import listPlugin from '@fullcalendar/vue3/list'
import enAuLocale from '@fullcalendar/vue3/locales/en-au'
import classicThemePlugin from '@fullcalendar/vue3/themes/classic'
import { computed } from 'vue'

// The sessions calendar: FullCalendar v7 in its own lazy chunk (the views
// mount it through SessionCalendarLoader, which says when the chunk is loading or failed), never
// the only way to a session (the List view, "Skip calendar" and a text legend sit beside it).
// Events come from toCalendarEvents; their titles carry the meaning, the legend says what each
// title word means, and the tone classes only colour them. The month title's heading level
// follows the page's outline. A click or Enter on an event emits the session; the page decides
// where it goes.
const props = defineProps({
  events: { type: Array, required: true },
  initialDate: { type: String, required: true },
  skipTarget: { type: String, required: true },
  headingLevel: {
    type: Number,
    default: 2,
    validator: (value) => Number.isInteger(value) && value >= 1 && value <= 6,
  },
})

const emit = defineEmits(['select-session'])

// Read once when the calendar mounts: a phone gets the list month, a wider screen the grid.
const narrow =
  typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767.98px)').matches

const options = computed(() => ({
  plugins: [classicThemePlugin, dayGridPlugin, listPlugin],
  locale: enAuLocale,
  timeZone: 'Australia/Melbourne',
  initialView: narrow ? 'listMonth' : 'dayGridMonth',
  initialDate: props.initialDate,
  events: props.events,
  editable: false,
  eventInteractive: true,
  views: { dayGridMonth: { displayEventTime: false } },
  headingLevel: props.headingLevel,
  eventClick: (info) => {
    info.jsEvent.preventDefault()
    emit('select-session', {
      sessionId: info.event.id,
      activityId: info.event.extendedProps.activityId,
    })
  },
}))
</script>

<template>
  <div class="session-calendar">
    <a class="session-calendar__skip" :href="`#${skipTarget}`">Skip calendar</a>
    <p class="session-calendar__legend">
      Legend: "3 left" (any number) can be booked; "Full" can still join the waitlist; "Waitlist
      full", "Started" and "Cancelled" can't be booked; "Provider booking" is booked with its
      provider and "Drop-in" needs no booking; "Booked" is one of your bookings; "On waitlist" is
      one of your waitlist places.
    </p>
    <FullCalendar :options="options" />
  </div>
</template>

<style scoped>
/* The classic theme's custom properties, mapped to the app tokens so both themes follow them. */
.session-calendar {
  --fc-classic-background: var(--color-surface);
  --fc-classic-foreground: var(--color-text);
  --fc-classic-muted-foreground: var(--color-text-muted);
  --fc-classic-faint-foreground: var(--color-text-muted);
  --fc-classic-border: var(--color-border);
  --fc-classic-strong-border: var(--color-border-strong);
  --fc-classic-primary: var(--color-brand);
  --fc-classic-primary-foreground: var(--color-on-brand);
  --fc-classic-button: var(--color-brand);
  --fc-classic-button-border: var(--color-brand);
  --fc-classic-button-strong: var(--color-brand-strong);
  --fc-classic-button-strong-border: var(--color-brand-strong);
  --fc-classic-button-foreground: var(--color-on-brand);
  --fc-classic-today: var(--color-brand-soft);
  --fc-classic-event: var(--color-brand-soft);
  --fc-classic-event-contrast: var(--color-heading);

  display: grid;
  gap: 1rem;
  color: var(--color-text);
}

.session-calendar__skip {
  justify-self: start;
}

.session-calendar__legend {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.session-calendar :deep(.session-event--limited),
.session-calendar :deep(.session-event--full) {
  --fc-classic-event: var(--color-warning-soft);
}

.session-calendar :deep(.session-event--booked) {
  --fc-classic-event: var(--color-success-soft);
}

.session-calendar :deep(.session-event--cancelled),
.session-calendar :deep(.session-event--closed),
.session-calendar :deep(.session-event--external) {
  --fc-classic-event: var(--color-surface-muted);
}
</style>
