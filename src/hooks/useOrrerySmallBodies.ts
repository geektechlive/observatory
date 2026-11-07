import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchOrrerySmallBodiesEnvelope } from '@/lib/api/orrerySmallBodies'

const HALF_HOUR = 30 * 60 * 1000

/**
 * The orrery's comets and interstellar objects (#99). Only the orrery page calls this,
 * so the answer is fetched when the tab opens, never with the rest of the site.
 */
export function useOrrerySmallBodies() {
  return useSourceQuery('orrery-smallbodies', {
    queryKey: ['orrery-smallbodies'],
    queryFn: fetchOrrerySmallBodiesEnvelope,
    staleTime: HALF_HOUR,
    refetchInterval: HALF_HOUR,
    refetchOnWindowFocus: false,
  })
}
