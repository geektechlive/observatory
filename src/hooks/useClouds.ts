import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchClouds } from '@/lib/api/clouds'
import type { Observer } from '@/store/ui'

/** Hourly cloud cover for the shared location (#79); fetches nothing until there is one. */
export function useClouds(observer: Observer | null) {
  const lat = observer?.lat ?? 0
  const lon = observer?.lon ?? 0
  return useSourceQuery('weather', {
    queryKey: ['clouds', lat.toFixed(1), lon.toFixed(1)],
    queryFn: () => fetchClouds(lat, lon),
    enabled: observer !== null && !observer.isFallback,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
