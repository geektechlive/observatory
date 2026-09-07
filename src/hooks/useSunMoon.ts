import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { FALLBACK, useGeolocation } from '@/hooks/useGeolocation'
import { fetchSunMoon } from '@/lib/api/sunMoon'
import { useUiStore } from '@/store/ui'

function localISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useSunMoon() {
  const { coords, status, request } = useGeolocation()
  const lat = coords?.lat ?? FALLBACK.lat
  const lon = coords?.lon ?? FALLBACK.lon
  const isFallback = coords === null
  const tz = -new Date().getTimezoneOffset() / 60
  const date = localISODate(new Date())

  const query = useQuery({
    queryKey: ['sun-moon', lat.toFixed(1), lon.toFixed(1), date],
    queryFn: () => fetchSunMoon({ lat, lon, tz, date }),
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('sunMoon', query.error != null)
  }, [query.error])

  return { ...query, isFallbackLocation: isFallback, geoStatus: status, requestLocation: request }
}
