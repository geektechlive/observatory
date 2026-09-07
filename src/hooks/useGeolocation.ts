import { useCallback, useState } from 'react'

export interface GeoCoords {
  lat: number
  lon: number
  isFallback: boolean
}

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'

export interface GeoState {
  coords: GeoCoords | null
  status: GeoStatus
  request: () => void
}

// Greenwich Observatory — a meaningful default when geolocation is unavailable,
// denied, or not yet requested (rise/set still resolves; moon phase/illumination
// is global anyway).
export const FALLBACK: GeoCoords = { lat: 51.4779, lon: 0, isFallback: true }

/**
 * Browser geolocation, requested only on demand. Never prompts on mount — callers
 * must invoke `request()` in response to explicit user action. Stays on the
 * Greenwich fallback observer until permission is granted.
 */
export function useGeolocation(): GeoState {
  const [coords, setCoords] = useState<GeoCoords | null>(null)
  const [status, setStatus] = useState<GeoStatus>(
    typeof navigator === 'undefined' || !navigator.geolocation ? 'unsupported' : 'idle',
  )

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported')
      return
    }
    setStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, isFallback: false })
        setStatus('granted')
      },
      () => {
        setStatus('denied')
      },
      { timeout: 8000, maximumAge: 60 * 60 * 1000 },
    )
  }, [])

  return { coords, status, request }
}
