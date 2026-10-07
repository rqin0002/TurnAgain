<script setup>
import { formatSessionWhen } from '@shared/melbourneTime.js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { formatSessionStatus } from '@/features/activities/domain/activityCatalogue.js'
import ParticipantEmailForm from '@/features/staff/components/ParticipantEmailForm.vue'
import ParticipantsTable from '@/features/staff/components/ParticipantsTable.vue'
import { useParticipants } from '@/features/staff/composables/useParticipants.js'
import { usePromotion } from '@/features/staff/composables/usePromotion.js'
import { useStaffCatalogue } from '@/features/staff/composables/useStaffCatalogue.js'
import { useStaffSession } from '@/features/staff/composables/useStaffSession.js'
import {
  PARTICIPANT_DEFAULT_SORT,
  PARTICIPANT_TABLE_COLUMNS,
  recentPromotions,
  selectionCountText,
} from '@/features/staff/domain/participants.js'
import AppButton from '@/shared/components/AppButton.vue'
import CapabilityNotice from '@/shared/components/CapabilityNotice.vue'
import ExportButtons from '@/shared/components/ExportButtons.vue'
import StatePanel from '@/shared/components/StatePanel.vue'
import { useTableState } from '@/shared/composables/useTableState.js'

/**
 * The staff session page: the session header, Promote next (or the capability
 * notice), Mark participants notified on a cancelled session that still needs it, the selection
 * controls with a live count, the participants table and its export (personal data; About >
 * Privacy says staff can export participant lists). After any promotion outcome the catalogue and
 * the participants reload, and rows promoted in the last ten minutes offer the email.
 * When Promote next turns disabled, Mark participants notified goes away or a row's email button
 * goes away as its action settles, focus moves to the status line that reports the result, and a
 * Try again moves it to the heading above its panel, never to <body>. A failed
 * reload keeps what was loaded earlier and says so, like the registers.
 */
const props = defineProps({
  sessionId: { type: String, required: true },
})

// Promote next and the recent promotions compare with the time, so they follow the clock on a page
// left open: the time is read again each minute and after every reload.
const now = ref(new Date())
const readClock = () => {
  now.value = new Date()
}
let clock = null
onMounted(() => {
  clock = window.setInterval(readClock, 60000)
})
onBeforeUnmount(() => window.clearInterval(clock))

const catalogue = useStaffCatalogue()
const staffSession = useStaffSession(() => props.sessionId, { now: () => now.value })
const {
  session,
  activityTitle,
  state: pageState,
  functionsEnabled,
  canPromote,
  showMarkNotified,
  notifyState,
  notifyMessage,
  markNotified,
} = staffSession
const participants = useParticipants(() => props.sessionId)
const {
  bookings,
  rows,
  status: participantsStatus,
  error: participantsError,
  truncated: participantsTruncated,
  selectedIds,
  selectedBookings,
  liveCount,
  select,
  toggle,
} = participants

const reloadAll = async () => {
  await Promise.all([catalogue.reload(), participants.reload()])
  readClock()
}
const promotion = usePromotion({
  sessionId: () => props.sessionId,
  onSettled: reloadAll,
})
const { state: promotionState, message: promotionMessage, emailStates } = promotion

const table = useTableState(PARTICIPANT_TABLE_COLUMNS, {
  defaultSort: PARTICIPANT_DEFAULT_SORT,
  rows: () => rows.value,
})
const { state: tableState, result: tableResult, totalCount } = table

const heading = computed(() => {
  if (pageState.value === 'ready') return activityTitle.value
  if (pageState.value === 'not-found') return 'Session not found'
  return 'Session participants'
})
const sessionNotice = computed(() =>
  catalogue.error.value
    ? `Showing the session loaded earlier. ${catalogue.errorMessage.value}`
    : '',
)
const participantsNotice = computed(() =>
  participantsError.value
    ? `Showing the participants loaded earlier. ${participantsError.value.message ?? ''}`
    : '',
)
const recentIds = computed(() => recentPromotions(bookings.value, now.value).map(({ id }) => id))
const countText = computed(() => selectionCountText(selectedIds.value.length, liveCount.value))

const promotionLine = ref(null)
const notifyLine = ref(null)
const promote = async () => {
  await promotion.promote()
  await nextTick()
  if (!canPromote.value) promotionLine.value?.focus()
}
const notify = async () => {
  await markNotified()
  await nextTick()
  if (!showMarkNotified.value) notifyLine.value?.focus()
}

// A sent or test-mode email takes the row's button away under the focus, so the focus moves to that
// row's email line, which reports the result. A failure keeps Send again, and the focus.
const participantsBlock = ref(null)
const sendEmail = async (bookingId) => {
  await promotion.sendEmail(bookingId, {
    resend: emailStates.value[bookingId]?.status === 'failed',
  })
  await nextTick()
  if (document.activeElement && document.activeElement !== document.body) return
  const emailLine = participantsBlock.value?.querySelector(`[data-email-line="${bookingId}"]`)
  ;(emailLine ?? promotionLine.value)?.focus()
}

// Try again leaves with its error panel once the reload starts, so focus moves first to the heading
// that stays mounted over the loading state.
const pageHeading = ref(null)
const participantsHeading = ref(null)
const retrySession = () => {
  pageHeading.value?.focus()
  return catalogue.reload()
}
const retryParticipants = () => {
  participantsHeading.value?.focus()
  return participants.reload()
}
</script>

