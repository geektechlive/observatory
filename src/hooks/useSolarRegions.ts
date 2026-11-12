import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchSolarRegionsEnvelope } from '@/lib/api/solarRegions'

// SWPC issues regions once a day and odds once a day; half an hour is plenty.
const REFRESH_MS = 30 * 60 * 1000

/** Shared by the disc markers and the Active Regions panel: one fetch for both. */
export function useSolarRegions() {
  return useSourceQuery('solar-regions', {
    queryKey: ['solar-regions'],
    queryFn: fetchSolarRegionsEnvelope,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: false,
  })
}
