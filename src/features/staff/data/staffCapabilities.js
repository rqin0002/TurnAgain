import { capabilities } from '@/firebase/firebaseFunctionsClient.js'

/**
 * Whether this build calls the staff Cloud Functions at all (spec 5.9, 8.7: decided from
 * configuration, never inferred from an `unavailable` error, A6). Staff composables read it here
 * because only a data module may import the wiring (the M5 `isBookingEmailEnabled` pattern).
 */
export const isStaffFunctionsEnabled = () => capabilities.functions
