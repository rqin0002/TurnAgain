/**
 * The one browser download path: the CSV and JSON exports of the staff tables and the booking's
 * `.ics` file. Not a composable (no reactive state); it sits in `composables/` beside the code
 * that calls it from click handlers.
 */

// WebKit resolves an anchor download after click() returns; FileSaver.js waits this long too.
export const DOWNLOAD_REVOKE_AFTER_MS = 40_000

const revoke = (url) => {
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Nothing left to free: the URL was never usable.
  }
}

/**
 * Offers `text` as a file named `fileName` through a Blob and a temporary `<a download>`; the
 * object URL is freed 40 seconds later. Never throws into a click handler.
 *
 * @param {{ text: string, fileName: string, type: string }} file
 * @returns {boolean} whether the download was offered
 */
export function downloadTextFile({ text, fileName, type }) {
  let url = null
  try {
    url = URL.createObjectURL(new Blob([text], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.append(link)
    try {
      link.click()
    } finally {
      link.remove()
    }
  } catch {
    if (url !== null) {
      revoke(url)
    }
    return false
  }
  window.setTimeout(() => revoke(url), DOWNLOAD_REVOKE_AFTER_MS)
  return true
}
