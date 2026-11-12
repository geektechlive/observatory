/**
 * The dwarf planets in the orrery (#99 item 8): markers only from the coarse Horizons
 * span (interpolated, never extrapolated), lines from SBDB elements through conicPath.
 *
 * Fixtures are real (tests/unit/fixtures/dwarfs, fetched 2026-11-12, one request at a
 * time): `horizons-midpoints.json` holds a slice of each body's coarse span around
 * perihelion and Horizons' own positions halfway between its samples;
 * `spans-thinned.json` every sample of Eris, Makemake and Haumea, every 2nd of Pluto's
 * and every 10th of Ceres's, at 4 decimals.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DWARFS } from '@/lib/orrery/dwarfs'
import {
  dwarfEntries,
  dwarfFacts,
  dwarfNotice,
  dwarfPath,
  dwarfState,
  dwarfStatus,
  entryPath,
  entryState,
} from '@/lib/orrery/dwarfView'
import type { Vec3 } from '@/lib/orrery/scale'
import type { OrreryDwarf, OrreryDwarfs } from '@/schemas/orreryDwarfs'
import { SIM_MAX_MS, SIM_MIN_MS } from '@/store/orreryClock'

const DAY_MS = 86_400_000
const jdOf = (ms: number) => ms / DAY_MS + 2440587.5
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'dwarfs', name), 'utf8'))

interface Span {
  start: number
  step: number
  samples: number[]
}
const midpoints = fixture('horizons-midpoints.json') as {
  bodies: { name: string; target: string; coarse: Span; midpoints: number[][] }[]
}
const thinned = fixture('spans-thinned.json') as { bodies: ({ name: string } & Span)[] }

const spec = (name: string) => {
  const s = DWARFS.find((d) => d.name === name)
  if (!s) throw new Error(name)
  return s
}
const dwarf = (name: string, coarse: Span): OrreryDwarf => ({
  id: `sb:${spec(name).spkid}`,
  spkid: spec(name).spkid,
  name,
  target: spec(name).target,
  availableFrom: null,
  availableTo: null,
  coarse,
})
/** Each body's whole span, thinned, as the payload would carry it. */
const whole = thinned.bodies.map((b) => dwarf(b.name, b))
const payload = { dwarfs: whole } as unknown as OrreryDwarfs
const entries = dwarfEntries(payload)
const byName = (name: string) => {
  const e = entries.find((x) => x.label === name)
  if (!e) throw new Error(name)
  return e
}

/** The line as the layer draws it: closed back to its first point. */
const closedLine = (e: Parameters<typeof dwarfPath>[0]) => {
  const { points } = dwarfPath(e)
  return points[0] ? [...points, points[0]] : points
}

function distanceToLine(p: Vec3, line: readonly Vec3[]): number {
  let best = Number.POSITIVE_INFINITY
  for (let k = 0; k + 1 < line.length; k += 1) {
    const a = line[k] as Vec3
    const b = line[k + 1] as Vec3
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
    const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z }
    const l2 = ab.x ** 2 + ab.y ** 2 + ab.z ** 2
    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / l2))
    best = Math.min(best, Math.hypot(ap.x - t * ab.x, ap.y - t * ab.y, ap.z - t * ab.z))
  }
  return best
}

describe('dwarfEntries', () => {
  it('keys each by its SPK-ID, as comets are, in the dwarf group', () => {
    expect(entries.map((e) => [e.key, e.label, e.group])).toEqual([
      ['sbc:20134340', 'Pluto', 'dwarfs'],
      ['sbc:20000001', 'Ceres', 'dwarfs'],
      ['sbc:20136199', 'Eris', 'dwarfs'],
      ['sbc:20136472', 'Makemake', 'dwarfs'],
      ['sbc:20136108', 'Haumea', 'dwarfs'],
    ])
  })

  it('has none for a copy written before them, or none at all', () => {
    expect(dwarfEntries({ dwarfs: [] } as unknown as OrreryDwarfs)).toEqual([])
    expect(dwarfEntries(undefined)).toEqual([])
  })

  it('skips a body this build does not know', () => {
    const stranger = { ...dwarf('Eris', { start: 1, step: 1, samples: [] }), spkid: '1' }
    expect(dwarfEntries({ dwarfs: [stranger] } as unknown as OrreryDwarfs)).toEqual([])
  })
})

