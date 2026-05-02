import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/api/apod')
vi.mock('@/lib/api/donki')
vi.mock('@/lib/api/epic')
vi.mock('@/lib/api/eonet')
vi.mock('@/lib/api/fireball')
vi.mock('@/lib/api/launches')
vi.mock('@/lib/api/neo')
vi.mock('@/lib/api/sentry')
vi.mock('@/lib/api/solarWind')

import { useApod } from '@/hooks/useApod'
import { useDonki } from '@/hooks/useDonki'
import { useEpic } from '@/hooks/useEpic'
import { useEvents } from '@/hooks/useEvents'
import { useFireball } from '@/hooks/useFireball'
import { useLaunches } from '@/hooks/useLaunches'
import { useNeo } from '@/hooks/useNeo'
import { useSentry } from '@/hooks/useSentry'
import { useSolarWind } from '@/hooks/useSolarWind'
import { fetchApod } from '@/lib/api/apod'
import { fetchDonki } from '@/lib/api/donki'
import { fetchEpic } from '@/lib/api/epic'
import { fetchEonetEvents } from '@/lib/api/eonet'
import { fetchFireball } from '@/lib/api/fireball'
import { fetchLaunches } from '@/lib/api/launches'
import { fetchNeo } from '@/lib/api/neo'
import { fetchSentry } from '@/lib/api/sentry'
import { fetchSolarWind } from '@/lib/api/solarWind'

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

afterEach(() => {
  vi.clearAllMocks()
})

const APOD_DATA = {
  date: '2025-01-01',
  title: 'Test',
  explanation: 'Exp',
  url: 'https://apod.nasa.gov/test.jpg',
  media_type: 'image' as const,
  service_version: 'v1',
}

describe('useApod', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchApod).mockResolvedValue(APOD_DATA)
    const { result } = renderHook(() => useApod(), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.title).toBe('Test')
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchApod).mockRejectedValue(new Error('APOD fetch failed: 500'))
    const { result } = renderHook(() => useApod(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.data).toBeUndefined()
  })
})

const DONKI_DATA = { flares: [], cmes: [], geomagneticStorms: [], seps: [] }

describe('useDonki', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchDonki).mockResolvedValue(DONKI_DATA)
    const { result } = renderHook(() => useDonki(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.flares).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchDonki).mockRejectedValue(new Error('DONKI fetch failed: 500'))
    const { result } = renderHook(() => useDonki(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

const EPIC_DATA = {
  image: 'img',
  date: '2025-01-01',
  caption: 'Cap',
  centroidLat: 0,
  centroidLon: 0,
  year: '2025',
  month: '01',
  day: '01',
}

describe('useEpic', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchEpic).mockResolvedValue(EPIC_DATA)
    const { result } = renderHook(() => useEpic(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.image).toBe('img')
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchEpic).mockRejectedValue(new Error('EPIC fetch failed: 500'))
    const { result } = renderHook(() => useEpic(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

const EONET_DATA = {
  title: 'EONET',
  description: 'Desc',
  link: 'https://eonet.gsfc.nasa.gov',
  events: [],
}

describe('useEvents', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchEonetEvents).mockResolvedValue(EONET_DATA)
    const { result } = renderHook(() => useEvents(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.events).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchEonetEvents).mockRejectedValue(new Error('EONET fetch failed: 500'))
    const { result } = renderHook(() => useEvents(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

const FIREBALL_DATA = { count: '0', data: [] }

describe('useFireball', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchFireball).mockResolvedValue(FIREBALL_DATA)
    const { result } = renderHook(() => useFireball(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.count).toBe('0')
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchFireball).mockRejectedValue(new Error('Fireball fetch failed: 500'))
    const { result } = renderHook(() => useFireball(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

const LAUNCHES_DATA = { valid_auth: true, count: 0, result: [] }

describe('useLaunches', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchLaunches).mockResolvedValue(LAUNCHES_DATA)
    const { result } = renderHook(() => useLaunches(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.count).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchLaunches).mockRejectedValue(new Error('Launches fetch failed: 500'))
    const { result } = renderHook(() => useLaunches(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

const NEO_DATA = { element_count: 0, near_earth_objects: {} }

describe('useNeo', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchNeo).mockResolvedValue(NEO_DATA)
    const { result } = renderHook(() => useNeo(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.element_count).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchNeo).mockRejectedValue(new Error('NeoWs fetch failed: 500'))
    const { result } = renderHook(() => useNeo(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

const SENTRY_DATA = { count: '0', data: [] }

describe('useSentry', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(SENTRY_DATA)
    const { result } = renderHook(() => useSentry(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.count).toBe('0')
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchSentry).mockRejectedValue(new Error('Sentry fetch failed: 500'))
    const { result } = renderHook(() => useSentry(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

const SOLAR_WIND_DATA = {
  kpReadings: [],
  currentKp: null,
  windSpeed: null,
  windDensity: null,
  imfBz: null,
  updatedAt: '2025-01-01T00:00:00Z',
}

describe('useSolarWind', () => {
  it('returns data after successful fetch', async () => {
    vi.mocked(fetchSolarWind).mockResolvedValue(SOLAR_WIND_DATA)
    const { result } = renderHook(() => useSolarWind(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.currentKp).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns error when fetch throws', async () => {
    vi.mocked(fetchSolarWind).mockRejectedValue(new Error('Solar wind fetch failed: 500'))
    const { result } = renderHook(() => useSolarWind(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
