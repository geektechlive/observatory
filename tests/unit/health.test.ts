import { describe, expect, it } from 'vitest'

import {
  deriveLiveStatus,
  evaluateSource,
  HEADLINE_SOURCES,
  SOURCE_NAMES,
  type SourceName,
  SOURCES,
  type SourceState,
} from '@/lib/health'

const FRESH = { degraded: false, dataAgeSeconds: null }

const ISS_TLE = {
  line1: '1 25544U 98067A   25001.00000000  .00000000  00000-0  00000-0 0  9990',
  line2: '2 25544  51.6400 000.0000 0000000   0.0000   0.0000 15.50000000000000',
}

describe('SOURCES', () => {
  it('marks exactly the console-critical sources as headline', () => {
    expect([...HEADLINE_SOURCES].sort()).toEqual(
      ['eonet', 'geomag', 'iss-tle', 'launches', 'neo', 'quakes', 'solar-wind'].sort(),
    )
  })

  it('excludes satellites from headline because its hook is layer-gated off by default', () => {
    expect(SOURCES['satellites'].headline).toBe(false)
  })

  it('gives every source a label and a positive max age', () => {
    for (const name of SOURCE_NAMES) {
      const contract = SOURCES[name]
      expect(contract.label.length).toBeGreaterThan(0)
      expect(contract.maxAgeMs).toBeGreaterThan(0)
    }
  })
})

describe('evaluateSource', () => {
  it('returns ok for a fresh payload that satisfies the contract', () => {
    expect(evaluateSource('iss-tle', ISS_TLE, FRESH)).toBe('ok')
  })

  it('returns error when the payload parsed but carries nothing usable', () => {
    expect(evaluateSource('eonet', null, FRESH)).toBe('error')
    expect(evaluateSource('quakes', [], FRESH)).toBe('error')
    expect(evaluateSource('neo', {}, FRESH)).toBe('error')
  })

  it('returns error for solar wind missing its headline readings', () => {
    expect(evaluateSource('solar-wind', { currentKp: null, windSpeed: 400 }, FRESH)).toBe('error')
    expect(evaluateSource('solar-wind', { currentKp: 3, windSpeed: null }, FRESH)).toBe('error')
    expect(evaluateSource('solar-wind', { currentKp: 3, windSpeed: 400 }, FRESH)).toBe('ok')
  })

  it('accepts a zero reading as present', () => {
    expect(evaluateSource('solar-wind', { currentKp: 0, windSpeed: 0 }, FRESH)).toBe('ok')
    expect(evaluateSource('geomag', { currentDst: 0, currentBz: 0 }, FRESH)).toBe('ok')
  })

  it('returns error for geomag missing Dst or Bz', () => {
    expect(evaluateSource('geomag', { currentDst: -20 }, FRESH)).toBe('error')
    expect(evaluateSource('geomag', { currentDst: -20, currentBz: -5 }, FRESH)).toBe('ok')
  })

  it('returns error for an ISS TLE with blank lines', () => {
    expect(evaluateSource('iss-tle', { line1: '', line2: '' }, FRESH)).toBe('error')
  })

  it('returns error for a satellites payload with an empty array', () => {
    expect(evaluateSource('satellites', { satellites: [], updatedAt: 'now' }, FRESH)).toBe('error')
    expect(
      evaluateSource('satellites', { satellites: [{ name: 'A' }], updatedAt: 'now' }, FRESH),
    ).toBe('ok')
  })

  it('returns degraded when the server flags the payload as degraded', () => {
    expect(evaluateSource('iss-tle', ISS_TLE, { degraded: true, dataAgeSeconds: null })).toBe(
      'degraded',
    )
  })

  it('returns degraded when the payload is older than the source max age', () => {
    const overAge = SOURCES['quakes'].maxAgeMs / 1000 + 1
    expect(
      evaluateSource('quakes', [{ id: 'q1' }], { degraded: false, dataAgeSeconds: overAge }),
    ).toBe('degraded')
  })

  it('stays ok when the payload is within the source max age', () => {
    const underAge = SOURCES['quakes'].maxAgeMs / 1000 - 1
    expect(
      evaluateSource('quakes', [{ id: 'q1' }], { degraded: false, dataAgeSeconds: underAge }),
    ).toBe('ok')
  })

  it('prefers error over degraded when there is no usable data', () => {
    expect(evaluateSource('quakes', [], { degraded: true, dataAgeSeconds: 999_999 })).toBe('error')
  })
})

function allHeadline(state: SourceState): Partial<Record<SourceName, SourceState>> {
  return Object.fromEntries(HEADLINE_SOURCES.map((n) => [n, state]))
}

describe('deriveLiveStatus', () => {
  it('reports syncing on an empty map', () => {
    expect(deriveLiveStatus({})).toBe('syncing')
  })

  it('reports syncing while any headline source has not reported', () => {
    const partial = allHeadline('ok')
    delete partial['neo']
    expect(deriveLiveStatus(partial)).toBe('syncing')
  })

  it('reports syncing when a headline source is explicitly unknown', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok'), neo: 'unknown' })).toBe('syncing')
  })

  it('reports live only when every headline source is ok', () => {
    expect(deriveLiveStatus(allHeadline('ok'))).toBe('live')
  })

  it('reports degraded when a headline source errored', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok'), quakes: 'error' })).toBe('degraded')
  })

  it('reports degraded when a headline source is stale', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok'), 'solar-wind': 'degraded' })).toBe('degraded')
  })

  it('ignores non-headline sources', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok'), apod: 'error' })).toBe('live')
  })
})

describe('2026-09-07 upstream-drift regression', () => {
  // These are the exact payloads observatory.geektechlive.com was serving with
  // HTTP 200 while the header claimed LIVE. Each one must grade as an error, and
  // together they must never produce a live header again.
  const SOLAR_WIND_AS_SERVED = {
    kpReadings: [],
    currentKp: null,
    windSpeed: null,
    windDensity: null,
    imfBz: null,
    windSpeedSeries: [],
    windDensitySeries: [],
    imfBzSeries: [],
    updatedAt: '2026-09-07T04:57:42.361Z',
  }
  const GEOMAG_AS_SERVED = {
    dstSeries: [-2, -3, 2, 7],
    currentDst: 16,
    bzSeries: [],
    currentBz: null,
    updatedAt: '2026-09-07T04:57:42.278Z',
  }

  it('grades the empty-but-200 solar wind payload as an error', () => {
    expect(evaluateSource('solar-wind', SOLAR_WIND_AS_SERVED, FRESH)).toBe('error')
  })

  it('grades the Bz-less geomag payload as an error', () => {
    expect(evaluateSource('geomag', GEOMAG_AS_SERVED, FRESH)).toBe('error')
  })

  it('never reports live while those feeds are empty', () => {
    const map = {
      ...allHeadline('ok'),
      'solar-wind': evaluateSource('solar-wind', SOLAR_WIND_AS_SERVED, FRESH),
      geomag: evaluateSource('geomag', GEOMAG_AS_SERVED, FRESH),
    }
    expect(deriveLiveStatus(map)).toBe('degraded')
  })
})
