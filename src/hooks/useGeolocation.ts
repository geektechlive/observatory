import { useCallback } from 'react'

import { type Observer, useUiStore } from '@/store/ui'

export type GeoCoords = Observer

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

/** 0.1° is about 11 km: plenty for sky times, and all any third party is sent (#78). */
const round = (deg: number) => Math.round(deg * 10) / 10

const hasGeolocation = () => typeof navigator !== 'undefined' && Boolean(navigator.geolocation)

/**
 * Browser geolocation, requested only on demand. Never prompts on mount — callers
 * must invoke `request()` in response to explicit user action. Stays on the
 * Greenwich fallback observer until permission is granted.
 *
 * The location lives in the ui store (#78), so a location granted from one panel is
 * seen by every panel; it is rounded to 0.1° and never persisted.
 */
export function useGeolocation(): GeoState {
  const coords = useUiStore((s) => s.observer)
  const requestStatus = useUiStore((s) => s.geoStatus)
  const status: GeoStatus = hasGeolocation() ? (requestStatus ?? 'idle') : 'unsupported'

  const request = useCallback(() => {
    if (!hasGeolocation()) return
    const { setObserver, setGeoStatus } = useUiStore.getState()
    setGeoStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObserver({
          lat: round(pos.coords.latitude),
          lon: round(pos.coords.longitude),
          isFallback: false,
        })
        setGeoStatus('granted')
      },
      () => {
        setGeoStatus('denied')
      },
      { timeout: 8000, maximumAge: 60 * 60 * 1000 },
    )
  }, [])

  return { coords, status, request }
}
