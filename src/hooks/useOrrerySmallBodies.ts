import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchOrrerySmallBodiesEnvelope } from '@/lib/api/orrerySmallBodies'

const HALF_HOUR = 30 * 60 * 1000

/**
 * The comets and interstellar objects (#99). The Tonight panel calls this once the user
 * has shared a location (`CometsTonight`), and the orrery will when it draws them, so
 * the answer is never fetched with the rest of the site.
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
