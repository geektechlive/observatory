/**
 * The Tonight panel's slice of the comet payload (#135): only the bodies with a magnitude
 * law and a week of their spans, cut in the refresh job, so the panel downloads a few KB
 * instead of the orrery's 72 KB gzip. Cutting must not change a single answer the panel
 * gives while the copy is in use.
 */
import { describe, expect, it } from 'vitest'

import { cometsTonight, type TonightCandidate } from '@/lib/sky/cometsTonight'
import { CometsTonightSchema } from '@/schemas/cometsTonight'

// @ts-expect-error plain ESM script, no type declarations
import { buildCometsTonight, trimSpan } from '../../../scripts/comets-tonight.mjs'
import fixture from '../fixtures/tonight/c2024t5-kittpeak.json'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const [lonText, latText] = fixture.siteGeodetic.split(',')
const KITT_PEAK = { lat: Number(latText), lon: Number(lonText) - 360 }
/** The fixture's fine span runs ±30 days around 2026-11-06 (JD 2461351.5). */
const GENERATED = Date.parse('2026-11-07T00:15:00Z')

interface Body extends TonightCandidate {
  m1: number | null
  k1: number | null
}

const t5: Body = {
  id: 'sb:1004035',
  name: fixture.comet.name,
  interstellar: false,
  m1: fixture.comet.m1,
  k1: fixture.comet.k1,
  fine: fixture.comet.fine,
  coarse: null,
}

/** T5's positions at a 5-day step, standing in for an interstellar object's long span. */
const coarseOf = (fine: { start: number; step: number; samples: number[] }) => {
  const samples: number[] = []
  for (let i = 0; i < fine.samples.length / 6; i += 5) {
    samples.push(...fine.samples.slice(i * 6, i * 6 + 3))
  }
  return { start: fine.start, step: 5, samples }
}

function payload() {
  return {
    generatedAt: new Date(GENERATED).toISOString(),
    coarseFetchedAt: new Date(GENERATED).toISOString(),
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    comets: [t5, { ...t5, id: 'sb:2', name: 'Faint', m1: 12 }],
    interstellar: [
      // 1I: only an asteroid's H, so the panel never lists it.
      { ...t5, id: 'sb:50788063', name: '1I/ʻOumuamua', interstellar: true, m1: null, k1: null },
      // An object with only a long span: its coarse samples must survive the cut.
      {
        ...t5,
        id: 'sb:1003639',
        name: '2I/Borisov',
        interstellar: true,
        m1: 7,
        fine: null,
        coarse: coarseOf(fixture.comet.fine),
      },
    ],
    missing: [],
  }
}

const darkFrom = (start: number) => ({ start: new Date(start), end: new Date(start + 10 * HOUR) })

describe('buildCometsTonight (#135)', () => {
  it('gives the panel exactly the answers the full payload gives, every night the copy is used', () => {
    const full = payload()
    const slice = CometsTonightSchema.parse(buildCometsTonight(full))
    const all = [...full.comets, ...full.interstellar]
    // From the refresh until a copy 4 days stale would still be served, in 6 h steps.
    for (let t = GENERATED - 6 * HOUR; t <= GENERATED + 4 * DAY; t += 6 * HOUR) {
      const window = darkFrom(t)
      expect(cometsTonight(slice.comets, KITT_PEAK, window)).toEqual(
        cometsTonight(all, KITT_PEAK, window),
      )
    }
    // The check has teeth: T5 is up and listed on the first night.
    expect(
      cometsTonight(slice.comets, KITT_PEAK, darkFrom(GENERATED + 2 * HOUR)).visible,
    ).not.toEqual([])
  })

  it('leaves out what the panel never uses: bodies with no magnitude law, elements, solutions', () => {
    const slice = buildCometsTonight(payload())
    expect(slice.comets.map((c: { id: string }) => c.id)).toEqual([
      'sb:1004035',
      'sb:2',
      'sb:1003639',
    ])
    expect(Object.keys(slice.comets[0]).sort()).toEqual(
      ['coarse', 'fine', 'id', 'interstellar', 'k1', 'm1', 'name'].sort(),
    )
    // A fine span that covers the week needs no coarse one.
    expect(slice.comets[0].coarse).toBeNull()
    expect(slice.comets[2].fine).toBeNull()
    expect(slice.comets[2].coarse).not.toBeNull()
  })

  it('keeps about a week of daily samples, a fraction of the full payload', () => {
    const full = payload()
    const slice = buildCometsTonight(full)
    const fine = slice.comets[0].fine
    // A day before to a week after, bracketed: 9 or 10 daily samples, not 61.
    expect(fine.samples.length / 6).toBeGreaterThanOrEqual(9)
    expect(fine.samples.length / 6).toBeLessThanOrEqual(10)
    // Raw size: this fixture repeats one comet, which gzip folds away; the real payload's
    // gzip sizes are measured in docs/reference/orrery-data.md.
    expect(JSON.stringify(slice).length).toBeLessThan(JSON.stringify(full).length / 4)
  })
})

describe('trimSpan', () => {
  const span = { start: 100.5, step: 1, samples: Array.from({ length: 30 }, (_, i) => i) }

  it('keeps the samples that bracket the window, plus the padding asked for', () => {
    expect(trimSpan(span, 3, 102.7, 104.2)).toEqual({
      start: 102.5,
      step: 1,
      samples: span.samples.slice(6, 15),
    })
    expect(trimSpan(span, 3, 102.7, 104.2, 1)?.start).toBe(101.5)
  })

  it('is null when the span misses the window or is absent', () => {
    expect(trimSpan(span, 3, 200, 210)).toBeNull()
    expect(trimSpan(null, 3, 100, 101)).toBeNull()
  })
})
