import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchIssTleEnvelope } from '@/lib/api/iss'

/** The ISS orbit (TLE), one query shared by the live tracker and the pass list (#81). */
export function useIssTle() {
  return useSourceQuery('iss-tle', {
    queryKey: ['iss-tle'],
    queryFn: fetchIssTleEnvelope,
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: 24 * 60 * 60 * 1000,
  })
}
