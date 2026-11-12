import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ZodError } from 'zod'

import { HttpError, type SourceEnvelope } from '@/lib/api/client'
import { evaluateSource, type SourceName, type SourceState } from '@/lib/health'
import { toError } from '@/lib/toError'
import { useUiStore } from '@/store/ui'

const MAX_RETRIES = 3

/** 400: our malformed request. 500: `contractError()`, an upstream payload that broke our schema. */
const NEVER_RETRY_STATUS = new Set([400, 500])

/**
 * Retries infrastructure (a dropped connection, 502/503/504, 429) but never a contract
 * (#218): a schema mismatch in the client, a 500 or an `X-Error-Kind: contract` answer,
 * or a malformed request will fail identically three more times.
 */
export const defaultRetry = (count: number, err: Error): boolean =>
  !(err instanceof ZodError) &&
  !(err instanceof HttpError && (NEVER_RETRY_STATUS.has(err.status) || err.contract)) &&
  count < MAX_RETRIES

/**
 * A retry after a 429, or after the server's negative entry, waits this long at least, ms
 * (#218): past the Functions' rate limit (60 a minute, `Retry-After: 60`), the zone's 10 s
 * block, and `_cache.ts`'s 60 s negative entry. The orrery bodies' 61 s (#141) is this one.
 */
export const RATE_LIMIT_RETRY_MS = 61_000
/** A longer Retry-After is honoured up to this, ms. */
const RETRY_WAIT_MAX_MS = 120_000
/** The quick backoff (1, 2, 4 s ...) stops growing here, ms. */
const BACKOFF_MAX_MS = 30_000
const TOO_MANY = 429

/**
 * The app's retry wait (main.tsx's default). A 429 or a replayed negative entry waits
 * 61 s, or a longer Retry-After up to 2 minutes; a quick 1, 2 and 4 s retry would only
 * meet the same answer. A 5xx the server did not negative-cache (a KV pass-through) or a
 * dropped connection keeps the quick backoff, since its next try is a real one.
 */
export function defaultRetryDelay(attempt: number, err: unknown): number {
  if (err instanceof HttpError && (err.status === TOO_MANY || err.negCached)) {
    const askedMs = (err.retryAfterS ?? 0) * 1000
    return Math.min(RETRY_WAIT_MAX_MS, Math.max(RATE_LIMIT_RETRY_MS, askedMs))
  }
  return Math.min(1000 * 2 ** attempt, BACKOFF_MAX_MS)
}

export interface SourceQueryResult<T> extends Omit<
  UseQueryResult<SourceEnvelope<T>>,
  'data' | 'error'
> {
  data: T | undefined
  error: Error | null
  degraded: boolean
  dataAgeSeconds: number | null
  health: SourceState
}

/**
 * Wraps `useQuery` so every source reports graded health to the store instead of
 * only "did the fetch throw". A valid-but-empty payload now reads as an error,
 * which is what the console was previously showing as LIVE.
 */
export function useSourceQuery<T>(
  name: SourceName,
  options: UseQueryOptions<SourceEnvelope<T>, Error, SourceEnvelope<T>>,
): SourceQueryResult<T> {
  const query = useQuery<SourceEnvelope<T>, Error, SourceEnvelope<T>>({
    refetchIntervalInBackground: false,
    ...options,
  })

  const envelope = query.data
  const rawError: unknown = query.error
  const health = useUiStore((s) => s.sourceHealth[name]) ?? 'unknown'

  useEffect(() => {
    const { setSourceHealth, sourceHealth } = useUiStore.getState()

    if (rawError != null) {
      setSourceHealth(name, 'error')
      return
    }

    if (envelope === undefined) {
      if (sourceHealth[name] === undefined) setSourceHealth(name, 'unknown')
      return
    }

    setSourceHealth(
      name,
      evaluateSource(name, envelope.data, {
        degraded: envelope.degraded,
        dataAgeSeconds: envelope.dataAgeSeconds,
      }),
    )
  }, [name, envelope, rawError])

  return {
    ...query,
    data: envelope?.data,
    error: rawError == null ? null : toError(rawError),
    degraded: envelope?.degraded ?? false,
    dataAgeSeconds: envelope?.dataAgeSeconds ?? null,
    health,
  }
}
