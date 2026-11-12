import { useSourceQuery } from '@/hooks/useSourceQuery'
import { HttpError } from '@/lib/api/client'
import { fetchOrreryBodiesEnvelope } from '@/lib/api/orreryBodies'

const HALF_HOUR = 30 * 60 * 1000
/**
 * A 429 is asked again after this, ms (#141): past the Functions' rate limit (60 a
 * minute, `Retry-After: 60`) and the zone's (a 10 s block). Two to eight seconds landed
 * inside both, so all four tries failed and a shared link waited for the half-hourly
 * refetch. A 5xx keeps the quick backoff: /api/orrery-bodies streams KV (_kvBody.ts),
 * which keeps no negative entry, so the next try is a real one.
 */
export const RATE_LIMIT_RETRY_MS = 61_000
const BACKOFF_MAX_MS = 30_000
const TOO_MANY = 429

/** The bodies' retry wait, ms: 61 s after a 429, the app's usual backoff otherwise. */
export function bodiesRetryDelay(attempt: number, err: unknown): number {
  if (err instanceof HttpError && err.status === TOO_MANY) return RATE_LIMIT_RETRY_MS
  return Math.min(1000 * 2 ** attempt, BACKOFF_MAX_MS)
}

/**
 * The orrery's craft, Earth and Moon (#93). Only the orrery page calls this, so the
 * ~70 KB (gzip) answer is fetched when the tab opens, never with the rest of the site.
 */
export function useOrreryBodies() {
  return useSourceQuery('orrery-bodies', {
    queryKey: ['orrery-bodies'],
    queryFn: fetchOrreryBodiesEnvelope,
    staleTime: HALF_HOUR,
    refetchInterval: HALF_HOUR,
    refetchOnWindowFocus: false,
    // The app's retry rule (infrastructure, three times, never a contract), with its own wait.
    retryDelay: bodiesRetryDelay,
  })
}
