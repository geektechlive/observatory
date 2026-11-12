import { describe, expect, it } from 'vitest'

import {
  MAX_TRAJECTORY_SAMPLES,
  parseTrajectoryParams,
  trajectorySampleCount,
} from '@/lib/orrery/jplLookup'
import { lookupSpan } from '@/lib/orrery/lookupTrack'

// /api/trajectory takes only the spans the orrery asks for (#223): every new span is a
// Horizons request against the jpl-queue's 2,000 a day, so a free choice of start, end and
// step let one script spend the day's budget for everyone.

const DAY_MS = 86_400_000
const FIRST = Date.parse('1900-01-01T00:00:00Z')
const LAST = Date.parse('2100-12-31T00:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / DAY_MS

const accepts = (start: string, end: string, step: string, id = 'sb:20000433') =>
  parseTrajectoryParams(new URLSearchParams({ id, start, end, step })).ok

/** Every 2-day span the orrery asks for, 1900–2100 (`lookupSpan`, one per sim day). */
function gridSpans() {
  const spans = new Map<string, { start: string; end: string; step: string }>()
  for (let t = FIRST; t < LAST + DAY_MS; t += DAY_MS) {
    const s = lookupSpan(t)
    if (s) spans.set(`${s.start}/${s.end}`, s)
  }
  return [...spans.values()]
}

/**
 * Every dense span a close pass can ask for (#215): 4 days at 10 minutes from a 2-day
 * sample of a grid span, inside it (`lookupClosestSpan` uses interior samples only).
 */
function denseStarts(grid: { start: string; end: string }[]) {
  const starts = new Set<number>()
  for (const g of grid) {
    for (let d = day(g.start); d + 4 <= day(g.end); d += 2) starts.add(d)
  }
  return starts
}

describe('/api/trajectory accepts only the orrery’s own spans (#223)', () => {
  const grid = gridSpans()
  const dense = denseStarts(grid)

  it('accepts every 2-day span lookupSpan builds, 1900–2100', () => {
    for (const s of grid) expect(accepts(s.start, s.end, s.step), s.start).toBe(true)
  })

  it('accepts every dense close-pass span, including near the clamped ends', () => {
    for (const d of dense) {
      expect(accepts(iso(d * DAY_MS), iso((d + 4) * DAY_MS), '10m'), iso(d * DAY_MS)).toBe(true)
    }
    // The span clamped to 2100 has its samples on even days, unlike the rest of the grid.
    expect(accepts('2100-12-23', '2100-12-27', '10m')).toBe(true)
  })

  it('bounds the keys one object can make: 608 grid spans and 37,059 dense ones', () => {
    // Before #223 any start, end (≤ 600 samples) and step ≥ 10 m was a new key: with whole
    // days alone, 73,414 starts × up to 599 ends is over 40 million. Now the shapes are
    // exact: every other start in 1900–2100 is refused for both shapes.
    let gridKeys = 0
    let denseKeys = 0
    for (let t = FIRST; t <= LAST; t += DAY_MS) {
      const start = iso(t)
      if (accepts(start, iso(t + 730 * DAY_MS), '2d')) gridKeys += 1
      const isDense = accepts(start, iso(t + 4 * DAY_MS), '10m')
      if (isDense) denseKeys += 1
      expect(isDense, start).toBe(dense.has(t / DAY_MS))
    }
    expect(gridKeys).toBe(grid.length)
    expect(gridKeys).toBe(608)
    expect(denseKeys).toBe(dense.size)
    expect(denseKeys).toBe(37_059)
  })

  it('refuses spans the orrery never asks for', () => {
    const g = lookupSpan(Date.parse('2026-11-01T00:00:00Z'))
    expect(g).toEqual({ start: '2025-09-04', end: '2027-09-04', step: '2d' })
    const off = [
      ['2026-01-01', '2026-01-03', '1d'], // the old health probe
      ['2025-09-05', '2027-09-05', '2d'], // the grid moved a day
      ['2025-09-04', '2027-09-03', '2d'], // a day short
      ['2025-09-04', '2027-09-04', '3d'], // another step
      ['2025-09-04', '2026-09-04', '2d'], // one year
      ['2026-11-11', '2026-11-15', '10m'], // a dense span off the 2-day samples
      ['2026-11-10', '2026-11-13', '10m'], // three days
      ['2026-11-10', '2026-11-14', '20m'], // another dense step
      ['2026-11-10', '2026-11-14', '1h'],
      ['1900-01-02', '1900-01-06', '10m'], // off the clamped 1900 span's samples
    ] as const
    for (const [start, end, step] of off) {
      expect(accepts(start, end, step), `${start} ${end} ${step}`).toBe(false)
    }
  })

  it('refuses most of what the sample cap alone allowed, for one start', () => {
    // The old rules: a valid date pair inside 1900–2100 and at most 600 samples.
    let capOnly = 0
    let now = 0
    const start = '2025-09-04'
    for (let n = 1; n <= 800; n += 1) {
      const end = iso(Date.parse(`${start}T00:00:00Z`) + n * DAY_MS)
      for (const step of ['10m', '1h', '6h', '1d', '2d']) {
        const minutes = { '10m': 10, '1h': 60, '6h': 360, '1d': 1440, '2d': 2880 }[step] ?? 0
        const req = { spkid: '1', start, end, stepMinutes: minutes }
        if (trajectorySampleCount(req) <= MAX_TRAJECTORY_SAMPLES) capOnly += 1
        if (accepts(start, end, step)) now += 1
      }
    }
    expect(capOnly).toBeGreaterThan(1500)
    expect(now).toBe(2) // the grid span and its first dense span
  })

  it('refuses an SPK-ID with a leading zero, a second key for the same object', () => {
    expect(accepts('2025-09-04', '2027-09-04', '2d', 'sb:20000433')).toBe(true)
    expect(accepts('2025-09-04', '2027-09-04', '2d', 'sb:020000433')).toBe(false)
    expect(accepts('2025-09-04', '2027-09-04', '2d', 'sb:0')).toBe(false)
  })
})
