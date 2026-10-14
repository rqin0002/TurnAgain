import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore/lite'

import { firestoreLite } from '@/firebase/firebaseFirestoreLiteClient.js'
import { CACHE_KEYS, readCache, writeCache } from '@/shared/data/localCache.js'
import {
  RepositoryError,
  throwIfAborted,
  toRepositoryError,
} from '@/shared/data/RepositoryError.js'

import {
  ITEM_CATEGORY_DOCUMENT,
  appendItemCategory,
  checkCategoryInput,
  projectItemCategoryCatalogue,
} from '../domain/itemCategoryCatalogue.js'

/**
 * The shared item-category catalogue: the public read of `itemCategories/catalogue` and an admin's
 * addition. A read is kept in memory for five minutes and saved under CACHE_KEYS.itemCategories
 * (the added categories and the revision only) so the next visit can paint them before the read.
 * An absent document is not an error: no category has been added yet. Anyone may read it, so a
 * refused read (rules that do not allow it yet) is `unavailable` and never asks the auth store to
 * check the signed-in profile again.
 *
 * An addition is one transaction: it reads the document, returns the category whose name has the
 * same key if there is one, otherwise appends the new one and writes the whole document with the
 * server's time. So a retry after a lost answer, a double press, or two admins adding the same
 * name at once never add it twice: a write built on a list that changed after its read is refused
 * (the rules want exactly the next revision), and that refusal is reported as `conflict`, so
 * pressing Create category again reads the new list.
 * The rules decide who may add: an active, verified admin. Every failure is a RepositoryError,
 * except a read aborted through its signal, which rejects with the AbortError.
 */

const CACHE_TTL_MS = 5 * 60 * 1000
let memory = null

const reference = () =>
  doc(firestoreLite, ITEM_CATEGORY_DOCUMENT.collection, ITEM_CATEGORY_DOCUMENT.id)
const unexpected = () =>
  new RepositoryError('invalid-data', 'The category list has an unexpected structure.')
const remember = (value) => {
  memory = { at: Date.now(), value }
  writeCache(CACHE_KEYS.itemCategories, value)
}
const asCatalogue = (projected) => ({ added: projected.added, revision: projected.revision })

/** Forgets the in-memory read (the saved copy stays). */
export function clearItemCategoryCache() {
  memory = null
}

/** The saved copy of the last read or addition, `{ added, revision }`, or null. */
export function readCachedItemCategories() {
  const value = readCache(CACHE_KEYS.itemCategories)?.value
  if (!value || !Array.isArray(value.added) || !Number.isInteger(value.revision)) return null
  return { added: value.added, revision: value.revision }
}

/**
 * The categories an admin added, in order, and the catalogue's revision (0 when none was added).
 *
 * @returns {Promise<{ added: Array<{ id: string, label: string, terms: string[], broadMatches: string[] }>, revision: number }>}
 */
export async function fetchItemCategories({ signal, force = false } = {}) {
  if (!force && memory && Date.now() - memory.at < CACHE_TTL_MS) return memory.value
  try {
    throwIfAborted(signal)
    const snapshot = await getDoc(reference())
    throwIfAborted(signal)
    const projected = projectItemCategoryCatalogue(snapshot.exists() ? snapshot.data() : null)
    if (projected === null) throw unexpected()
    const value = asCatalogue(projected)
    remember(value)
    return value
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw new RepositoryError('unavailable', undefined, { cause: error })
    }
    throw toRepositoryError(error)
  }
}

/**
 * Adds the category an admin typed, or finds the one that already has that name. Resolves
 * `{ outcome: 'created' | 'exists', id, label, catalogue }`, or `{ outcome: 'full', id: null,
 * label, catalogue }` when the list holds 100 categories; `catalogue` is the added categories as
 * the transaction saw them (one version for every reader). Rejects with `invalid-data` (input
 * that fails checkCategoryInput, with `details.fields`, before anything is read; or a stored
 * document of an unexpected shape), `permission` (the rules refused: not an active, verified
 * admin), `network` / `offline` (no answer: the addition may have been saved, and trying again
 * finds it), `conflict` (another change to the list landed between this read and this write, or
 * the transaction kept colliding with other writes) or `unavailable` (anything else).
 *
 * @param {{ name: string, terms?: string[] }} input
 */
export async function createItemCategory(input) {
  const checked = checkCategoryInput(input)
  if (!checked.isValid) {
    throw new RepositoryError('invalid-data', 'Check the name and the search words.', {
      details: { fields: checked.errors },
    })
  }
  let readRevision = null
  try {
    const { step, stored } = await runTransaction(firestoreLite, async (transaction) => {
      const snapshot = await transaction.get(reference())
      const current = snapshot.exists() ? snapshot.data() : null
      readRevision = current?.revision ?? 0
      if (current !== null && projectItemCategoryCatalogue(current) === null) throw unexpected()
      const next = appendItemCategory(current, checked.values)
      if (next.outcome === 'created') {
        transaction.set(reference(), { ...next.data, updatedAt: serverTimestamp() })
      }
      return { step: next, stored: current }
    })
    const catalogue = asCatalogue(
      projectItemCategoryCatalogue(step.outcome === 'created' ? step.data : stored),
    )
    remember(catalogue)
    return { outcome: step.outcome, id: step.id, label: step.label, catalogue }
  } catch (error) {
    if (error?.code === 'permission-denied' && (await movedSince(readRevision))) {
      throw new RepositoryError('conflict', undefined, { cause: error })
    }
    throw toRepositoryError(error)
  }
}

/**
 * After a refused write: whether the stored list has moved on from the revision the transaction
 * read (another addition landed first). The rules refuse such a write with the same answer they
 * give a caller who may not write at all, so this one read tells the two apart; a read that fails
 * counts as not moved.
 */
async function movedSince(revision) {
  if (revision === null) return false
  try {
    const snapshot = await getDoc(reference())
    return (snapshot.exists() ? snapshot.data().revision : 0) !== revision
  } catch {
    return false
  }
}
