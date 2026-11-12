import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchCometsTonightEnvelope } from '@/lib/api/cometsTonight'

const HALF_HOUR = 30 * 60 * 1000

/**
 * The Tonight panel's comets (#135), fetched once the user has shared a location
 * (`CometsTonight`). Its own slice, a few kB gzip, not the orrery's /api/orrery-smallbodies
 * (72 kB gzip), which carries ±30 days of every body for the 3D view.
 */
export function useCometsTonight() {
  return useSourceQuery('comets-tonight', {
    queryKey: ['comets-tonight'],
    queryFn: fetchCometsTonightEnvelope,
    staleTime: HALF_HOUR,
    refetchInterval: HALF_HOUR,
    refetchOnWindowFocus: false,
  })
}
