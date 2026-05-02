import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchApod } from '@/lib/api/apod'
import { fetchDonki } from '@/lib/api/donki'
import { fetchEonetEvents } from '@/lib/api/eonet'
import { fetchEpic } from '@/lib/api/epic'
import { fetchFireball } from '@/lib/api/fireball'
import { fetchIssTle } from '@/lib/api/iss'
import { fetchLaunches } from '@/lib/api/launches'
import { fetchNeo } from '@/lib/api/neo'
import { trackQuota } from '@/lib/api/quota'
import { fetchSentry } from '@/lib/api/sentry'
import { fetchSolarWind } from '@/lib/api/solarWind'
import { useUiStore } from '@/store/ui'

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const headersMap = new Map(Object.entries(headers))
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (k: string) => headersMap.get(k) ?? null },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

const APOD_FIXTURE = {
  date: '2025-01-01',
  title: 'Test',
  explanation: 'Exp',
  url: 'https://apod.nasa.gov/test.jpg',
  media_type: 'image',
  service_version: 'v1',
}

describe('fetchApod', () => {
  it('returns parsed apod on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, APOD_FIXTURE))
    const result = await fetchApod()
    expect(result.title).toBe('Test')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchApod()).rejects.toThrow('APOD fetch failed: 500')
  })
})

const DONKI_FIXTURE = { flares: [], cmes: [], geomagneticStorms: [], seps: [] }

describe('fetchDonki', () => {
  it('returns parsed donki on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, DONKI_FIXTURE))
    const result = await fetchDonki()
    expect(result.flares).toEqual([])
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchDonki()).rejects.toThrow('DONKI fetch failed: 500')
  })
})

const EONET_FIXTURE = {
  title: 'EONET',
  description: 'Desc',
  link: 'https://eonet.gsfc.nasa.gov',
  events: [],
}

describe('fetchEonetEvents', () => {
  it('returns parsed eonet on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, EONET_FIXTURE))
    const result = await fetchEonetEvents()
    expect(result.events).toEqual([])
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchEonetEvents()).rejects.toThrow('EONET fetch failed: 500')
  })
})

const EPIC_FIXTURE = {
  image: 'img',
  date: '2025-01-01',
  caption: 'Cap',
  centroidLat: 0,
  centroidLon: 0,
  year: '2025',
  month: '01',
  day: '01',
}

describe('fetchEpic', () => {
  it('returns parsed epic on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, EPIC_FIXTURE))
    const result = await fetchEpic()
    expect(result.image).toBe('img')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchEpic()).rejects.toThrow('EPIC fetch failed: 500')
  })
})

const FIREBALL_FIXTURE = { count: '0', data: [] }

describe('fetchFireball', () => {
  it('returns parsed fireball on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, FIREBALL_FIXTURE))
    const result = await fetchFireball()
    expect(result.count).toBe('0')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchFireball()).rejects.toThrow('Fireball fetch failed: 500')
  })
})

const ISS_TLE_FIXTURE = { name: 'ISS (ZARYA)', line1: '1 25544U', line2: '2 25544' }

describe('fetchIssTle', () => {
  it('returns parsed TLE on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, ISS_TLE_FIXTURE))
    const result = await fetchIssTle()
    expect(result.name).toBe('ISS (ZARYA)')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchIssTle()).rejects.toThrow('ISS TLE fetch failed: 500')
  })
})

const LAUNCHES_FIXTURE = { valid_auth: true, count: 0, result: [] }

describe('fetchLaunches', () => {
  it('returns parsed launches on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, LAUNCHES_FIXTURE))
    const result = await fetchLaunches()
    expect(result.count).toBe(0)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchLaunches()).rejects.toThrow('Launches fetch failed: 500')
  })
})

const NEO_FIXTURE = { element_count: 0, near_earth_objects: {} }

describe('fetchNeo', () => {
  it('returns parsed neo on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, NEO_FIXTURE))
    const result = await fetchNeo()
    expect(result.element_count).toBe(0)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchNeo()).rejects.toThrow('NeoWs fetch failed: 500')
  })
})

const SENTRY_FIXTURE = { count: '0', data: [] }

describe('fetchSentry', () => {
  it('returns parsed sentry on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, SENTRY_FIXTURE))
    const result = await fetchSentry()
    expect(result.count).toBe('0')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchSentry()).rejects.toThrow('Sentry fetch failed: 500')
  })
})

const SOLAR_WIND_FIXTURE = {
  kpReadings: [],
  currentKp: null,
  windSpeed: null,
  windDensity: null,
  imfBz: null,
  updatedAt: '2025-01-01T00:00:00Z',
}

describe('fetchSolarWind', () => {
  it('returns parsed solar wind on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, SOLAR_WIND_FIXTURE))
    const result = await fetchSolarWind()
    expect(result.currentKp).toBeNull()
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchSolarWind()).rejects.toThrow('Solar wind fetch failed: 500')
  })
})

describe('trackQuota', () => {
  it('sets quota in store when header is present', () => {
    const res = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: { get: (k: string) => (k === 'X-Quota-Remaining' ? '42' : null) },
    } as unknown as Response

    trackQuota(res)
    expect(useUiStore.getState().quotaRemaining).toBe(42)
  })

  it('does not throw when header is absent', () => {
    const res = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: { get: () => null },
    } as unknown as Response

    expect(() => trackQuota(res)).not.toThrow()
  })

  it('does not update store when header value is not a number', () => {
    useUiStore.getState().setQuotaRemaining(null)
    const res = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: { get: (k: string) => (k === 'X-Quota-Remaining' ? 'bad' : null) },
    } as unknown as Response

    trackQuota(res)
    expect(useUiStore.getState().quotaRemaining).toBeNull()
  })
})
