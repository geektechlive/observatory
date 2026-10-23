/**
 * useGlobeData (#63, moved out of App): which layers reach the globe, and the shared
 * empty list for the ones that don't (#60). Data hooks are mocked.
 */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useGlobeData } from '@/hooks/useGlobeData'
import { DEFAULT_LAYERS, useUiStore } from '@/store/ui'

const q = <T,>(data: T) => ({ data, isLoading: false, error: null, isError: false })

vi.mock('@/hooks/useIss', () => ({
  useIss: () => ({
    position: { lat: 10, lon: 20, alt: 420, vel: 27_000 },
    trail: [[20, 10]],
    intervalMs: 200,
  }),
}))
vi.mock('@/hooks/useEvents', () => ({
  useEvents: () =>
    q({
      events: [
        {
          categories: [{ id: 'wildfires' }],
          geometry: [{ type: 'Point', coordinates: [12, 3] }],
        },
        { categories: [], geometry: [{ type: 'Polygon', coordinates: [] }] },
      ],
    }),
}))
vi.mock('@/hooks/useLaunches', () => ({
  useLaunches: () =>
    q({
      result: [
        { name: 'A', pad: { latitude: '28.5', longitude: '-80.6', name: 'LC-39A' } },
        { name: 'B', pad: { latitude: 'x', longitude: '0' } },
      ],
    }),
}))
vi.mock('@/hooks/useFireball', () => ({
  useFireball: () =>
    q({
      data: [
        { lat: '10', latDir: 'S', lon: '20', lonDir: 'W', energy: '2.5' },
        { lat: null, lon: null, latDir: null, lonDir: null, energy: null },
        { lat: '5', latDir: 'N', lon: '6', lonDir: 'E', energy: null },
      ],
    }),
}))
vi.mock('@/hooks/useQuakes', () => ({
  useQuakes: () => q({ quakes: [{ lat: 1, lon: 2, mag: 5.5, place: 'Fiji' }] }),
}))
vi.mock('@/hooks/useGdacs', () => ({
  useGdacs: () => q({ events: [{ lat: 1, lon: 1, type: 'TC', alert: 'Red', name: 'Storm' }] }),
}))
vi.mock('@/hooks/useSatellites', () => ({
  useSatellites: () => [{ name: 'Hubble', lat: 0, lon: 0, alt: 540 }],
}))
vi.mock('@/hooks/useFires', () => ({ useFires: () => q({ fires: [{ lat: 1, lon: 1, frp: 3 }] }) }))
vi.mock('@/hooks/useAurora', () => ({ useAurora: () => q({ points: [[0, 70, 0.5]] }) }))

beforeEach(() => {
  useUiStore.setState({ view: 'earth', layers: { ...DEFAULT_LAYERS } })
})

describe('useGlobeData', () => {
  it('passes the default layers, and the one shared empty list for layers that are off', () => {
    const { result } = renderHook(() => useGlobeData())
    const p = result.current.globeProps
    expect(p.issLat).toBe(10)
    expect(p.events).toEqual([{ lat: 3, lon: 12, kind: 'wildfires' }])
    expect(p.quakes).toHaveLength(1)
    expect(p.aurora).toHaveLength(1)
    // Off by default: fires, satellites, fireballs, disasters, launches.
    expect(p.fires).toHaveLength(0)
    expect(p.fires).toBe(p.satellites)
    expect(p.fires).toBe(p.launches)
    expect(p.warm).toBe(true)
    expect(result.current.census.length).toBeGreaterThan(0)
  })

  it('parses fireballs with hemispheres and launch pads, skipping bad rows', () => {
    useUiStore.setState({
      layers: { ...DEFAULT_LAYERS, fireballs: true, launches: true, disasters: true, fires: true },
    })
    const { result } = renderHook(() => useGlobeData())
    const p = result.current.globeProps
    expect(p.fireballs).toEqual([
      { lat: -10, lon: -20, energy: 2.5 },
      { lat: 5, lon: 6, energy: 0 },
    ])
    expect(p.launches).toEqual([{ lat: 28.5, lon: -80.6, name: 'LC-39A' }])
    expect(p.disasters).toHaveLength(1)
    expect(p.fires).toHaveLength(1)
  })

  it('ORBIT is a tracking station: orbital layers on, hazards off, cool grade', () => {
    useUiStore.setState({ view: 'orbit' })
    const { result } = renderHook(() => useGlobeData())
    const p = result.current.globeProps
    expect(p.tracking).toBe(true)
    expect(p.warm).toBe(false)
    expect(p.satellites).toHaveLength(1)
    expect(p.launches).toHaveLength(1)
    expect(p.events).toHaveLength(0)
    expect(p.quakes).toHaveLength(0)
  })

  it('hides the ISS when its layer is off', () => {
    useUiStore.setState({ layers: { ...DEFAULT_LAYERS, iss: false } })
    const { result } = renderHook(() => useGlobeData())
    expect(result.current.globeProps.issLat).toBeUndefined()
    expect(result.current.globeProps.trail).toHaveLength(0)
  })
})
