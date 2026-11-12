import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchOrreryDwarfsEnvelope } from '@/lib/api/orreryDwarfs'

const HALF_HOUR = 30 * 60 * 1000

/**
 * The dwarf planets (#99 item 8), fetched only once the orrery's "Dwarf planets" switch
 * or a link to one asks (`enabled`). Their own endpoint (59 kB gzip, measured
 * 2026-11-12), so neither a plain orrery visit nor the Tonight panel downloads them.
 */
export function useOrreryDwarfs({ enabled }: { enabled: boolean }) {
  return useSourceQuery('orrery-dwarfs', {
    queryKey: ['orrery-dwarfs'],
    queryFn: fetchOrreryDwarfsEnvelope,
    staleTime: HALF_HOUR,
    refetchInterval: HALF_HOUR,
    refetchOnWindowFocus: false,
    enabled,
  })
}
