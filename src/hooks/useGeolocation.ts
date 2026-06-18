import { useEffect, useState } from 'react'

export interface GeoCoords {
  lat: number
  lon: number
  isFallback: boolean
}

// Greenwich Observatory — a meaningful default when geolocation is unavailable
// or denied (rise/set still resolves; moon phase/illumination is global anyway).
const FALLBACK: GeoCoords = { lat: 51.4779, lon: 0, isFallback: true }

/**
 * Browser geolocation with graceful fallback. Starts at the fallback observer
 * and upgrades to the visitor's location only if permission is granted.
 */
export function useGeolocation(): GeoCoords {
  const [coords, setCoords] = useState<GeoCoords>(FALLBACK)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, isFallback: false }),
      () => {
        /* denied or errored — keep the fallback observer */
      },
      { timeout: 8000, maximumAge: 60 * 60 * 1000 },
    )
  }, [])

  return coords
}
