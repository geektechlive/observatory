import { describe, expect, it } from 'vitest'

import {
  deriveLiveStatus,
  evaluateSource,
  HEADLINE_SOURCES,
  SOURCE_NAMES,
  type SourceName,
  SOURCES,
  type SourceState,
  VIEW_HEADLINES,
} from '@/lib/health'
import type { ConsoleView } from '@/store/ui'

const FRESH = { degraded: false, dataAgeSeconds: null }

const ISS_TLE = {
  line1: '1 25544U 98067A   25001.00000000  .00000000  00000-0  00000-0 0  9990',
  line2: '2 25544  51.6400 000.0000 0000000   0.0000   0.0000 15.50000000000000',
}

describe('SOURCES', () => {
  it('marks exactly the console-critical sources as headline', () => {
    expect([...HEADLINE_SOURCES].sort()).toEqual(
      [
        'eonet',
        'geomag',
        'iss-tle',
        'launches',
        'neo',
        'orrery-bodies',
        'orrery-neo',
        'quakes',
        'solar-wind',
      ].sort(),
    )
  })

  it('excludes satellites from headline because its hook is layer-gated off by default', () => {
    expect(SOURCES['satellites'].headline).toBe(false)
  })

  it('grades orrery bodies by a non-empty bodies list, 72 h before degraded (#93)', () => {
    expect(SOURCES['orrery-bodies'].headline).toBe(true)
    expect(SOURCES['orrery-bodies'].maxAgeMs).toBe(72 * 3_600_000)
    expect(SOURCES['orrery-bodies'].required({ bodies: [] })).toBe(false)
    expect(SOURCES['orrery-bodies'].required({ bodies: [{ id: 'naif:-31' }] })).toBe(true)
  })

  it('grades orrery close approaches by a non-empty approach list, 36 h before degraded (#92)', () => {
    expect(SOURCES['orrery-neo'].headline).toBe(true)
    expect(SOURCES['orrery-neo'].maxAgeMs).toBe(36 * 3_600_000)
    expect(SOURCES['orrery-neo'].required({ approaches: [] })).toBe(false)
    expect(SOURCES['orrery-neo'].required({ approaches: [{ id: 'sb:524522' }] })).toBe(true)
  })

  it('grades orrery small bodies by the interstellar list, 72 h before degraded (#99)', () => {
    // Comets can be few or none in a quiet month; 1I, 2I and 3I are always there.
    expect(SOURCES['orrery-smallbodies'].headline).toBe(false)
    expect(SOURCES['orrery-smallbodies'].maxAgeMs).toBe(72 * 3_600_000)
    expect(SOURCES['orrery-smallbodies'].required({ comets: [], interstellar: [] })).toBe(false)
    expect(
      SOURCES['orrery-smallbodies'].required({ comets: [], interstellar: [{ id: 'sb:1004083' }] }),
    ).toBe(true)
  })

  it('grades the KV-built JPL feeds by their lists, and ages them as the job writes them (#146)', () => {
    // Rewritten every run: planets are for one UTC date; the other two change rarely.
    expect(SOURCES.planets.maxAgeMs).toBe(24 * 3_600_000)
    expect(SOURCES.sentry.maxAgeMs).toBe(48 * 3_600_000)
    expect(SOURCES.fireball.maxAgeMs).toBe(48 * 3_600_000)
    expect(SOURCES.planets.required({ bodies: [], updatedAt: 'x' })).toBe(false)
    expect(SOURCES.planets.required({ bodies: [{ name: 'Sun' }], updatedAt: 'x' })).toBe(true)
    expect(SOURCES.sentry.required({ count: '0', data: [] })).toBe(false)
    expect(SOURCES.sentry.required({ count: '1', data: [{ des: '1' }] })).toBe(true)
    expect(SOURCES.fireball.required({ count: '0', data: [] })).toBe(false)
    expect(SOURCES.fireball.required({ count: '1', data: [{ date: 'd' }] })).toBe(true)
  })

  it('grades orrery dwarf planets by a non-empty list, 72 h before degraded, never headline (#99)', () => {
    // Fetched only when the Dwarf planets switch or a link asks, so never on a view's list (ADR 0018).
    expect(SOURCES['orrery-dwarfs'].headline).toBe(false)
    expect(SOURCES['orrery-dwarfs'].maxAgeMs).toBe(72 * 3_600_000)
    expect(SOURCES['orrery-dwarfs'].required({ dwarfs: [] })).toBe(false)
    expect(SOURCES['orrery-dwarfs'].required({ dwarfs: [{ id: 'sb:20134340' }] })).toBe(true)
    expect(Object.values(VIEW_HEADLINES).flat()).not.toContain('orrery-dwarfs')
  })

  it("grades tonight's comets by a non-empty list, 72 h before degraded, never headline (#135)", () => {
    // Fetched only once a visitor shares a location on the Sky view, so no view always shows it.
    expect(SOURCES['comets-tonight'].headline).toBe(false)
    expect(SOURCES['comets-tonight'].maxAgeMs).toBe(72 * 3_600_000)
    const comet = { id: 'sb:1003639' }
    const rock = { id: 'sb:20000004' }
    expect(SOURCES['comets-tonight'].required({ comets: [], asteroids: [rock] })).toBe(false)
    // The bright asteroids (#99 item 4) are always there (Vesta alone is above V 7 at
    // opposition), so a slice without them means the asteroid step broke.
    expect(SOURCES['comets-tonight'].required({ comets: [comet], asteroids: [] })).toBe(false)
    expect(SOURCES['comets-tonight'].required({ comets: [comet] })).toBe(false)
    expect(SOURCES['comets-tonight'].required({ comets: [comet], asteroids: [rock] })).toBe(true)
    expect(Object.values(VIEW_HEADLINES).flat()).not.toContain('comets-tonight')
  })

  it('grades Space-Track by a TIP list (empty is fine), 36 h before degraded (#101)', () => {
    expect(SOURCES.spacetrack.headline).toBe(false)
    expect(SOURCES.spacetrack.maxAgeMs).toBe(36 * 3_600_000)
    expect(SOURCES.spacetrack.required({ tip: null })).toBe(false)
    expect(SOURCES.spacetrack.required({ tip: { reentries: [] } })).toBe(true)
  })

  it('grades the re-entry elements by shape: absent or empty is fine, a ragged row is not (#154)', () => {
    const row = ['A', '1', '2021-001A', '2026-11-12T10:00:00', 16, 0.0002, 53, 1, 2, 3, 0.1, 0, 0]
    const tip = (elements?: unknown) => ({ tip: { reentries: [], elements } })
    expect(SOURCES.spacetrack.required(tip())).toBe(true)
    expect(SOURCES.spacetrack.required(tip([]))).toBe(true)
    expect(SOURCES.spacetrack.required(tip([row]))).toBe(true)
    expect(SOURCES.spacetrack.required(tip([row.slice(0, 5)]))).toBe(false)
    expect(SOURCES.spacetrack.required(tip('rows'))).toBe(false)
  })

  it('grades DISCOS by its craft, 14 days before degraded (#101)', () => {
    expect(SOURCES.discos.headline).toBe(false)
    expect(SOURCES.discos.maxAgeMs).toBe(14 * 24 * 3_600_000)
    expect(SOURCES.discos.required({ craft: {} })).toBe(false)
    expect(SOURCES.discos.required({ craft: { '-31': { name: 'Voyager 1' } } })).toBe(true)
  })

  it('grades orrery satellites by non-empty rows, 36 h before degraded (#98)', () => {
    expect(SOURCES['orrery-sats'].headline).toBe(false)
    expect(SOURCES['orrery-sats'].maxAgeMs).toBe(36 * 3_600_000)
    expect(SOURCES['orrery-sats'].required({ rows: [] })).toBe(false)
    expect(SOURCES['orrery-sats'].required({ rows: [['ISS (ZARYA)', '25544']] })).toBe(true)
  })

  it('rejects a Starlink body whose SupGP count is not a count of its rows (#209)', () => {
    const rows = [
      ['STARLINK-1008', '44714'],
      ['STARLINK-1012', '44716'],
    ]
    const ok = SOURCES['orrery-sats'].required
    expect(ok({ rows, supgpCount: 2 })).toBe(true)
    expect(ok({ rows, supgpCount: 0 })).toBe(true)
    expect(ok({ rows, supgpCount: 3 })).toBe(false)
    expect(ok({ rows, supgpCount: -1 })).toBe(false)
    expect(ok({ rows, supgpCount: '2' })).toBe(false)
  })

  it('grades a JPL lookup by its answer: an object, a non-empty list, or "not found" (#148)', () => {
    const required = SOURCES['jpl-lookup'].required
    expect(SOURCES['jpl-lookup'].headline).toBe(false)
    const answer = (result: unknown) => ({ query: 'eros', provider: 'jpl-sbdb', result })
    expect(required(answer({ type: 'none' }))).toBe(true)
    expect(required(answer({ type: 'object', object: { spkid: '20000433' } }))).toBe(true)
    expect(required(answer({ type: 'list', count: 1, matches: [{ designation: '1P' }] }))).toBe(
      true,
    )
    expect(required(answer({ type: 'object', object: { spkid: '' } }))).toBe(false)
    expect(required(answer({ type: 'list', count: 0, matches: [] }))).toBe(false)
    expect(required(answer({ type: 'surprise' }))).toBe(false)
    expect(required({ query: 'eros' })).toBe(false)
  })

  it('grades a JPL trajectory by whole samples, or where the ephemeris ends (#148)', () => {
    const required = SOURCES['jpl-trajectory'].required
    expect(SOURCES['jpl-trajectory'].headline).toBe(false)
    const object = { spkid: '20000433' }
    const span = (samples: number[]) => ({ start: 2461345.5, step: 1, samples })
    const none = { availableFrom: null, availableTo: null }
    expect(required({ object, fine: span([1, 2, 3, 4, 5, 6]), ...none })).toBe(true)
    expect(required({ object, fine: null, availableFrom: null, availableTo: '2100-01-01' })).toBe(
      true,
    )
    expect(required({ object, fine: span([]), ...none })).toBe(false)
    expect(required({ object, fine: span([1, 2, 3, 4, 5]), ...none })).toBe(false)
    expect(required({ object, fine: null, ...none })).toBe(false)
    expect(required({ object: {}, fine: span([1, 2, 3, 4, 5, 6]), ...none })).toBe(false)
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

function allHeadline(
  state: SourceState,
  view: ConsoleView = 'earth',
): Partial<Record<SourceName, SourceState>> {
  return Object.fromEntries(VIEW_HEADLINES[view].map((n) => [n, state]))
}

const VIEWS: ConsoleView[] = ['earth', 'orrery', 'sun', 'sky', 'orbit']

describe('deriveLiveStatus', () => {
  it('reports syncing on an empty map', () => {
    expect(deriveLiveStatus({}, 'earth')).toBe('syncing')
  })

  it('reports syncing while any of the view’s headline sources has not reported', () => {
    const partial = allHeadline('ok')
    delete partial['quakes']
    expect(deriveLiveStatus(partial, 'earth')).toBe('syncing')
  })

  it('reports syncing when a headline source is explicitly unknown', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok'), quakes: 'unknown' }, 'earth')).toBe('syncing')
  })

  it('reports live only when every headline source is ok', () => {
    expect(deriveLiveStatus(allHeadline('ok'), 'earth')).toBe('live')
  })

  it('reports degraded when a headline source errored', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok'), quakes: 'error' }, 'earth')).toBe('degraded')
  })

  it('reports degraded when a headline source is stale', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok'), 'solar-wind': 'degraded' }, 'earth')).toBe(
      'degraded',
    )
  })

  it('ignores non-headline sources', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok'), apod: 'error' }, 'earth')).toBe('live')
  })

  // #178: no view ever fetched all seven old headline sources, so a cold load of any view
  // stayed at SYNCING forever. Each view now judges the sources it shows.
  it.each(VIEWS)('%s reaches live on its own headline sources alone (#178)', (view) => {
    expect(VIEW_HEADLINES[view].length).toBeGreaterThan(0)
    expect(deriveLiveStatus(allHeadline('ok', view), view)).toBe('live')
  })

  it('ignores a failing source the current view does not show (#178)', () => {
    expect(deriveLiveStatus({ ...allHeadline('ok', 'sky'), quakes: 'error' }, 'sky')).toBe('live')
  })

  it('makes every source in a view’s set a headline source, and no other (#178)', () => {
    const union = [...new Set(VIEWS.flatMap((v) => VIEW_HEADLINES[v]))].sort()
    expect([...HEADLINE_SOURCES].sort()).toEqual(union)
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
    expect(deriveLiveStatus(map, 'earth')).toBe('degraded')
  })
})

describe('aftershocks contract (#76)', () => {
  it('treats an empty list as usable: most weeks no quake has a forecast', () => {
    expect(evaluateSource('aftershocks', { forecasts: [], updatedAt: 'x' }, FRESH)).toBe('ok')
  })

  it('treats a payload without the list as an error', () => {
    expect(evaluateSource('aftershocks', { updatedAt: 'x' }, FRESH)).toBe('error')
  })
})
