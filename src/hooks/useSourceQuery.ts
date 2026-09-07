import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ZodError } from 'zod'

import { HttpError, type SourceEnvelope } from '@/lib/api/client'
import { evaluateSource, type SourceName, type SourceState } from '@/lib/health'
import { toError } from '@/lib/toError'
import { useUiStore } from '@/store/ui'

const MAX_RETRIES = 3

/**
 * Retries transport hiccups but not deterministic failures: a schema mismatch
 * or a malformed request will fail identically three more times.
 */
export const defaultRetry = (count: number, err: Error): boolean =>
  !(err instanceof ZodError) &&
  !(err instanceof HttpError && err.status === 400) &&
  count < MAX_RETRIES

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
