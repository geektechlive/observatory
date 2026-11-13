/**
 * Charon in the orrery (#99 item 8 follow-up). It travels with the dwarf planets
 * (/api/orrery-dwarfs), as a fine Horizons span relative to the Pluto system's barycentre
 * (500@9), the point Pluto's marker stands for. Drawn only with the Dwarf planets switch
 * on, only where a sample covers the date (never extrapolated), and only when Pluto or
 * Charon is focused: at the scene's own scale it would sit inside Pluto's marker.
 *
 * Checked live 2026-11-12, one request at a time: '901' centred on '500@9' answers
 * "Charon (901)" (plu060), covering 1800-01-03 to 2199-12-29 TDB; asking that whole span
 * at the moons' 6 h step is refused ("Output length exceeded ... max. is 90000").
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { SmallBodyLayer } from '@/components/orrery/three/smallBodyLayer'
import { CHARON, CHARON_KEY, isDwarfFocus } from '@/lib/orrery/dwarfs'
import {
  dwarfEntries,
  dwarfMoonFacts,
  dwarfMoonShown,
  dwarfNotice,
  entryPath,
  entryState,
} from '@/lib/orrery/dwarfView'
import { toScaleMoonPosition } from '@/lib/orrery/moonPlacement'
import { place3d } from '@/lib/orrery/scale'
import { lookupTwinKey } from '@/lib/orrery/smallBodyView'
import { AU_KM } from '@/lib/orrery/units'
import { type OrreryDwarfs, OrreryDwarfsSchema } from '@/schemas/orreryDwarfs'

const DAY_MS = 86_400_000
const jdOf = (ms: number) => ms / DAY_MS + 2440587.5
const toScene = (p: { x: number; y: number; z: number }) => {
  const v = place3d(p)
  return new Vector3(v.x, v.y, v.z)
}

/** Pluto's barycentre, 2000 to 2050, about 35 au out. */
const plutoSpan = () => {
  const samples: number[] = []
  for (let k = 0; k < 11; k += 1) samples.push(35 - k * 0.1, 10, 1)
  return { start: 2451544.5, step: 1826, samples }
}
/** Charon on a circle of 17,470 km around the barycentre, every 6 h for 30 days. */
const FINE_START = jdOf(Date.UTC(2026, 9, 28))
const R_AU = 17_470 / AU_KM
const W = (2 * Math.PI) / CHARON.periodDays
const charonSpan = () => {
  const samples: number[] = []
  for (let k = 0; k <= 120; k += 1) {
    const a = W * k * 0.25
    samples.push(R_AU * Math.cos(a), 0, R_AU * Math.sin(a))
    samples.push(-R_AU * W * Math.sin(a), 0, R_AU * W * Math.cos(a))
  }
  return { start: FINE_START, step: 0.25, samples }
}
const pluto = {
  id: 'sb:20134340',
  spkid: '20134340',
  name: 'Pluto',
  target: 'Pluto Barycenter (9)',
  availableFrom: null,
  availableTo: null,
  coarse: plutoSpan(),
}
const charon = {
  id: 'naif:901',
  naifId: '901',
  name: 'Charon',
  parentSpkid: '20134340',
  center: '500@9',
  target: 'Charon (901)',
  fine: charonSpan(),
}
const payload = { dwarfs: [pluto], charon } as unknown as OrreryDwarfs
const entries = dwarfEntries(payload)
const charonEntry = () => {
  const e = entries.find((x) => x.key === CHARON_KEY)
  if (e?.kind !== 'moon') throw new Error('no Charon')
  return e
}
const INSIDE = FINE_START + 10
const OUTSIDE = FINE_START + 365

describe('Charon: what is asked and how it is keyed', () => {
  it('is asked as 901 from the Pluto barycentre, its target asserted exactly', () => {
    expect([CHARON.command, CHARON.center, CHARON.target]).toEqual(['901', '9', 'Charon (901)'])
    expect(CHARON.parentSpkid).toBe('20134340')
    expect([CHARON.ephemerisFrom, CHARON.ephemerisTo]).toEqual(['1800-01-03', '2199-12-29'])
  })

  it('has its own link key, which needs the dwarf data, by key or by name', () => {
    expect(CHARON_KEY).toBe('sbc:901')
    expect(isDwarfFocus('sbc:901')).toBe(true)
    expect(isDwarfFocus('charon')).toBe(true)
    expect(isDwarfFocus('Charon')).toBe(true)
  })

  it('never collides with asteroid 901 Brunsia looked up at JPL (SPK-ID 20000901)', () => {
    expect(lookupTwinKey('lookup:20000901')).toBe('sbc:20000901')
    expect(lookupTwinKey('lookup:20000901')).not.toBe(CHARON_KEY)
  })
})

