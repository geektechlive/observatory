/**
 * The sky view's maths (#99 item 5): the dome projection (east on the left, north up, as
 * when looking at the sky), the generic run segmentation `passes.ts` also uses, the night
 * around a moment, and the track of a sampled object through it. Positions come from
 * Horizons samples only: a gap is a gap, never drawn.
 */
import { describe, expect, it } from 'vitest'

import { topocentric } from '@/lib/sky/topocentric'
import {
  collectRuns,
  coveredWindow,
  domePoint,
  hourlyRows,
  nightAround,
  skyAt,
  skyTrack,
  twilightBand,
} from '@/lib/sky/track'

import fixture from './fixtures/tonight/c2024t5-kittpeak.json'

const MIN = 60_000
const HOUR = 3_600_000
const [lonText, latText] = fixture.siteGeodetic.split(',')
const KITT_PEAK = { lat: Number(latText), lon: Number(lonText) - 360 }
const BODY = { fine: fixture.comet.fine, coarse: null }

describe('domePoint', () => {
  it('puts the zenith at the centre and the horizon on the rim', () => {
    const z = domePoint(90, 123)
    expect(Math.hypot(z.x, z.y)).toBeCloseTo(0, 9)
    expect(Math.hypot(domePoint(0, 123).x, domePoint(0, 123).y)).toBeCloseTo(1, 9)
    expect(Math.hypot(domePoint(45, 10).x, domePoint(45, 10).y)).toBeCloseTo(0.5, 9)
  })

  // Owner decision (2026-11-12): north at the top, east on the LEFT, as when looking up.
  it('puts north up, east left, south down and west right (screen y points down)', () => {
    const n = domePoint(0, 0)
    expect(n.x).toBeCloseTo(0, 9)
    expect(n.y).toBeCloseTo(-1, 9)
    const e = domePoint(0, 90)
    expect(e.x).toBeCloseTo(-1, 9)
    expect(e.y).toBeCloseTo(0, 9)
    const s = domePoint(0, 180)
    expect(s.y).toBeCloseTo(1, 9)
    const w = domePoint(0, 270)
    expect(w.x).toBeCloseTo(1, 9)
  })
})

describe('collectRuns', () => {
  it('splits consecutive kept samples into runs and treats null as a gap', () => {
    const values = [1, 5, 6, 2, 7, null, 8, 9, 1]
    const runs = collectRuns(
      0,
      values.length - 1,
      1,
      (t) => values[t] ?? null,
      (v) => v >= 5,
    )
    expect(runs).toEqual([[5, 6], [7], [8, 9]])
  })

  it('includes the end sample, like the ISS pass loop', () => {
    expect(
      collectRuns(
        0,
        3,
        1,
        (t) => t,
        () => true,
      ),
    ).toEqual([[0, 1, 2, 3]])
  })
})

describe('nightAround', () => {
  it('is the whole night around a moment inside it, not just the part still ahead', () => {
    // Kansas City, 2026-11-14 (UTC-6): sunset about 17:05 local, sunrise about 06:55 next day.
    const night = nightAround(new Date('2026-11-15T07:00:00Z'), 39.1, -94.6)
    expect(night).not.toBeNull()
    if (!night) return
    const start = night.start.toISOString()
    expect(start >= '2026-11-14T22:30:00Z' && start <= '2026-11-14T23:30:00Z').toBe(true)
    const end = night.end.toISOString()
    expect(end >= '2026-11-15T12:30:00Z' && end <= '2026-11-15T13:30:00Z').toBe(true)
  })

  it('is the coming night when asked in daylight', () => {
    const night = nightAround(new Date('2026-11-14T18:00:00Z'), 39.1, -94.6)
    expect(night?.start.getTime()).toBeGreaterThan(Date.parse('2026-11-14T18:00:00Z'))
  })

  it('is null where the Sun does not set within a day (Tromso, midsummer)', () => {
    expect(nightAround(new Date('2026-06-21T12:00:00Z'), 69.65, 18.96)).toBeNull()
  })
})

describe('twilightBand', () => {
  it('runs civil, nautical, astronomical, dark and back, over the whole night', () => {
    const night = nightAround(new Date('2026-11-14T18:00:00Z'), 39.1, -94.6)
    if (!night) throw new Error('no night')
    const band = twilightBand(night, 39.1, -94.6)
    expect(band[0]?.from.getTime()).toBe(night.start.getTime())
    expect(band.at(-1)?.to.getTime()).toBe(night.end.getTime())
    const kinds = band.map((c) => c.darkness)
    expect(kinds).toContain('dark')
    expect(kinds[0]).toBe('civil')
    expect(kinds.at(-1)).toBe('civil')
    // Neighbours differ, and the band has no holes.
    band.forEach((c, i) => {
      if (i > 0) {
        expect(c.darkness).not.toBe(band[i - 1]?.darkness)
        expect(c.from.getTime()).toBe(band[i - 1]?.to.getTime())
      }
    })
  })
})

describe('coveredWindow', () => {
  const span = fixture.comet.fine
  it('is the whole window when the samples cover it', () => {
    const w = { start: new Date('2026-11-07T02:00:00Z'), end: new Date('2026-11-07T12:00:00Z') }
    expect(coveredWindow(span, w)).toEqual({ window: w, partial: false })
  })
  it('is null with no span or a window outside it', () => {
    const w = { start: new Date('2027-03-01T00:00:00Z'), end: new Date('2027-03-01T10:00:00Z') }
    expect(coveredWindow(span, w)).toBeNull()
    expect(coveredWindow(null, w)).toBeNull()
  })
})

