import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useGeolocation } from '@/hooks/useGeolocation'

afterEach(() => {
  vi.unstubAllGlobals()
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
    expect(result.current.coords).toEqual({ lat: 40.7128, lon: -74.006, isFallback: false })
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
