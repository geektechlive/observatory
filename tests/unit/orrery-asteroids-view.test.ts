/**
 * The orrery's "Bright asteroids" (#99 item 4): entries built from the Tonight slice,
 * Ceres left to the dwarf planets, markers only on Horizons samples, and the
 * inspector's "from your location tonight" line.
 */
import { describe, expect, it } from 'vitest'

import {
  asteroidEntries,
  coveredWindow,
  smallBodyFacts,
  smallBodyState,
  tonightLine,
} from '@/lib/orrery/smallBodyView'
import type { CometsTonightData } from '@/schemas/cometsTonight'

import fixture from './fixtures/tonight/c2024t5-kittpeak.json'

const [lonText, latText] = fixture.siteGeodetic.split(',')
const KITT_PEAK = { lat: Number(latText), lon: Number(lonText) - 360 }

const rock = (spkid: string, name: string) => ({
  id: `sb:${spkid}`,
  spkid,
  name,
  h: 0,
  g: 0.15,
  gAssumed: true,
  elements: { epochJd: null, e: 0.09, q: 2.15, tp: 2458247.8, om: 103.8, w: 150.8, i: 7.14 },
  fine: fixture.comet.fine,
})

const slice = (asteroids: ReturnType<typeof rock>[]): CometsTonightData => ({
  generatedAt: '2026-11-07T00:15:00.000Z',
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  provider: 'jpl-horizons',
  window: { fromJd: 2461350, toJd: 2461360 },
  comets: [],
  asteroids,
})

describe('asteroidEntries', () => {
  it('makes one entry per asteroid, keyed like the other small bodies, in the asteroids group', () => {
    const entries = asteroidEntries(slice([rock('20000004', '4 Vesta')]))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ key: 'sbc:20000004', label: '4 Vesta', group: 'asteroids' })
    expect(entries[0]?.body.kind).toBe('asteroid')
    expect(entries[0]?.body.coarse).toBeNull()
  })

  it('leaves Ceres out: the dwarf planets draw it, so it appears once', () => {
    const entries = asteroidEntries(
      slice([rock('20000001', '1 Ceres'), rock('20000004', '4 Vesta')]),
    )
    expect(entries.map((e) => e.key)).toEqual(['sbc:20000004'])
  })

  it('is empty without data', () => {
    expect(asteroidEntries(undefined)).toEqual([])
  })

  it('places the marker only inside its samples, never extrapolated', () => {
    const [entry] = asteroidEntries(slice([rock('20000004', '4 Vesta')]))
    if (!entry) throw new Error('no entry')
    const { start, step, samples } = fixture.comet.fine
    const last = start + (samples.length / 6 - 1) * step
    expect(smallBodyState(entry.body, start + 3.5)).not.toBeNull()
    expect(smallBodyState(entry.body, last + 1)).toBeNull()
    expect(smallBodyState(entry.body, start - 1)).toBeNull()
  })

  it('names it an asteroid and carries no comet forecast in the inspector facts', () => {
    const [entry] = asteroidEntries(slice([rock('20000004', '4 Vesta')]))
    if (!entry) throw new Error('no entry')
    const f = smallBodyFacts(entry.body, Date.UTC(2026, 10, 7, 6))
    expect(f.kindLabel).toBe('Asteroid')
    expect(f.magnitude).toBeNull()
  })
})

describe('coveredWindow', () => {
  const span = { start: 100.5, step: 1, samples: Array.from({ length: 6 * 4 }, () => 0) }
  const at = (jd: number) => new Date((jd - 2440587.5) * 86_400_000)
  it('is the window itself when the samples cover it', () => {
    const w = { start: at(101), end: at(102) }
    expect(coveredWindow(span, w)).toEqual({ window: w, partial: false })
  })
  it('clips to the samples and says so when they end inside the window', () => {
    const w = { start: at(102), end: at(105) }
    const got = coveredWindow(span, w)
    expect(got?.partial).toBe(true)
    expect(got?.window.start).toEqual(w.start)
    expect(got?.window.end.getTime()).toBeCloseTo(at(103.5).getTime(), -2)
  })
  it('is null when the samples miss the window or there are none', () => {
    expect(coveredWindow(span, { start: at(110), end: at(111) })).toBeNull()
    expect(coveredWindow(null, { start: at(101), end: at(102) })).toBeNull()
  })
})

describe('tonightLine', () => {
  const [entry] = asteroidEntries(slice([rock('20000004', '4 Vesta')]))
  const NOW = new Date('2026-11-07T02:00:00Z')

  it('says when it is above 10 degrees in nautical dark and where it is highest', () => {
    if (!entry) throw new Error('no entry')
    const line = tonightLine(entry.body, KITT_PEAK, NOW)
    expect(line).toMatch(
      /^From your location tonight: above 10° \d\d:\d\d–\d\d:\d\d, highest \d+° [NESW]{1,3}$/,
    )
  })

  it('says it stays below 10 degrees when it never gets up', () => {
    if (!entry) throw new Error('no entry')
    const south = { lat: -80, lon: 0 }
    const line = tonightLine(entry.body, south, NOW)
    expect(line).toMatch(/^From your location tonight: .*(below 10°|dark enough)/i)
  })

  it('says it stays below 10 degrees only when the samples cover the whole dark window', () => {
    if (!entry) throw new Error('no entry')
    // T5's declination is about -13°: from 80°N it never reaches 10° (and the nautical window exists).
    const arctic = { lat: 80, lon: -94.6 }
    expect(tonightLine(entry.body, arctic, NOW)).toBe(
      'From your location tonight: below 10° in the dark.',
    )
  })

  it('claims nothing for the part of the night the samples do not reach', () => {
    if (!entry) throw new Error('no entry')
    const { start, step, samples } = fixture.comet.fine
    // Samples to 2026-11-08 00:00 UTC (JD 2461347.5): the Greenwich night runs on past it.
    const n = 2461347.5 - start + 1
    const cut = { ...entry.body, fine: { start, step, samples: samples.slice(0, n * 6) } }
    const greenwich = { lat: 51.5, lon: 0 }
    const line = tonightLine(cut, greenwich, new Date('2026-11-07T18:00:00Z'))
    expect(line ?? '').not.toMatch(/below/)
    if (line) expect(line).toMatch(/the part of the night the samples cover/)
  })

  it('is null when no sample reaches the night at all', () => {
    if (!entry) throw new Error('no entry')
    const { start, step, samples } = fixture.comet.fine
    const old = { ...entry.body, fine: { start, step, samples: samples.slice(0, 12) } }
    expect(tonightLine(old, KITT_PEAK, NOW)).toBeNull()
  })

  it('is null with no location', () => {
    if (!entry) throw new Error('no entry')
    expect(tonightLine(entry.body, null, NOW)).toBeNull()
  })
})
