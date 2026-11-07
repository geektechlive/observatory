import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchOrreryNeoEnvelope } from '@/lib/api/orreryNeo'

const HALF_HOUR = 30 * 60 * 1000

/**
 * The orrery's close approaches, Scout and ESA NEOCC (#92). Only the orrery page calls
 * this, so the answer is fetched when the tab opens, never with the rest of the site.
 */
export function useOrreryNeo() {
  return useSourceQuery('orrery-neo', {
    queryKey: ['orrery-neo'],
    queryFn: fetchOrreryNeoEnvelope,
    staleTime: HALF_HOUR,
    refetchInterval: HALF_HOUR,
    refetchOnWindowFocus: false,
  })
}