describe('the payload', () => {
  it('reads a copy written before Charon as having none', () => {
    const old = {
      generatedAt: '2026-11-12T00:00:00Z',
      coarseFetchedAt: '2026-11-12T00:00:00Z',
      frame: 'ecliptic-J2000',
      center: 'Sun',
      timeScale: 'TDB',
      units: { position: 'au' },
      sourceType: 'ephemeris',
      provider: 'jpl-horizons',
      dwarfs: [pluto],
      missing: [],
    }
    expect(OrreryDwarfsSchema.parse(old).charon).toBeNull()
    expect(OrreryDwarfsSchema.parse({ ...old, charon }).charon?.target).toBe('Charon (901)')
  })

  it('makes Charon an entry in the dwarf group, after Pluto, only when Pluto is there', () => {
    expect(entries.map((e) => [e.key, e.label, e.group])).toEqual([
      ['sbc:20134340', 'Pluto', 'dwarfs'],
      ['sbc:901', 'Charon', 'dwarfs'],
    ])
    expect(dwarfEntries({ dwarfs: [], charon } as unknown as OrreryDwarfs)).toEqual([])
    expect(dwarfEntries({ dwarfs: [pluto] } as unknown as OrreryDwarfs)).toHaveLength(1)
  })
})

describe("Charon's position: from its samples only", () => {
  it("is Pluto's barycentre plus Charon's own vector inside its samples", () => {
    const e = charonEntry()
    const p = entryState(e, INSIDE)?.position
    const bary = entryState(e.parent, INSIDE)?.position
    if (!p || !bary) throw new Error('no state')
    const d = Math.hypot(p.x - bary.x, p.y - bary.y, p.z - bary.z) * AU_KM
    expect(d).toBeCloseTo(17_470, -1)
  })

  it('is hidden outside them, though Pluto is not', () => {
    const e = charonEntry()
    expect(entryState(e, OUTSIDE)).toBeNull()
    expect(entryState(e.parent, OUTSIDE)).not.toBeNull()
  })

  it('draws no line of its own', () => {
    expect(entryPath(charonEntry()).points).toEqual([])
  })
})

describe('the notice', () => {
  it('names Charon outside its samples with Pluto or Charon chosen, with their days and JPL’s window', () => {
    expect(dwarfNotice(entries, INSIDE, 'sbc:20134340')).toBeNull()
    for (const focus of ['sbc:20134340', CHARON_KEY]) {
      const text = dwarfNotice(entries, OUTSIDE, focus) ?? ''
      expect(text).toMatch(/Charon is hidden/)
      expect(text).toMatch(/2026-10-28 to 2026-11-27/)
      expect(text).toMatch(/1800 to 2199/)
    }
  })

  it('says nothing of Charon when neither Pluto nor Charon is chosen: it would not show anyway', () => {
    expect(dwarfNotice(entries, OUTSIDE, null)).toBeNull()
    expect(dwarfNotice(entries, OUTSIDE, 'Neptune')).toBeNull()
  })
})

describe('the inspector facts', () => {
  it('give the distance from the barycentre, the span, the window and the scale', () => {
    const f = dwarfMoonFacts(charonEntry(), (INSIDE - 2440587.5) * DAY_MS)
    expect(f.fromBarycentreKm).toBeCloseTo(17_470, -1)
    expect(f.samples).toBe('2026-10-28 to 2026-11-27')
    expect(f.ephemeris).toBe('1800 to 2199')
    expect(f.target).toBe('Charon (901)')
    expect(dwarfMoonFacts(charonEntry(), (OUTSIDE - 2440587.5) * DAY_MS).fromBarycentreKm).toBe(
      null,
    )
  })
})