describe('dwarfState: the marker, from the span only', () => {
  it("keeps Pluto's barycentre at both ends of the clock", () => {
    const pluto = byName('Pluto')
    expect(dwarfState(pluto, jdOf(SIM_MIN_MS))).not.toBeNull()
    expect(dwarfState(pluto, jdOf(SIM_MAX_MS))).not.toBeNull()
  })

  it('hides Ceres, Eris, Makemake and Haumea in 1000 AD, and shows them today', () => {
    const ad1000 = jdOf(Date.UTC(1000, 0, 1))
    const today = jdOf(Date.UTC(2026, 10, 12))
    for (const name of ['Ceres', 'Eris', 'Makemake', 'Haumea']) {
      expect(dwarfState(byName(name), ad1000)).toBeNull()
      expect(dwarfState(byName(name), today)).not.toBeNull()
    }
  })

  it.each(midpoints.bodies.map((b) => [b.name, b] as const))(
    "%s: within 0.01 au of Horizons' own position halfway between samples",
    (name, b) => {
      const e = dwarfEntries({ dwarfs: [dwarf(name, b.coarse)] } as unknown as OrreryDwarfs)[0]
      if (!e) throw new Error(name)
      expect(b.target).toBe(spec(name).target)
      expect(b.coarse.step).toBe(spec(name).stepDays)
      expect(b.midpoints.length).toBeGreaterThan(15)
      let worst = 0
      for (const [jd = 0, x = 0, y = 0, z = 0] of b.midpoints) {
        const p = dwarfState(e, jd)?.position
        if (!p) throw new Error(`no position at ${String(jd)}`)
        worst = Math.max(worst, Math.hypot(p.x - x, p.y - y, p.z - z))
      }
      expect(worst).toBeLessThanOrEqual(0.01)
    },
  )
})

describe('dwarfPath: the line, from the elements', () => {
  it('is the closed orbit through conicPath, wherever the marker is', () => {
    for (const e of entries) {
      const path = dwarfPath(e)
      expect(path.closed).toBe(true)
      expect(path.source).toBe('conic')
      expect(path.points).toHaveLength(360)
    }
  })

  // Measured on the real spans: the elements hold the orbit's shape far better than the
  // position along it, which drifts tens of degrees. Worst over each span: Pluto 0.63 au
  // (2836 BC), Eris 0.37, Makemake 0.22, Haumea 0.21, Ceres 0.07. Even within a century
  // of the epoch the outer four reach 0.16-0.24 au: heliocentric osculating elements of a
  // distant body wobble with Jupiter (the likely cause; not checked).
  it.each([
    ['Pluto', 0.65],
    ['Ceres', 0.08],
    ['Eris', 0.38],
    ['Makemake', 0.23],
    ['Haumea', 0.22],
  ] as const)('%s: every sample within %s au of its line', (name, bound) => {
    const e = byName(name)
    const line = closedLine(e)
    const s = e.body.coarse.samples
    for (let i = 0; i < s.length; i += 3) {
      const p = { x: s[i] ?? 0, y: s[i + 1] ?? 0, z: s[i + 2] ?? 0 }
      expect(distanceToLine(p, line)).toBeLessThanOrEqual(bound)
    }
  })
})

describe('entryState and entryPath', () => {
  it('answer for a dwarf as dwarfState and dwarfPath do', () => {
    const ceres = byName('Ceres')
    const jd = jdOf(Date.UTC(2026, 10, 12))
    expect(entryState(ceres, jd)).toEqual(dwarfState(ceres, jd))
    expect(entryPath(ceres)).toEqual(dwarfPath(ceres))
  })
})

describe('dwarfNotice', () => {
  it('says nothing while every marker is drawn', () => {
    expect(dwarfNotice(entries, jdOf(Date.UTC(2026, 10, 12)))).toBeNull()
  })

  it('names the hidden ones in 1000 AD, with the window their own spans give', () => {
    expect(dwarfNotice(entries, jdOf(Date.UTC(1000, 0, 1)))).toBe(
      "Ceres, Eris, Makemake and Haumea are hidden: JPL's ephemerides for them cover about 1600 to 2500. Their orbits are still drawn.",
    )
  })

  it('takes the window from the span, not from a constant', () => {
    const short = dwarf('Ceres', {
      start: jdOf(Date.UTC(1900, 0, 1)),
      step: 120,
      samples: [1, 0, 0, 1, 0, 0, 1, 0, 0],
    })
    const only = dwarfEntries({ dwarfs: [short] } as unknown as OrreryDwarfs)
    expect(dwarfNotice(only, jdOf(Date.UTC(1000, 0, 1)))).toBe(
      "Ceres is hidden: JPL's ephemeris for it covers about 1900 to 1900. Its orbit is still drawn.",
    )
  })
})

describe('dwarfFacts', () => {
  it("says Pluto's span covers the whole clock, in BC and AD", () => {
    expect(dwarfFacts(byName('Pluto'), Date.UTC(2026, 0, 1)).coverage).toBe(
      'the whole clock, 3000 BC to 3000 AD',
    )
    expect(dwarfFacts(byName('Ceres'), Date.UTC(2026, 0, 1)).coverage).toBe('1600 to 2500')
  })
})

describe('dwarfStatus', () => {
  it('is empty until asked for, then says what loaded, or that none has yet', () => {
    expect(dwarfStatus({ status: 'success', enabled: false, count: 5 })).toBe('')
    expect(dwarfStatus({ status: 'pending', enabled: true, count: 0 })).toBe(
      'Loading from JPL Horizons…',
    )
    expect(dwarfStatus({ status: 'success', enabled: true, count: 5 })).toBe(
      '5 dwarf planets, from JPL Horizons',
    )
    expect(dwarfStatus({ status: 'success', enabled: true, count: 0 })).toBe(
      'No dwarf-planet data yet: the next data refresh adds it.',
    )
    expect(dwarfStatus({ status: 'error', enabled: true, count: 0 })).toBe(
      'No dwarf-planet data yet, or JPL Horizons data is unreachable right now.',
    )
  })
})
