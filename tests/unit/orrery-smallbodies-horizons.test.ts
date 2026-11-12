/**
 * The two-body solver against Horizons (#99 item 7, spec Part 17), on the real
 * /api/orrery-smallbodies payload, saved byte for byte from production on 2026-11-12
 * (fixtures/smallbodies/orrery-smallbodies-2026-11-12.json, 164,425 B; no JPL request
 * was made for it). Each object's elements are the osculating ones from its own Horizons
 * header; its samples are Horizons' vectors (heliocentric ecliptic J2000, TDB).
 *
 * Two-body motion drifts: the real path feels the planets and, for a comet, its own
 * outgassing. So each check holds only over a stated span around the elements' epoch,
 * with the bound about twice the worst miss measured on this payload, and a second
 * check shows the drift past a year is far beyond it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { type ConicElements, conicPosition } from '@/lib/orrery/conic'
import { INTERSTELLAR, targetMatchesSmallBody } from '@/lib/orrery/smallBodies'
import {
  type OrrerySmallBodies,
  OrrerySmallBodiesSchema,
  type OrrerySmallBody,
} from '@/schemas/orrerySmallBodies'

const KM_PER_AU = 149_597_870.7

const payload: OrrerySmallBodies = OrrerySmallBodiesSchema.parse(
  JSON.parse(
    readFileSync(
      join(__dirname, 'fixtures', 'smallbodies', 'orrery-smallbodies-2026-11-12.json'),
      'utf8',
    ),
  ),
)

interface Sample {
  /** Days from the elements' epoch. */
  readonly dt: number
  readonly jd: number
  readonly xyz: readonly [number, number, number]
}

/** Every Horizons sample of a body: fine (6 numbers a sample) and coarse (3). */
function samplesOf(body: OrrerySmallBody): Sample[] {
  const epoch = body.elements.epochJd
  if (epoch === null) throw new Error(`${body.name}: no epoch`)
  const out: Sample[] = []
  for (const [span, stride] of [
    [body.fine, 6],
    [body.coarse, 3],
  ] as const) {
    if (!span) continue
    for (let k = 0; k * stride < span.samples.length; k += 1) {
      const jd = span.start + k * span.step
      const at = (j: number) => span.samples[k * stride + j] ?? Number.NaN
      out.push({ dt: jd - epoch, jd, xyz: [at(0), at(1), at(2)] })
    }
  }
  return out
}

/** A span must have a sample within this many days of each end (the coarse step is ≤ 10). */
const END_SLACK_DAYS = 10

/**
 * The worst miss, km, of the two-body position over the samples from `from` to `to` days
 * after the epoch. Throws unless the samples really reach both ends, so a span can't be
 * claimed that the data doesn't cover.
 */
function worstMissKm(
  body: OrrerySmallBody,
  from: number,
  to: number,
  el: ConicElements = body.elements,
) {
  const near = samplesOf(body).filter((s) => s.dt >= from && s.dt <= to)
  const first = Math.min(...near.map((s) => s.dt))
  const last = Math.max(...near.map((s) => s.dt))
  if (near.length < 3 || first > from + END_SLACK_DAYS || last < to - END_SLACK_DAYS) {
    throw new Error(`${body.name}: samples cover ${String(first)} to ${String(last)} days only`)
  }
  let worst = 0
  for (const s of near) {
    const p = conicPosition(el, s.jd)
    const miss = Math.hypot(p.x - s.xyz[0], p.y - s.xyz[1], p.z - s.xyz[2]) * KM_PER_AU
    worst = Math.max(worst, miss)
  }
  return worst
}

const byName = (name: string) => {
  const body = [...payload.interstellar, ...payload.comets].find((b) => b.name === name)
  if (!body) throw new Error(`${name} not in the payload`)
  return body
}

