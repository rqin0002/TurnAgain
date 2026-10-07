import { collection, doc, getDoc, orderBy, query } from 'firebase/firestore/lite'

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
 * The Team tab's data: the admin's list of every profile (read
 * whole through readAll, newest first; a profile without `createdAt` is outside an orderBy query
 * and is not listed), one profile by uid for a row reload, and the adminSetUserAccess
 * callable. Nothing is cached or persisted: user lists are staff data.
 */

/**
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ users: object[], skippedCount: number, truncated: boolean }>}
 */
export async function listUsers({ signal } = {}) {
  try {
    const { docs, truncated } = await readAll(
      query(collection(firestoreLite, 'users'), orderBy('createdAt', 'desc')),
      { signal },
    )
    const users = []
    let skippedCount = 0
    for (const snapshot of docs) {
      const user = projectTeamUser(snapshot.id, snapshot.data())
      if (user) users.push(user)
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
