// The deploy entry point: Firebase deploys exactly the functions exported here, the public HTTP
// `api` and the four callables the app calls. A handler that is not re-exported here is not
// deployed.
export { api } from './api.js'
export { sendBookingEmail } from './sendBookingEmail.js'
export { sendSessionEmail } from './sendSessionEmail.js'
export { promoteNextBooking } from './promoteNextBooking.js'
export { adminSetUserAccess } from './adminSetUserAccess.js'
