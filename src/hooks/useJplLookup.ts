import { useQuery } from '@tanstack/react-query'

import { fetchLookup, fetchTrajectoryAround, trajectoryWindow } from '@/lib/api/jplLookup'

// On-demand JPL lookup for the orrery search (#100). Each answer is a state, never an
// error, so react-query never retries: a busy JPL is told to the visitor, not hammered.

const HOUR_MS = 3_600_000

/** What JPL's Small-Body Database says about `q`; idle while `q` is null. */
export function useJplLookup(q: string | null) {
  return useQuery({
    queryKey: ['jpl-lookup', q],
    queryFn: () => fetchLookup(q ?? ''),
    enabled: q !== null,
    staleTime: HOUR_MS,
    retry: false,
  })
}

/** Horizons samples around `jd` for a looked-up object; one request per object per day. */
export function useJplTrajectory(id: string | null, jd: number) {
  const day = trajectoryWindow(jd)?.start ?? null
  return useQuery({
    queryKey: ['jpl-trajectory', id, day],
    queryFn: () => fetchTrajectoryAround(id ?? '', jd),
    enabled: id !== null,
    staleTime: HOUR_MS,
    retry: false,
  })
}
