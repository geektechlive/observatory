import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useGeolocation } from '@/hooks/useGeolocation'
import { useUiStore } from '@/store/ui'

afterEach(() => {
  vi.unstubAllGlobals()
  useUiStore.setState({ observer: null, geoStatus: null })
})

describe('useGeolocation', () => {
  it('starts idle and never calls getCurrentPosition on mount', () => {
    const getCurrentPosition = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const { result } = renderHook(() => useGeolocation())

    expect(result.current.status).toBe('idle')
    expect(result.current.coords).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('resolves to granted with coords when permission is allowed', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 40.7128, longitude: -74.006 },
      } as GeolocationPosition)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const { result } = renderHook(() => useGeolocation())

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('granted')
    })
    // Rounded to 0.1° (~11 km): enough for sky times, and all a third party ever sees (#78).
    expect(result.current.coords).toEqual({ lat: 40.7, lon: -74, isFallback: false })
  })

  it('shares one location between panels: granted once, seen by every caller (#78)', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 39.0997, longitude: -94.5786 } } as GeolocationPosition)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const sunMoon = renderHook(() => useGeolocation())
    const tonight = renderHook(() => useGeolocation())
    act(() => {
      sunMoon.result.current.request()
    })

    await waitFor(() => {
      expect(tonight.result.current.status).toBe('granted')
    })
    expect(tonight.result.current.coords).toEqual({ lat: 39.1, lon: -94.6, isFallback: false })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('never saves the location across visits', () => {
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    const persisted = useUiStore.persist.getOptions().partialize?.(useUiStore.getState())
    expect(persisted).not.toHaveProperty('observer')
    expect(persisted).not.toHaveProperty('geoStatus')
  })

  it('resolves to denied when getCurrentPosition errors', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({} as GeolocationPositionError)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const { result } = renderHook(() => useGeolocation())

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('denied')
    })
    expect(result.current.coords).toBeNull()
  })

  it('reports unsupported and no-ops request when geolocation is unavailable', () => {
    vi.stubGlobal('navigator', {})

    const { result } = renderHook(() => useGeolocation())

    expect(result.current.status).toBe('unsupported')

    expect(() => {
      act(() => {
        result.current.request()
      })
    }).not.toThrow()

    expect(result.current.status).toBe('unsupported')
    expect(result.current.coords).toBeNull()
  })
})
