/**
 * The signal one outgoing fetch uses: the caller's abort plus a timeout, and a `dispose` that
 * clears the fallback's timer once the fetch has settled. Engines with `AbortSignal.any` and
 * `AbortSignal.timeout` (Chrome 116, Firefox 124, Safari 17.4) combine the two; older ones get one
 * controller that a timer aborts with a `TimeoutError` and the caller's signal forwards to, so a
 * caller maps a timeout the same way in both.
 *
 * @param {AbortSignal | undefined} signal the caller's abort, if any
 * @param {number} timeoutMs
 * @returns {{ signal: AbortSignal, dispose: () => void }}
 */
export function requestSignal(signal, timeoutMs) {
  if (typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function') {
    const timeout = AbortSignal.timeout(timeoutMs)
    return { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, dispose: () => {} }
  }
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    timeoutMs,
  )
  const forward = () => controller.abort(signal.reason)
  signal?.addEventListener('abort', forward, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    },
  }
}
