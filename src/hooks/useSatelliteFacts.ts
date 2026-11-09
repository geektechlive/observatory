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
 * One SATCAT shard, shared by the inspector and the satellite browser (#161). `gcTime`
 * matches `staleTime`: the browser's fetches have no observer once it closes, and the
 * default five minutes would download the whole catalogue again on the next visit.
 */
export function satcatShardQuery(shard: number) {
  return {
    queryKey: ['satcat', shard],
    queryFn: () => fetchSatcatShard(shard),
    staleTime: SIX_HOURS,
    gcTime: SIX_HOURS,
  }
}

/**
 * A satellite's SATCAT entry (#101): its shard (about 23 kB gzip, measured in #161) is
 * fetched when the inspector first shows a satellite in it, then kept. Null while loading,
 * or when the object isn't in the catalogue of objects in orbit.
 */
export function useSatcatEntry(noradId: string | null): SatcatEntry | null {
  const shard = noradId === null ? null : satcatShardOf(noradId)
  const query = useQuery({
    ...satcatShardQuery(shard ?? 0),
    enabled: shard !== null,
    refetchOnWindowFocus: false,
  })
  return query.data && noradId !== null ? satcatEntryOf(query.data.rows, noradId) : null
}
