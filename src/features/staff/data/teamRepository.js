import { collection, doc, getDoc, orderBy, query, where } from 'firebase/firestore/lite'

import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import { callFunction } from '@/shared/data/callFunction.js'
import { readAll } from '@/shared/data/readAll.js'
import {
  RepositoryError,
  throwIfAborted,
  toRepositoryError,
} from '@/shared/data/RepositoryError.js'

import { projectTeamUser } from '../domain/team.js'

/**
 * The admin account pages' data: the profiles of one page's roles (Team: staff and admin;
 * Members: member), read whole through readAll, newest first; one profile by uid for a row
 * reload; and the adminSetUserAccess callable. The role scope is part of the query, so the
 * 1,000-record cap of readAll applies to the page's own accounts and never to a site-wide list
 * split afterwards. The query needs the composite index `users (role asc, createdAt desc)` of
 * firestore.indexes.json (the emulator does not check indexes; the live project refuses the
 * query until the index is built). A profile without `createdAt` is outside an orderBy query and
 * is not listed. Nothing is cached or persisted: user lists are staff data.
 */

/**
 * @param {{ roles: string[], signal?: AbortSignal }} options - `roles`: the page's roles, at least one
 * @returns {Promise<{ users: object[], skippedCount: number, truncated: boolean }>} `skippedCount`
 *   counts the documents read that could not be used: malformed, or (never expected from the
 *   scoped query) of a role outside `roles`
 */
export async function listUsers({ roles, signal } = {}) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new RangeError('listUsers: roles must name at least one role.')
  }
  const scope = roles.length === 1 ? where('role', '==', roles[0]) : where('role', 'in', roles)
  try {
    const { docs, truncated } = await readAll(
      query(collection(firestoreLite, 'users'), scope, orderBy('createdAt', 'desc')),
      { signal },
    )
    const users = []
    let skippedCount = 0
    for (const snapshot of docs) {
      const user = projectTeamUser(snapshot.id, snapshot.data())
      if (user && roles.includes(user.role)) users.push(user)
      else skippedCount += 1
    }
    return { users, skippedCount, truncated }
  } catch (error) {
    throw toRepositoryError(error)
  }
}

/**
 * @param {string} uid
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function fetchTeamUser(uid, { signal } = {}) {
  let snapshot
  try {
    throwIfAborted(signal)
    snapshot = await getDoc(doc(firestoreLite, 'users', uid))
    throwIfAborted(signal)
  } catch (error) {
    throw toRepositoryError(error)
  }
  const user = snapshot.exists() ? projectTeamUser(snapshot.id, snapshot.data()) : null
  if (!user) throw new RepositoryError('not-found')
  return user
}

/**
 * One access change, or a Check when neither `role` nor `status` is given.
 *
 * @param {{ uid: string, role?: string, status?: string, expectedRevision: number }} input
 * @returns {Promise<{ uid: string, role: string, status: string, revision: number, authDisabled: boolean }>}
 */
export function setUserAccess({ uid, role, status, expectedRevision }) {
  return callFunction('adminSetUserAccess', {
    uid,
    expectedRevision,
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
  })
}