describe('toScaleMoonPosition', () => {
  it("puts a moon at its true distance in its planet's radii as drawn, in place3d's axes", () => {
    const rel = { x: R_AU, y: 0, z: 0 }
    const p = toScaleMoonPosition({ x: 1, y: 2, z: 3 }, rel, 0.5, 1188.3)
    expect(p.x - 1).toBeCloseTo((17_470 / 1188.3) * 0.5, 6)
    expect(p.y).toBe(2)
    expect(p.z).toBe(3)
    // Ecliptic y is scene -z, ecliptic z is scene y.
    const q = toScaleMoonPosition({ x: 0, y: 0, z: 0 }, { x: 0, y: R_AU, z: R_AU }, 1, 1188.3)
    expect(q.z).toBeCloseTo(-17_470 / 1188.3, 6)
    expect(q.y).toBeCloseTo(17_470 / 1188.3, 6)
  })
})

describe('dwarfMoonShown', () => {
  it('is true only with Pluto or Charon focused', () => {
    const e = charonEntry()
    expect(dwarfMoonShown(e, 'sbc:20134340')).toBe(true)
    expect(dwarfMoonShown(e, 'sbc:901')).toBe(true)
    expect(dwarfMoonShown(e, null)).toBe(false)
    expect(dwarfMoonShown(e, 'Neptune')).toBe(false)
    expect(dwarfMoonShown(e, 'sbc:20136199')).toBe(false)
  })
})

describe('SmallBodyLayer with Charon', () => {
  const ON = { comets: false, interstellar: false, asteroids: false, dwarfs: true }
  function layer() {
    const l = new SmallBodyLayer()
    l.set(entries)
    l.setGroups(ON)
    return l
  }

  it('hides Charon until Pluto or Charon is focused', () => {
    const l = layer()
    l.place(INSIDE, toScene, 'exaggerated')
    l.placeMoons(null)
    expect(l.drawn('sbc:20134340')).toBe(true)
    expect(l.drawn(CHARON_KEY)).toBe(false)
    l.placeMoons('sbc:20134340')
    expect(l.drawn(CHARON_KEY)).toBe(true)
    expect(l.moonMeshes()).toHaveLength(1)
    l.dispose()
  })

  it("places Charon to Pluto's own scale around Pluto's marker as drawn", () => {
    const l = layer()
    l.place(INSIDE, toScene, 'exaggerated')
    l.placeMoons(CHARON_KEY)
    const plutoMesh = l.visible().find((v) => v.key === 'sbc:20134340')?.mesh
    const charonMesh = l.moonMeshes()[0]
    if (!plutoMesh || !charonMesh) throw new Error('not drawn')
    const r = plutoMesh.scale.x
    const d = charonMesh.position.distanceTo(plutoMesh.position)
    expect(d / r).toBeCloseTo(17_470 / CHARON.parentRadiusKm, 1)
    expect(charonMesh.scale.x / r).toBeCloseTo(CHARON.radiusKm / CHARON.parentRadiusKm, 6)
    l.dispose()
  })

  it('leaves a wide gap between the two markers at both ends of the dwarf px clamp', () => {
    // Pluto drawn at 4 px and at 6 px (DWARF_MIN_PX, PX_CEILING.dwarf), 1 unit = 1 px.
    for (const px of [4, 6]) {
      const centre = (17_470 / CHARON.parentRadiusKm) * px
      const charonPx = Math.min(5, Math.max(3, (px * CHARON.radiusKm) / CHARON.parentRadiusKm))
      expect(centre - px - charonPx).toBeGreaterThan(40)
    }
  })

  it("frames the barycentre for Charon's focus, and has none outside its samples", () => {
    const l = layer()
    l.place(INSIDE, toScene, 'exaggerated')
    l.placeMoons(null)
    expect(l.position(CHARON_KEY)?.toArray()).toEqual(l.position('sbc:20134340')?.toArray())
    l.place(OUTSIDE, toScene, 'exaggerated')
    l.placeMoons(CHARON_KEY)
    expect(l.drawn(CHARON_KEY)).toBe(false)
    expect(l.position(CHARON_KEY)).toBeNull()
    l.dispose()
  })

  it('draws nothing of Charon with the switch off', () => {
    const l = layer()
    l.setGroups({ ...ON, dwarfs: false })
    l.place(INSIDE, toScene, 'exaggerated')
    l.placeMoons('sbc:20134340')
    expect(l.drawn(CHARON_KEY)).toBe(false)
    expect(l.position(CHARON_KEY)).toBeNull()
    expect(l.counts()).toEqual({ drawn: 0, paths: 0 })
    l.dispose()
  })
})
