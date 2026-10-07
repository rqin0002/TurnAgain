import { capabilities } from '@/firebase/firebaseFunctionsClient.js'

/**
 * Whether this build calls the staff Cloud Functions at all (decided from
 * configuration, never inferred from an `unavailable` error). Staff composables read it here
 * because only a data module may import the wiring (the `isBookingEmailEnabled` pattern).
 */
export const isStaffFunctionsEnabled = () => capabilities.functions