describe('skyTrack', () => {
  const night = { start: new Date('2026-11-07T01:00:00Z'), end: new Date('2026-11-07T13:00:00Z') }

  it('draws only samples at or above the horizon, in separate segments, from topocentric', () => {
    const track = skyTrack(BODY, KITT_PEAK, night)
    expect(track.segments.length).toBeGreaterThan(0)
    for (const seg of track.segments) {
      for (const p of seg) {
        expect(p.altitude).toBeGreaterThanOrEqual(0)
        const sky = topocentric(BODY, p.time, KITT_PEAK)
        expect(p.altitude).toBeCloseTo(sky?.altitude ?? Number.NaN, 9)
        expect(p.azimuth).toBeCloseTo(sky?.azimuth ?? Number.NaN, 9)
      }
    }
    const first = track.segments[0]?.[0]
    expect(first && first.time.getTime() % (10 * MIN)).toBe(0)
  })

  it('draws nothing outside the samples, and says the data does not cover the night', () => {
    const later = { start: new Date('2027-03-01T01:00:00Z'), end: new Date('2027-03-01T13:00:00Z') }
    const track = skyTrack(BODY, KITT_PEAK, later)
    expect(track.segments).toEqual([])
    expect(track.covered).toBeNull()
  })

  it('notes a night the samples cover only in part', () => {
    // The fine span has 61 daily samples from 2026-10-08, so it ends 2026-12-07T00:00Z.
    const edge = { start: new Date('2026-12-06T20:00:00Z'), end: new Date('2026-12-07T06:00:00Z') }
    const track = skyTrack(BODY, KITT_PEAK, edge)
    expect(track.covered?.partial).toBe(true)
    // Light time moves the last placeable sample a few minutes inside the span; 10-minute grid.
    const end = track.covered?.window.end.getTime() ?? 0
    expect(Math.abs(end - Date.parse('2026-12-07T00:00:00Z'))).toBeLessThanOrEqual(20 * MIN)
  })

  // One coverage rule (stateAt's: the fine span, then the coarse one) for the track, the hour
  // rows and the marker; before, the track looked at the fine span alone.
  it('uses the coarse span where the fine one misses the night, as stateAt does', () => {
    const farFine = { ...fixture.comet.fine, start: fixture.comet.fine.start - 400 }
    const body = { fine: farFine, coarse: fixture.comet.fine }
    const track = skyTrack(body, KITT_PEAK, night)
    expect(track.covered).not.toBeNull()
    expect(track.segments.length).toBeGreaterThan(0)
    expect(hourlyRows(body, KITT_PEAK, night).every((r) => r.altitude !== null)).toBe(true)
  })

  it('draws exactly where the hour rows and the marker have a position, with a partial span', () => {
    const edge = { start: new Date('2026-12-06T20:00:00Z'), end: new Date('2026-12-07T06:00:00Z') }
    const track = skyTrack(BODY, KITT_PEAK, edge)
    const covered = track.covered
    expect(covered?.partial).toBe(true)
    for (const row of hourlyRows(BODY, KITT_PEAK, edge)) {
      const inside =
        covered !== null && row.time >= covered.window.start && row.time <= covered.window.end
      // Away from the boundary the two answers agree: a position inside, none outside.
      const nearEdge = Math.abs(row.time.getTime() - Date.parse('2026-12-07T00:00:00Z')) < 30 * MIN
      if (!nearEdge) expect(row.altitude !== null).toBe(inside)
    }
    for (const seg of track.segments) {
      for (const p of seg) {
        expect(p.time.getTime()).toBeLessThanOrEqual(covered?.window.end.getTime() ?? 0)
        expect(skyAt(BODY, KITT_PEAK, p.time)).not.toBeNull()
      }
    }
    expect(skyAt(BODY, KITT_PEAK, new Date('2026-12-07T03:00:00Z'))).toBeNull()
  })
})

describe('hourlyRows', () => {
  it('lists the sky at each local hour in the night: altitude, direction, darkness', () => {
    const night = { start: new Date('2026-11-07T01:10:00Z'), end: new Date('2026-11-07T07:50:00Z') }
    const rows = hourlyRows(BODY, KITT_PEAK, night)
    expect(rows.length).toBeGreaterThanOrEqual(6)
    for (const r of rows) {
      expect(r.time.getTime()).toBeGreaterThanOrEqual(night.start.getTime())
      expect(r.time.getTime()).toBeLessThanOrEqual(night.end.getTime())
      expect(r.time.getMinutes()).toBe(0)
      expect(r.altitude).not.toBeNull()
      expect(r.direction).toMatch(/^[NESW]{1,3}$/)
    }
    expect(rows[1] && rows[0] && rows[1].time.getTime() - rows[0].time.getTime()).toBe(HOUR)
  })

  it('has null altitude where the samples do not reach', () => {
    const night = { start: new Date('2027-03-01T01:00:00Z'), end: new Date('2027-03-01T05:00:00Z') }
    const rows = hourlyRows(BODY, KITT_PEAK, night)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.altitude === null)).toBe(true)
  })
})
