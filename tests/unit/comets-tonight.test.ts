/**
 * "What can I see tonight" for comets (#99): which ones are up in the dark, when they
 * are highest, and how bright JPL's law says they are.
 */
import { describe, expect, it } from 'vitest'

import {
  cometMagnitude,
  cometsTonight,
  FAINTEST_LISTED,
  reachOf,
  type TonightCandidate,
} from '@/lib/sky/cometsTonight'

import fixture from './fixtures/tonight/c2024t5-kittpeak.json'

const [lonText, latText, hText] = fixture.siteGeodetic.split(',')
const KITT_PEAK = {
  lon: Number(lonText) - 360,
  lat: Number(latText),
  heightKm: Number.parseFloat(hText ?? '0'),
}
/** Kitt Peak's fully dark hours that night, roughly (UTC). */
const NIGHT = { start: new Date('2026-11-07T02:00:00Z'), end: new Date('2026-11-07T12:00:00Z') }

const t5: TonightCandidate = {
  id: 'sb:1004035',
  name: fixture.comet.name,
  interstellar: false,
  m1: fixture.comet.m1,
  k1: fixture.comet.k1,
  fine: fixture.comet.fine,
  coarse: null,
}

const horizonsRows = fixture.rows.map((r) => ({
  time: new Date(`${r.utc.replace(/-(\w{3})-/, ' $1 ')} UTC`),
  el: Number(r.cols[5]),
}))

describe('cometMagnitude', () => {
  it('is JPL total-magnitude law T = M1 + 5 log Δ + K1 log r', () => {
    expect(cometMagnitude(5, 9, 4, 3)).toBeCloseTo(5 + 5 * Math.log10(3) + 9 * Math.log10(4), 9)
  })
})

describe('reachOf', () => {
  it.each([
    [4, 'naked-eye'],
    [6, 'naked-eye'],
    [8.5, 'binoculars'],
    [11, 'small-telescope'],
    [13.3, 'large-telescope'],
    [FAINTEST_LISTED, 'large-telescope'],
    [FAINTEST_LISTED + 0.1, null],
  ])('magnitude %d needs %s', (mag, reach) => {
    expect(reachOf(mag)).toBe(reach)
  })
})

describe('cometsTonight', () => {
  it('finds C/2024 T5 from Kitt Peak at its highest in the dark, as Horizons has it', () => {
    const { visible } = cometsTonight([t5], KITT_PEAK, NIGHT)
    expect(visible).toHaveLength(1)
    const c = visible[0]
    const inWindow = horizonsRows.filter((r) => r.time >= NIGHT.start && r.time <= NIGHT.end)
    const peak = inWindow.reduce((a, b) => (b.el > a.el ? b : a))
    expect(c?.altitude).toBeGreaterThanOrEqual(peak.el - 0.05)
    expect(Math.abs((c?.best.getTime() ?? 0) - peak.time.getTime())).toBeLessThanOrEqual(3_600_000)
    expect(c?.magnitude).toBeCloseTo(13.3, 1)
    expect(c?.reach).toBe('large-telescope')
    expect(c?.direction).toBe('S')
  })

  it('leaves out a comet that never clears 10° in the dark', () => {
    const north = { lat: 80, lon: KITT_PEAK.lon }
    const result = cometsTonight([t5], north, NIGHT)
    expect(result.visible).toHaveLength(0)
    expect(result.brightestFaint).toBeNull()
  })

  it('keeps the brightest one that is up but too faint, for the empty state', () => {
    const faint = { ...t5, m1: 9 }
    const result = cometsTonight([faint], KITT_PEAK, NIGHT)
    expect(result.visible).toHaveLength(0)
    expect(result.brightestFaint?.name).toBe(t5.name)
    expect(result.brightestFaint?.magnitude).toBeGreaterThan(FAINTEST_LISTED)
  })

  it('skips an object with no magnitude law, and one with no data tonight', () => {
    const noLaw = { ...t5, m1: null, k1: null }
    const later = { start: new Date('2027-06-01T02:00:00Z'), end: new Date('2027-06-01T10:00:00Z') }
    expect(cometsTonight([noLaw], KITT_PEAK, NIGHT).visible).toHaveLength(0)
    expect(cometsTonight([t5], KITT_PEAK, later).visible).toHaveLength(0)
  })

  it('lists the brightest first', () => {
    const brighter = { ...t5, id: 'b', name: 'Brighter', m1: 3 }
    const names = cometsTonight([t5, brighter], KITT_PEAK, NIGHT).visible.map((c) => c.name)
    expect(names).toEqual(['Brighter', t5.name])
  })
})
