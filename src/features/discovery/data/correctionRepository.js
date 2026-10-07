import { addDoc, collection, serverTimestamp } from 'firebase/firestore/lite'

import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import { toRepositoryError } from '@/shared/data/RepositoryError.js'

import { toNewCorrection } from '../domain/correctionValidation.js'

/**
 * The public half of corrections (spec 8.5, 4.4 L567-580): anyone, signed in or not, files an open
 * correction against a published service. The document is the twelve keys of `isValidCorrection`
 * with both timestamps from the server; nothing is read back and nothing is cached (corrections
 * are staff data, spec 11). A refusal (an unpublished service, a malformed record) is
 * `permission`; transport failures keep their own codes.
 *
 * @param {{ serviceId: string, serviceName: string, field: string, message: string, reporterEmail: string | null, reporterUid: string | null }} input
 * @returns {Promise<{ id: string }>}
 */
export async function createCorrection(input) {
  try {
    const reference = await addDoc(collection(firestoreLite, 'corrections'), {
      ...toNewCorrection(input),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { id: reference.id }
  } catch (error) {
    throw toRepositoryError(error)
  }
}
