import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSatellites } from '@/lib/api/satellites'
import { propagateIss } from '@/lib/orbit/propagate'
import { useUiStore } from '@/store/ui'

export interface TrackedSatellite {
  name: string
  lat: number
  lon: number
  alt: number
}

/**
 * Tracks extra satellites (Hubble, Tiangong) via SGP4. TLEs refresh daily;
 * positions recompute every 2s — these are secondary to the 5Hz ISS track, so
 * a coarser cadence keeps the globe cheap.
 */
export function useSatellites(): TrackedSatellite[] {
  const { data, error } = useQuery({
    queryKey: ['satellites'],
    queryFn: fetchSatellites,
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const [positions, setPositions] = useState<TrackedSatellite[]>([])

  useEffect(() => {
    useUiStore.getState().setSourceError('satellites', error != null)
  }, [error])

  useEffect(() => {
    const sats = data?.satellites
    if (!sats || sats.length === 0) return

    const update = () => {
      const now = new Date()
      const next: TrackedSatellite[] = []
      for (const s of sats) {
        const pos = propagateIss(s.line1, s.line2, now)
        if (pos !== null) next.push({ name: s.name, lat: pos.lat, lon: pos.lon, alt: pos.alt })
      }
      setPositions(next)
    }

    update()
    const id = setInterval(update, 2000)
    return () => clearInterval(id)
  }, [data])

  return positions
}
