/**
 * The orrery's moons as drawable bodies (#107): the planet-centred Horizons moons, plus
 * Earth's Moon, which the payload carries heliocentric beside Earth. Fixtures are real
 * Horizons answers (2026-11-05..07, 12 h steps).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseHorizonsVectors } from '@/lib/horizons'
import { moonBodies, moonCoverage, moonRelative } from '@/lib/orrery/moonState'
import { AU_KM } from '@/lib/orrery/units'
import type { OrreryMoon, OrreryTrack } from '@/schemas/orreryBodies'

const fine = (name: string, step: number) => {
  const s =
    parseHorizonsVectors(
      readFileSync(join(__dirname, 'fixtures', 'horizons', `${name}.txt`), 'utf8'),
    )?.samples ?? []
  return {
    start: s[0]?.jd ?? 0,
    step,
    samples: s.flatMap((x) => [x.x, x.y, x.z, x.vx, x.vy, x.vz]),
  }
}

const track = (name: string, naifId: string, category: OrreryTrack['category']): OrreryTrack => ({
  id: `naif:${naifId}`,
  naifId,
  name,
  mission: 'test',
  category,
  group: category === 'moon' ? 'moon' : 'planet',
  target: `${name} (${naifId})`,
  observedUntil: null,
  availableFrom: null,
  availableTo: null,
  fine: fine(name.toLowerCase(), 0.5),
  coarse: null,
})

const io: OrreryMoon = {
  id: 'naif:501',
  naifId: '501',
  name: 'Io',
  parent: { naifId: '599', name: 'Jupiter' },
  center: '500@599',
  target: 'Io (501)',
  periodDays: 1.77,
  semiMajorAxisKm: 422_000,
  fine: fine('io', 1 / 16),
}

const TRACKS = [track('Earth', '399', 'planet'), track('Moon', '301', 'moon')]
const JD = 2461350.25 // between samples, inside both fixtures

describe('moonBodies', () => {
  it('lists the Horizons moons and Earth’s Moon, each with its planet', () => {
    const bodies = moonBodies([io], TRACKS)
    expect(bodies.map((b) => [b.key, b.name, b.parent])).toEqual([
      ['naif:301', 'Moon', 'Earth'],
      ['naif:501', 'Io', 'Jupiter'],
    ])
    const moon = bodies[0]
    expect(moon?.periodDays).toBe(27.321582)
    expect(moon?.semiMajorAxisKm).toBe(384_400)
    expect(moon?.center).toMatch(/Moon minus Earth/)
  })

  it('leaves Earth’s Moon out when the payload lacks Earth or the Moon', () => {
    expect(moonBodies([io], [track('Moon', '301', 'moon')]).map((b) => b.name)).toEqual(['Io'])
  })

  it('drops a moon whose planet the orrery does not draw', () => {
    const charon = {
      ...io,
      id: 'naif:901',
      naifId: '901',
      name: 'Charon',
      parent: { naifId: '999', name: 'Pluto' },
    }
    expect(moonBodies([charon], [])).toEqual([])
  })
})

describe('moonRelative', () => {
  it('gives Earth’s Moon geocentric: Moon minus Earth, at lunar distance', () => {
    const moon = moonBodies([], TRACKS)[0]
    if (!moon) throw new Error('no moon')
    const rel = moonRelative(moon, JD)
    const km = Math.hypot(rel?.position.x ?? 0, rel?.position.y ?? 0, rel?.position.z ?? 0) * AU_KM
    expect(km).toBeGreaterThan(356_000)
    expect(km).toBeLessThan(407_000)
  })

  it('gives a Horizons moon its planet-centred state', () => {
    const body = moonBodies([io], [])[0]
    if (!body) throw new Error('no io')
    const rel = moonRelative(body, io.fine.start + 0.1)
    const km = Math.hypot(rel?.position.x ?? 0, rel?.position.y ?? 0, rel?.position.z ?? 0) * AU_KM
    expect(km).toBeGreaterThan(415_000)
    expect(km).toBeLessThan(430_000)
  })

  it('is null outside the sampled window: never extrapolated', () => {
    const [moon, ioBody] = moonBodies([io], TRACKS)
    if (!moon || !ioBody) throw new Error('missing')
    expect(moonRelative(moon, JD + 400)).toBeNull()
    expect(moonRelative(ioBody, io.fine.start - 1)).toBeNull()
  })

  it('states the covered dates for the inspector', () => {
    const ioBody = moonBodies([io], [])[0]
    if (!ioBody) throw new Error('no io')
    expect(moonCoverage(ioBody)).toMatch(/^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/)
  })
})
