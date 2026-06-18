import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchApod } from '@/lib/api/apod'
import { fetchDonki } from '@/lib/api/donki'
import { fetchEonetEvents } from '@/lib/api/eonet'
import { fetchEpic } from '@/lib/api/epic'
import { fetchFireball } from '@/lib/api/fireball'
import { fetchIssTle } from '@/lib/api/iss'
import { fetchLaunches } from '@/lib/api/launches'
import { fetchNeo } from '@/lib/api/neo'
import { fetchQuakes } from '@/lib/api/quakes'
import { fetchSolarActivity } from '@/lib/api/solarActivity'
import { fetchSunMoon } from '@/lib/api/sunMoon'
import { fetchPeopleInSpace } from '@/lib/api/peopleInSpace'
import { fetchSolarCycle } from '@/lib/api/solarCycle'
import { fetchGdacs } from '@/lib/api/gdacs'
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

const QUAKES_FIXTURE = {
  updatedAt: '2026-06-18T00:00:00Z',
  quakes: [
    {
      id: 'us1000',
      mag: 5.2,
      place: '120km SSW of Somewhere',
      lat: -10.5,
      lon: 160.2,
      depthKm: 33.4,
      time: 1_750_000_000_000,
      tsunami: false,
      url: 'https://earthquake.usgs.gov/x',
    },
  ],
}

describe('fetchQuakes', () => {
  it('returns parsed quakes on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, QUAKES_FIXTURE))
    const result = await fetchQuakes()
    expect(result.quakes).toHaveLength(1)
    expect(result.quakes[0]?.mag).toBe(5.2)
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(502, {}))
    await expect(fetchQuakes()).rejects.toThrow(/Quakes fetch failed/)
  })
})

const SOLAR_ACTIVITY_FIXTURE = {
  xray: { series: [1e-7, 2e-7, 4.8e-7], currentFlux: 4.8e-7, currentClass: 'B4.8' },
  scales: [{ offset: 0, date: '2026-06-18', r: 0, s: 0, g: 1 }],
  updatedAt: '2026-06-18T00:00:00Z',
}

describe('fetchSolarActivity', () => {
  it('returns parsed solar activity on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, SOLAR_ACTIVITY_FIXTURE))
    const result = await fetchSolarActivity()
    expect(result.xray.currentClass).toBe('B4.8')
    expect(result.scales[0]?.g).toBe(1)
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchSolarActivity()).rejects.toThrow(/Solar activity fetch failed/)
  })
})

const SUN_MOON_FIXTURE = {
  date: '2026-06-18',
  tz: -4,
  lat: 40.7,
  lon: -74,
  curPhase: 'Waxing Crescent',
  fracIllum: 18,
  closestPhase: { phase: 'First Quarter', date: '2026-06-21', time: '17:55' },
  sun: {
    rise: '05:25',
    set: '20:30',
    transit: '12:57',
    civilBegin: '04:51',
    civilEnd: '21:03',
  },
  moon: { rise: '09:19', set: '23:41' },
  updatedAt: '2026-06-18T00:00:00Z',
}

describe('fetchSunMoon', () => {
  it('returns parsed sun/moon data on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, SUN_MOON_FIXTURE))
    const result = await fetchSunMoon({ lat: 40.7, lon: -74, tz: -4, date: '2026-06-18' })
    expect(result.curPhase).toBe('Waxing Crescent')
    expect(result.fracIllum).toBe(18)
    expect(result.sun.rise).toBe('05:25')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(400, {}))
    await expect(fetchSunMoon({ lat: 0, lon: 0, tz: 0, date: '2026-06-18' })).rejects.toThrow(
      /Sun\/Moon fetch failed/,
    )
  })
})

const PEOPLE_FIXTURE = {
  number: 2,
  expedition: '74',
  people: [
    {
      name: 'A',
      craft: 'ISS',
      country: 'USA',
      agency: 'NASA',
      flagCode: 'us',
      launched: 1764232077,
    },
    {
      name: 'B',
      craft: 'Tiangong',
      country: 'China',
      agency: 'CMSA',
      flagCode: 'cn',
      launched: null,
    },
  ],
  updatedAt: '2026-06-18T00:00:00Z',
}

describe('fetchPeopleInSpace', () => {
  it('returns parsed roster on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, PEOPLE_FIXTURE))
    const result = await fetchPeopleInSpace()
    expect(result.number).toBe(2)
    expect(result.people[1]?.craft).toBe('Tiangong')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(502, {}))
    await expect(fetchPeopleInSpace()).rejects.toThrow(/People-in-space fetch failed/)
  })
})

const SOLAR_CYCLE_FIXTURE = {
  cycle: [
    { month: '2019-01', ssn: 5 },
    { month: '2026-05', ssn: 101.4 },
  ],
  latestSsn: 101.4,
  latestF107: 125.7,
  kpForecast: [{ time: '2026-06-18T00:00:00', kp: 3, kind: 'predicted', scale: null }],
  updatedAt: '2026-06-18T00:00:00Z',
}

describe('fetchSolarCycle', () => {
  it('returns parsed solar cycle on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, SOLAR_CYCLE_FIXTURE))
    const result = await fetchSolarCycle()
    expect(result.latestSsn).toBe(101.4)
    expect(result.kpForecast[0]?.kp).toBe(3)
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(fetchSolarCycle()).rejects.toThrow(/Solar cycle fetch failed/)
  })
})

const GDACS_FIXTURE = {
  events: [
    {
      id: '1',
      type: 'TC',
      name: 'Cyclone X',
      alert: 'Red',
      lat: -15,
      lon: 120,
      country: 'AU',
      from: '2026-06-18T00:00:00',
    },
  ],
  updatedAt: '2026-06-18T00:00:00Z',
}

describe('fetchGdacs', () => {
  it('returns parsed disaster alerts on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, GDACS_FIXTURE))
    const result = await fetchGdacs()
    expect(result.events[0]?.type).toBe('TC')
    expect(result.events[0]?.alert).toBe('Red')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch(502, {}))
    await expect(fetchGdacs()).rejects.toThrow(/GDACS fetch failed/)
  })
})