<template>
  <section class="staff-section staff-session" aria-labelledby="staff-session-heading">
    <h2 id="staff-session-heading" ref="pageHeading" class="section-title" tabindex="-1">
      <span dir="auto">{{ heading }}</span>
    </h2>

    <StatePanel
      v-if="pageState === 'loading'"
      variant="loading"
      title="Loading the session"
      message="Reading the staff catalogue…"
    />
    <StatePanel
      v-else-if="pageState === 'error'"
      variant="error"
      title="This session is unavailable"
      :error="catalogue.error.value"
      @retry="retrySession"
    />
    <StatePanel
      v-else-if="pageState === 'not-found'"
      variant="empty"
      message="This session is not in the staff catalogue. It may have been removed, or the link may be incomplete."
    />

    <template v-else>
      <p class="staff-session__notice" role="status">{{ sessionNotice }}</p>
      <div class="staff-session__summary">
        <p class="staff-session__when">
          {{ formatSessionWhen(session.startsAt, session.endsAt) }}
        </p>
        <p>
          <span dir="auto">{{ session.venueName }}</span
          >,
          <span dir="auto">{{ session.suburb }}</span>
        </p>
        <p>Status: {{ formatSessionStatus(session.status) }}</p>
        <template v-if="session.registrationType === 'turnagain'">
          <p>Booked {{ session.bookedCount }}/{{ session.capacity }}</p>
          <p>Waitlist {{ session.waitlistCount }}</p>
        </template>
        <p v-else>Provider managed</p>
      </div>

      <section class="staff-session__actions" aria-labelledby="staff-session-promote-heading">
        <h3 id="staff-session-promote-heading">Waitlist</h3>
        <CapabilityNotice :enabled="functionsEnabled" feature="promotion" />
        <AppButton
          v-if="functionsEnabled"
          :busy="promotionState === 'promoting'"
          :disabled="!canPromote"
          :aria-describedby="canPromote ? undefined : 'staff-session-promote-hint'"
          @click="promote()"
          >Promote next</AppButton
        >
        <p
          v-if="functionsEnabled && !canPromote"
          id="staff-session-promote-hint"
          class="staff-session__hint"
        >
          Promote next needs an open session that has not started, with a free place and someone on
          the waitlist.
        </p>
        <p ref="promotionLine" class="staff-session__line" role="status" tabindex="-1">
          {{ promotionMessage }}
        </p>
        <AppButton
          v-if="showMarkNotified"
          variant="secondary"
          :busy="notifyState === 'saving'"
          @click="notify()"
          >Mark participants notified</AppButton
        >
        <p ref="notifyLine" class="staff-session__line" role="status" tabindex="-1">
          {{ notifyMessage }}
        </p>
      </section>

      <!-- A div, not a section: the table's focus fallback looks for the nearest section's h2[tabindex="-1"], the page heading. -->
      <div ref="participantsBlock" class="staff-session__participants">
        <h3 id="staff-session-participants" ref="participantsHeading" tabindex="-1">
          Participants
        </h3>
        <StatePanel
          v-if="participantsStatus === 'loading' || participantsStatus === 'idle'"
          variant="loading"
          title="Loading participants"
          message="Reading the bookings of this session…"
        />
        <StatePanel
          v-else-if="participantsStatus === 'error'"
          variant="error"
          title="Participants are unavailable"
          :error="participantsError"
          @retry="retryParticipants"
        />
        <template v-else>
          <p class="staff-session__notice" role="status">{{ participantsNotice }}</p>
          <div class="staff-session__select" role="group" aria-label="Select participants">
            <AppButton variant="secondary" @click="select('all')">Select all</AppButton>
            <AppButton variant="secondary" @click="select('confirmed')">Select confirmed</AppButton>
            <AppButton variant="secondary" @click="select('waitlisted')"
              >Select waitlisted</AppButton
            >
            <AppButton variant="secondary" @click="select('none')">Select none</AppButton>
          </div>
          <p class="staff-session__count" aria-live="polite">{{ countText }}</p>
          <ParticipantsTable
            :columns="PARTICIPANT_TABLE_COLUMNS"
            :result="tableResult"
            :state="tableState"
            :total-count="totalCount"
            :truncated="participantsTruncated"
            :selected-ids="selectedIds"
            :email-states="emailStates"
            :recent-ids="recentIds"
            :email-enabled="functionsEnabled"
            @filter="table.setFilter"
            @clear-filters="table.clearFilters"
            @sort="table.setSort"
            @page="table.setPage"
            @toggle="toggle"
            @send-email="sendEmail"
          >
            <template #toolbar>
              <ExportButtons
                :columns="PARTICIPANT_TABLE_COLUMNS"
                :rows="tableResult.allRows"
                :dataset="`participants-${sessionId}`"
                :filters="tableState.filters"
                :truncated="participantsTruncated"
              />
            </template>
          </ParticipantsTable>
        </template>
      </div>

      <!-- Keyed by the session: between two cached sessions the route change keeps this page's instance, and the form's draft, operation and result belong to one session. -->
      <ParticipantEmailForm
        :key="sessionId"
        :session-id="sessionId"
        :session="session"
        :activity-title="activityTitle"
        :selected-bookings="selectedBookings"
        :live-count="liveCount"
        :email-logs="catalogue.emailLogs.value"
        @participants-changed="participants.reload()"
        @settled="catalogue.reload()"
      />
    </template>
  </section>
</template>

<style scoped>
.staff-session__summary p,
.staff-session__notice,
.staff-session__line,
.staff-session__hint,
.staff-session__count {
  margin: 0 0 0.5rem;
}

.staff-session__actions,
.staff-session__participants {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.5rem;
  justify-items: start;
}

.staff-session__participants {
  justify-items: stretch;
}

.staff-session__select {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.staff-session__hint {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
