import { useQuery } from '@tanstack/react-query'

import { fetchSdoTimes } from '@/lib/api/sdoTimes'

/**
 * The Sun view's observation times (#73). Refetches with the image (10 min). Not a
 * health source: without it the stage just shows no time, and the image still loads.
 */
export function useSdoTimes() {
  return useQuery({
    queryKey: ['sdo-times'],
    queryFn: fetchSdoTimes,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
