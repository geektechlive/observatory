import type { QueryClient } from '@tanstack/react-query'

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

/**
 * Ask every active feed again once the server's fresh copies have landed (#83). Not the
 * on-demand JPL lookups (`jpl-lookup*` keys). A span past its 24 h cache can answer
 * REVALIDATING, but its old answer is still valid data, and a re-ask can spend the JPL
 * queue's daily budget (#215: every revalidation re-asked a shown lookup's span and its
 * dense span).
 */
export function revalidateFeeds(client: QueryClient): Promise<void> {
  return client.invalidateQueries({
    refetchType: 'active',
    predicate: (q) => !String(q.queryKey[0]).startsWith('jpl-lookup'),
  })
}