describe('the saved payload', () => {
  it('is a whole, current answer', () => {
    expect(payload.generatedAt).toBe('2026-11-12T08:40:10.721Z')
    expect(payload.missing).toEqual([])
    expect(payload.interstellar).toHaveLength(3)
    expect(payload.comets.length).toBeGreaterThan(5)
  })
})

describe("each interstellar object's returned name and e > 1", () => {
  it.each(INTERSTELLAR.map((o, k) => [o.name, o, k] as const))('%s', (_name, wanted, k) => {
    const body = payload.interstellar[k]
    expect(body?.name).toBe(wanted.name)
    expect(body?.spkid).toBe(wanted.spkid)
    expect(body?.des).toBe(wanted.des)
    expect(body?.interstellar).toBe(true)
    // Horizons' own "Target body name" answers for the designation asked.
    expect(targetMatchesSmallBody(wanted.des, body?.target ?? null)).toBe(true)
    // Its elements come from that Horizons answer, and the orbit is unbound.
    expect(body?.elementsSource).toBe('horizons')
    expect(body?.elements.e).toBeGreaterThan(1)
    expect(body?.vInfKms).toBeGreaterThan(20)
  })

  it('names them as Horizons does', () => {
    expect(payload.interstellar.map((b) => b.target)).toEqual([
      "1I/'Oumuamua (A/2017 U1)",
      'Borisov (C/2019 Q4)',
      'ATLAS (C/2025 N1)',
    ])
  })
})

// [name, span from and to (days after the epoch), bound km, worst measured km here]
const CROSS_CHECKS = [
  // Epoch 2017-Nov-23, 75 days after a 0.26 au perihelion: the Sun bends it fast.
  ['1I/ʻOumuamua', -30, 30, 10_000, 5_697],
  // Epoch 2020-Jan-05, four weeks after perihelion.
  ['2I/Borisov', -60, 60, 2_500, 1_621],
  // Epoch 2026-Oct-27, a year after perihelion; its fine span sits on the epoch.
  ['3I/ATLAS', -60, 60, 5_000, 3_275],
  // A periodic comet (e = 0.32), epoch 2026-Oct-19: its whole fine span, -6 to +54 days.
  ['P/2026 T1 (ATLAS)', -6, 54, 2_500, 1_412],
] as const

describe('two-body positions from the osculating elements, against Horizons', () => {
  it.each(CROSS_CHECKS)(
    '%s stays within %d to %d days of its epoch to %d km',
    (name, from, to, boundKm, measuredKm) => {
      const miss = worstMissKm(byName(name), from, to)
      expect(miss).toBeLessThan(boundKm)
      // The bound is honest: it is not ten times what the data needs.
      expect(miss).toBeGreaterThan(measuredKm * 0.9)
    },
  )

  it.each(CROSS_CHECKS)(
    '%s: the check fails if perihelion is 14 minutes off',
    (name, from, to, boundKm) => {
      const body = byName(name)
      const shifted = { ...body.elements, tp: body.elements.tp + 0.01 }
      expect(worstMissKm(body, from, to, shifted)).toBeGreaterThan(boundKm)
    },
  )

  it.each(CROSS_CHECKS.slice(0, 3))(
    '%s drifts past 100,000 km within a year of its epoch, so the span matters',
    (name) => {
      expect(worstMissKm(byName(name), -365, 365)).toBeGreaterThan(100_000)
    },
  )

  it('refuses a span the samples do not cover', () => {
    expect(() => worstMissKm(byName('P/2026 T1 (ATLAS)'), -60, 60)).toThrow(/cover/)
  })

  it('P/2026 T1 is a periodic comet with its own Horizons name', () => {
    const comet = byName('P/2026 T1 (ATLAS)')
    expect(comet.interstellar).toBe(false)
    expect(comet.elements.e).toBeLessThan(1)
    expect(comet.target).toBe('ATLAS (P/2026 T1)')
    expect(targetMatchesSmallBody(comet.des, comet.target)).toBe(true)
  })
})
