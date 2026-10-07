import { capabilities, getFunctionsClient } from '@/firebase/firebaseFunctionsClient.js'

import { RepositoryError, toRepositoryError } from './RepositoryError.js'

/**
 * The one wrapper every repository uses for a callable (spec 5.9). Gating comes from
 * configuration (`capabilities.functions`), never from an error; the Functions SDK loads lazily
 * so public pages never download it.
 *
 * @param {string} name - the exported function name, exactly as functions/index.js exports it
 * @param {object} data - the request payload
 */
export async function callFunction(name, data) {
  if (!capabilities.functions) {
    throw new RepositoryError('unavailable', 'Functions are not enabled in this deployment.', {
      details: { code: 'functions-off' },
    })
  }
  try {
    // The SDK chunk loads lazily; a failed load (offline, stale deployment) maps like any other error.
    const { httpsCallable } = await import('firebase/functions')
    const result = await httpsCallable(await getFunctionsClient(), name)(data)
    return result.data
  } catch (error) {
    throw toRepositoryError(error, { source: 'functions' })
  }
}
