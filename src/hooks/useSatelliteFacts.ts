import { useQuery } from '@tanstack/react-query'

import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchDiscosEnvelope, fetchSatcatShard } from '@/lib/api/spaceTrack'
import { type SatcatEntry, satcatEntryOf, satcatShardOf } from '@/lib/spacetrack'

const SIX_HOURS = 6 * 60 * 60 * 1000

/** ESA DISCOS facts for the orrery craft and some satellites (#101). */
export function useDiscos() {
  return useSourceQuery('discos', {
    queryKey: ['discos'],
    queryFn: fetchDiscosEnvelope,
    staleTime: SIX_HOURS,
    refetchOnWindowFocus: false,
  })
}

/**
 * A satellite's SATCAT entry (#101): its shard (about 25 kB gzip) is fetched when the
 * inspector first shows a satellite in it, then kept. Null while loading, or when the
 * object isn't in the catalogue of objects in orbit.
 */
export function useSatcatEntry(noradId: string | null): SatcatEntry | null {
  const shard = noradId === null ? null : satcatShardOf(noradId)
  const query = useQuery({
    queryKey: ['satcat', shard],
    queryFn: () => fetchSatcatShard(shard ?? 0),
    enabled: shard !== null,
    staleTime: SIX_HOURS,
    refetchOnWindowFocus: false,
  })
  return query.data && noradId !== null ? satcatEntryOf(query.data.rows, noradId) : null
}
