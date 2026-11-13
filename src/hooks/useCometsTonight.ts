import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchCometsTonightEnvelope } from '@/lib/api/cometsTonight'

const HALF_HOUR = 30 * 60 * 1000

/**
 * The Tonight panel's comets and bright asteroids (#135, #99 item 4), fetched once the user
 * has shared a location (`CometsTonight`), or once the orrery's "Bright asteroids" switch
 * asks (`enabled`). Its own slice, about 11 kB gzip, not the orrery's
 * /api/orrery-smallbodies (72 kB gzip), which carries ±30 days of every body for the 3D view.
 * The query key carries the slice's version (v2 added the asteroids).
 */
export function useCometsTonight({ enabled = true }: { enabled?: boolean } = {}) {
  return useSourceQuery('comets-tonight', {
    queryKey: ['comets-tonight', 'v2'],
    enabled,
    queryFn: fetchCometsTonightEnvelope,
    staleTime: HALF_HOUR,
    refetchInterval: HALF_HOUR,
    refetchOnWindowFocus: false,
  })
}
