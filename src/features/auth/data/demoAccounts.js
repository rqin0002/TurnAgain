/**
 * Public credentials for the three local-only demonstration identities.
 * The repository derives production-strength password records before persistence.
 *
 * @type {ReadonlyArray<Readonly<{ uid: string, email: string, password: string, role: string }>>}
 */
export const DEMO_ACCOUNTS = Object.freeze([
  Object.freeze({
    uid: 'user-member-demo',
    email: 'member@turnagain.test',
    password: 'Qwer1234!',
    role: 'member',
  }),
  Object.freeze({
    uid: 'user-staff-demo',
    email: 'staff@turnagain.test',
    password: 'Qwer1234!',
    role: 'staff',
  }),
  Object.freeze({
    uid: 'user-admin-demo',
    email: 'admin@turnagain.test',
    password: 'Qwer1234!',
    role: 'admin',
  }),
])
