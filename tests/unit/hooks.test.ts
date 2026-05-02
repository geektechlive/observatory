import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/hooks/useEvents')
vi.mock('@/hooks/useDonki')
vi.mock('@/hooks/useSentry')
vi.mock('@/hooks/useFireball')
vi.mock('@/lib/api/iss')
vi.mock('@/lib/orbit/propagate')

import { useNow } from '@/hooks/useNow'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useTicker } from '@/hooks/useTicker'
import { useIss } from '@/hooks/useIss'
import { useEvents } from '@/hooks/useEvents'
import { useDonki } from '@/hooks/useDonki'
import { useSentry } from '@/hooks/useSentry'
import { useFireball } from '@/hooks/useFireball'
import { fetchIssTle } from '@/lib/api/iss'
import { propagateIss, computeTrail } from '@/lib/orbit/propagate'

const mockedUseEvents = vi.mocked(useEvents)
const mockedUseDonki = vi.mocked(useDonki)
const mockedUseSentry = vi.mocked(useSentry)
const mockedUseFireball = vi.mocked(useFireball)
const mockedFetchIssTle = vi.mocked(fetchIssTle)
const mockedPropagateIss = vi.mocked(propagateIss)
const mockedComputeTrail = vi.mocked(computeTrail)

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a Date initially', () => {
    const { result } = renderHook(() => useNow(100))
    expect(result.current).toBeInstanceOf(Date)
  })

  it('updates after the interval elapses', () => {
    const { result } = renderHook(() => useNow(100))
    const initial = result.current.getTime()
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.getTime()).toBeGreaterThanOrEqual(initial)
  })

  it('cleans up the interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useNow(100))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})

describe('useReducedMotion', () => {
  it('returns false when matchMedia reports no preference', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('responds to media query change events', () => {
    let capturedHandler: ((e: MediaQueryListEvent) => void) | null = null
    const mockMq = {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_: string, handler: EventListenerOrEventListenerObject) => {
        capturedHandler = handler as (e: MediaQueryListEvent) => void
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMq as unknown as MediaQueryList)

    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    act(() => {
      if (capturedHandler) {
        capturedHandler({ matches: true } as MediaQueryListEvent)
      }
    })

    expect(result.current).toBe(true)
  })
})

describe('useTicker', () => {
  function setupMocks(
    overrides: {
      events?: object[]
      donki?: object
      sentry?: object
      fireball?: object
    } = {},
  ) {
    mockedUseEvents.mockReturnValue({
      data: { events: overrides.events ?? [] } as ReturnType<typeof useEvents>['data'],
      error: null,
      isLoading: false,
    } as ReturnType<typeof useEvents>)
    mockedUseDonki.mockReturnValue({
      data: overrides.donki ?? { flares: [], cmes: [], geomagneticStorms: [], seps: [] },
      error: null,
      isLoading: false,
    } as ReturnType<typeof useDonki>)
    mockedUseSentry.mockReturnValue({
      data: overrides.sentry ?? { count: '0', data: [] },
      error: null,
      isLoading: false,
    } as ReturnType<typeof useSentry>)
    mockedUseFireball.mockReturnValue({
      data: overrides.fireball ?? { count: '0', data: [] },
      error: null,
      isLoading: false,
    } as ReturnType<typeof useFireball>)
  }

  it('returns empty array when all data sources are empty', () => {
    setupMocks()
    const { result } = renderHook(() => useTicker())
    expect(result.current).toEqual([])
  })

  it('maps a wildfire EONET event to a WILDFIRE ticker item', () => {
    setupMocks({
      events: [
        {
          id: 'EONET_1',
          title: 'Test Wildfire',
          closed: undefined,
          categories: [{ id: 'wildfires', title: 'Wildfires' }],
          geometry: [{ date: '2025-01-01T00:00:00Z', type: 'Point', coordinates: [-120, 35] }],
        },
      ],
    })
    const { result } = renderHook(() => useTicker())
    expect(result.current[0]?.label).toBe('WILDFIRE')
    expect(result.current[0]?.description).toBe('Test Wildfire')
  })

  it('uses DEFAULT_EVENT_META for unknown category', () => {
    setupMocks({
      events: [
        {
          id: 'EONET_2',
          title: 'Unknown Event',
          closed: undefined,
          categories: [{ id: 'unknown', title: 'Unknown' }],
          geometry: [{ date: '2025-01-01T00:00:00Z', type: 'Point', coordinates: [0, 0] }],
        },
      ],
    })
    const { result } = renderHook(() => useTicker())
    expect(result.current[0]?.label).toBe('EVENT')
  })

  it('maps a solar flare with classType', () => {
    setupMocks({
      donki: {
        flares: [{ flrID: 'f1', beginTime: '2025-01-01T00:00:00Z', classType: 'X1' }],
        cmes: [],
        geomagneticStorms: [],
        seps: [],
      },
    })
    const { result } = renderHook(() => useTicker())
    const flare = result.current.find((i) => i.type === 'flare')
    expect(flare?.label).toBe('SOLAR FLARE')
    expect(flare?.description).toBe('Class X1')
  })

  it('uses generic description for flare without classType', () => {
    setupMocks({
      donki: {
        flares: [{ flrID: 'f2', beginTime: '2025-01-01T00:00:00Z', classType: null }],
        cmes: [],
        geomagneticStorms: [],
        seps: [],
      },
    })
    const { result } = renderHook(() => useTicker())
    const flare = result.current.find((i) => i.type === 'flare')
    expect(flare?.description).toBe('Solar flare')
  })

  it('maps a CME with speed', () => {
    setupMocks({
      donki: {
        flares: [],
        cmes: [{ activityID: 'cme1', startTime: '2025-01-01T00:00:00Z', speed: 500 }],
        geomagneticStorms: [],
        seps: [],
      },
    })
    const { result } = renderHook(() => useTicker())
    const cme = result.current.find((i) => i.type === 'cme')
    expect(cme?.label).toBe('CME')
    expect(cme?.description).toBe('500 km/s')
  })

  it('uses generic description for CME without speed', () => {
    setupMocks({
      donki: {
        flares: [],
        cmes: [{ activityID: 'cme2', startTime: '2025-01-01T00:00:00Z', speed: null }],
        geomagneticStorms: [],
        seps: [],
      },
    })
    const { result } = renderHook(() => useTicker())
    const cme = result.current.find((i) => i.type === 'cme')
    expect(cme?.description).toBe('CME detected')
  })

  it('maps a sentry impact risk entry', () => {
    setupMocks({
      sentry: {
        count: '1',
        data: [{ des: '99942', fullname: 'Apophis', ps_cum: '-3.42', ip: '0.0001', n_imp: 1 }],
      },
    })
    const { result } = renderHook(() => useTicker())
    const sentry = result.current.find((i) => i.type === 'sentry')
    expect(sentry?.label).toBe('IMPACT RISK')
  })

  it('maps a fireball entry', () => {
    setupMocks({
      fireball: {
        count: '1',
        data: [
          {
            date: '2025-01-01 00:00:00',
            energy: '1.5',
            impactE: '1.5',
            lat: '35',
            latDir: 'N',
            lon: '120',
            lonDir: 'W',
            alt: '50',
            vel: '12',
          },
        ],
      },
    })
    const { result } = renderHook(() => useTicker())
    const fireball = result.current.find((i) => i.type === 'fireball')
    expect(fireball?.label).toBe('FIREBALL')
  })

  it('uses epoch date for EONET event with no geometry', () => {
    setupMocks({
      events: [
        {
          id: 'EONET_3',
          title: 'No Geometry Event',
          closed: undefined,
          categories: [{ id: 'wildfires', title: 'Wildfires' }],
          geometry: [],
        },
      ],
    })
    const { result } = renderHook(() => useTicker())
    expect(result.current[0]?.time.getTime()).toBe(new Date(0).getTime())
  })

  it('sorts items by time descending', () => {
    setupMocks({
      donki: {
        flares: [
          { flrID: 'f-old', beginTime: '2025-01-01T00:00:00Z', classType: 'B1' },
          { flrID: 'f-new', beginTime: '2025-06-01T00:00:00Z', classType: 'C1' },
        ],
        cmes: [],
        geomagneticStorms: [],
        seps: [],
      },
    })
    const { result } = renderHook(() => useTicker())
    expect(result.current[0]?.id).toBe('flare-f-new')
    expect(result.current[1]?.id).toBe('flare-f-old')
  })
})

describe('useIss', () => {
  const VALID_TLE = {
    name: 'ISS (ZARYA)',
    line1: '1 25544U 98067A',
    line2: '2 25544  51.6',
  }

  beforeEach(() => {
    mockedFetchIssTle.mockResolvedValue(VALID_TLE)
    mockedPropagateIss.mockReturnValue({ lat: 10, lon: 20, alt: 400, vel: 27000 })
    mockedComputeTrail.mockReturnValue([[20, 10]])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('starts in loading state', () => {
    const { result } = renderHook(() => useIss(), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.position).toBeNull()
  })

  it('calls computeTrail after TLE resolves', async () => {
    const { result } = renderHook(() => useIss(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockedComputeTrail).toHaveBeenCalled()
  })

  it('error is null on successful fetch', async () => {
    const { result } = renderHook(() => useIss(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })
})
