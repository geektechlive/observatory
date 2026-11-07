import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchSpaceTrackEnvelope } from '@/lib/api/spaceTrack'

const HALF_HOUR = 30 * 60 * 1000

/**
 * Space-Track's re-entry predictions, recent re-entries and Box Score (#101): for the
 * ticker on every page, and the satellite controls and inspector in the orrery. The
 * ticker puts it in the first load: 0.8 kB gzip with its schema (measured 2026-11-07; a
 * lazy import cost more, 0.9 kB and an extra chunk). The orrery's own lookups (SATCAT,
 * DISCOS) are in useSatelliteFacts.ts, which only the orrery chunk imports.
 */
export function useSpaceTrack() {
  return useSourceQuery('spacetrack', {
    queryKey: ['spacetrack'],
    queryFn: fetchSpaceTrackEnvelope,
    staleTime: HALF_HOUR,
    refetchInterval: HALF_HOUR,
    refetchOnWindowFocus: false,
  })
}
