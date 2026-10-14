import { onBeforeUnmount, onMounted, shallowRef } from 'vue'

/**
 * The time, read when the component is created and again every minute while it is mounted, so a
 * page left open keeps "Open now", today's hours and the like current. It only reads the machine's
 * clock; turning the instant into a Melbourne weekday and minute is `melbourneClock`'s job
 * (functions/shared/melbourneTime.js). The interval stops when the component unmounts.
 *
 * @returns {import('vue').ShallowRef<Date>}
 */
export function useMinuteClock() {
  const now = shallowRef(new Date())
  let interval = null
  onMounted(() => {
    interval = window.setInterval(() => {
      now.value = new Date()
    }, 60_000)
  })
  onBeforeUnmount(() => window.clearInterval(interval))
  return now
}
