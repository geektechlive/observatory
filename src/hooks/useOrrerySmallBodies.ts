import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchOrrerySmallBodiesEnvelope } from '@/lib/api/orrerySmallBodies'

const HALF_HOUR = 30 * 60 * 1000

/**
 * The comets and interstellar objects (#99). The orrery calls this once a "Comets &
 * interstellar" switch or a link asks for them (`enabled`), so the answer (72 kB gzip) is
 * never fetched with the rest of the site or on a plain visit to the orrery. The Tonight
 * panel reads its own slice (useCometsTonight, #135) and the dwarf planets have their own
 * endpoint (useOrreryDwarfs), so neither pays for the other.
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
