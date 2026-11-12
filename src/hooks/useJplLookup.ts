import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import {
  fetchLookup,
  fetchTrajectoryAround,
  type LookupState,
  trajectoryWindow,
} from '@/lib/api/jplLookup'
import { evaluateSource } from '@/lib/health'
import { useUiStore } from '@/store/ui'

// On-demand JPL lookup for the orrery search (#100). Each answer is a state, never an
// error, so react-query never retries: a busy JPL is told to the visitor, not hammered.

const HOUR_MS = 3_600_000

/**
 * Report a lookup answer's health like every polled source (#148): an answer graded by its
 * contract, a failure as an error. Busy, not set up, not found and out of range are answers
 * about the request, not faults in the feed, so they report nothing.
 */
export function useLookupHealth(
  name: 'jpl-lookup' | 'jpl-trajectory',
  answer: LookupState<unknown> | undefined,
): void {
  useEffect(() => {
    if (!answer) return
    const { setSourceHealth } = useUiStore.getState()
    if (answer.state === 'ok') {
      setSourceHealth(
        name,
        evaluateSource(name, answer.data, { degraded: false, dataAgeSeconds: null }),
      )
    } else if (answer.reason === 'failed') {
      setSourceHealth(name, 'error')
    }
  }, [name, answer])
}

/** What JPL's Small-Body Database says about `q`; idle while `q` is null. */
export function useJplLookup(q: string | null) {
  const query = useQuery({
    queryKey: ['jpl-lookup', q],
    queryFn: () => fetchLookup(q ?? ''),
    enabled: q !== null,
    staleTime: HOUR_MS,
    retry: false,
  })
  useLookupHealth('jpl-lookup', query.data)
  return query
}

/** Horizons samples around `jd` for a looked-up object; one request per object per day. */
export function useJplTrajectory(id: string | null, jd: number) {
  const day = trajectoryWindow(jd)?.start ?? null
  const query = useQuery({
    queryKey: ['jpl-trajectory', id, day],
    queryFn: () => fetchTrajectoryAround(id ?? '', jd),
    enabled: id !== null,
    staleTime: HOUR_MS,
    retry: false,
  })
  useLookupHealth('jpl-trajectory', query.data)
  return query
}
