import { computed, ref, shallowRef } from 'vue'

import {
  createItemCategory,
  fetchItemCategories,
  readCachedItemCategories,
} from '../data/itemCategoryRepository.js'
import { createCategoryIndex } from '../domain/itemCategories.js'

/**
 * The item categories every page matches and labels with: the twelve bundled ones, always, plus
 * the ones an admin added to the shared catalogue. One state for the whole app (module level), so
 * an addition on the service form is known at once to the register and to search.
 *
 * Each use loads unless `autoLoad` is false (the repository keeps a read for five minutes, so this
 * is cheap). The first load paints the saved copy of the added categories, if any. `status` is
 * 'idle' until the first load, 'loading' while a read runs and no added categories are known yet,
 * 'ready' once they are (saved or read), and 'error' when a read failed with none known; `error`
 * holds the last failure, also after a saved copy painted. The index always holds the twelve, so
 * a page whose catalogue did not load still matches and labels with them. `create({ name,
 * terms })` adds a category (the rules allow admins only) and puts the catalogue its transaction
 * saw into this state before resolving `{ outcome, id, label }`; a refusal rejects with the
 * repository's error and changes nothing.
 */

const added = shallowRef([])
const status = ref('idle')
const error = shallowRef(null)
let pending = null

const index = computed(() => createCategoryIndex(added.value))
const categories = computed(() =>
  index.value.categories.map((category) => ({ id: category.id, label: category.label })),
)
const ids = computed(() => index.value.ids)

function load({ force = false } = {}) {
  if (pending) return pending
  if (status.value === 'idle') {
    const saved = readCachedItemCategories()
    if (saved) {
      added.value = saved.added
      status.value = 'ready'
    }
  }
  if (status.value !== 'ready') status.value = 'loading'
  pending = fetchItemCategories({ force })
    .then((catalogue) => {
      added.value = catalogue.added
      status.value = 'ready'
      error.value = null
    })
    .catch((caught) => {
      error.value = caught
      if (status.value !== 'ready') status.value = 'error'
    })
    .finally(() => {
      pending = null
    })
  return pending
}

async function create(input) {
  const result = await createItemCategory(input)
  added.value = result.catalogue.added
  status.value = 'ready'
  error.value = null
  return { outcome: result.outcome, id: result.id, label: result.label }
}

/**
 * @param {{ autoLoad?: boolean }} [options]
 */
export function useItemCategories({ autoLoad = true } = {}) {
  if (autoLoad) load()
  return { status, error, index, categories, ids, load, create }
}
