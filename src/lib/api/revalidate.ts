/**
 * How long to wait after an old answer before asking again (#83). The server's background
 * refresh gives up by fetchUpstream's 8 s deadline, so by then the fresh copy, or the
 * STALE marking of a failed refresh, is in its cache.
 */
export const REVALIDATE_REFETCH_MS = 10_000

/**
 * Returns a notifier that runs `refetch` once, `delayMs` after the first notification.
 * A cold page load gets several old answers at once; they share one refetch.
 */
export function refetchOnceAfter(refetch: () => void, delayMs = REVALIDATE_REFETCH_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      refetch()
    }, delayMs)
  }
}
