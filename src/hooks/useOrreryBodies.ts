import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchOrreryBodiesEnvelope } from '@/lib/api/orreryBodies'

const HALF_HOUR = 30 * 60 * 1000

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
  })
}
