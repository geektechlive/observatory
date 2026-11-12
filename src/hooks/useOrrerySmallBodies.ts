import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchOrrerySmallBodiesEnvelope } from '@/lib/api/orrerySmallBodies'

const HALF_HOUR = 30 * 60 * 1000

/**
 * The comets and interstellar objects (#99). The Tonight panel calls this once the user
 * has shared a location (`CometsTonight`), and the orrery once a "Comets & interstellar"
 * switch or a link asks for them (`enabled`), so the answer (72 kB gzip) is never
 * fetched with the rest of the site or on a plain visit to the orrery. The dwarf planets
 * have their own endpoint (useOrreryDwarfs), so this one stays that size.
 */
export function useOrrerySmallBodies({ enabled = true }: { enabled?: boolean } = {}) {
  return useSourceQuery('orrery-smallbodies', {
    queryKey: ['orrery-smallbodies'],
    queryFn: fetchOrrerySmallBodiesEnvelope,
    staleTime: HALF_HOUR,
    refetchInterval: HALF_HOUR,
    refetchOnWindowFocus: false,
    enabled,
  })
}
