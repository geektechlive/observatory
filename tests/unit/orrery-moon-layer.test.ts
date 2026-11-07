/**
 * Moons in the orrery's scene (#107): when they show, where they sit around the planet as
 * drawn (outside its sphere, and outside Saturn's rings), and that a moon with no data
 * for the date is hidden, never extrapolated.
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import {
  MOON_SHOW_PX,
  moonClearance,
  MoonLayer,
  moonsShown,
} from '@/components/orrery/three/moonLayer'
import { earthFrameRadii } from '@/lib/orrery/earthFrame'
import type { PlanetName } from '@/lib/orrery/elements'
import { type MoonBody } from '@/lib/orrery/moonState'
import { AU_KM } from '@/lib/orrery/units'

/** A moon on a 2-day circle around its planet, with data for jd in [0, 10]. */
function moon(name: string, parent: PlanetName, km: number): MoonBody {
  const r = km / AU_KM
  const w = Math.PI // rad/day: a 2-day period
  return {
    key: `naif:${name}`,
    name,
    parent,
    periodDays: 2,
    semiMajorAxisKm: km,
    center: 'test',
    target: null,
    spans: [{ start: 0, step: 1, samples: new Array(11 * 6).fill(0) }],
    relative: (jd) =>
      jd >= 0 && jd <= 10
        ? {
            position: { x: r * Math.cos(w * jd), y: r * Math.sin(w * jd), z: 0 },
            velocity: { x: -r * w * Math.sin(w * jd), y: r * w * Math.cos(w * jd), z: 0 },
            resolution: 'fine',
          }
        : null,
  }
}

/** A moon's orbit line in scene space: its local points through its position and scale. */
function linePoints(layer: MoonLayer, key: string): Vector3[] {
  const line = layer.orbitLine(key)
  if (!line) return []
  const pos = line.geometry.getAttribute('position')
  const out: Vector3[] = []
  for (let i = 0; i < pos.count; i += 1) {
    out.push(
      new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
        .multiplyScalar(line.scale.x)
        .add(line.position),
    )
  }
  return out
}

const PARENTS: Partial<Record<PlanetName, Vector3>> = {
  Jupiter: new Vector3(10, 0, 0),
  Saturn: new Vector3(20, 0, 0),
  Earth: new Vector3(3, 0, 0),
}
const parentAt = (radius: number, radiusPx: number) => (name: PlanetName) => {
  const position = PARENTS[name]
  return position ? { position, radius, radiusPx } : null
}

describe('moonsShown', () => {
  it('shows a planet’s moons when the planet is focused, at any size', () => {
    expect(moonsShown('Jupiter', 'Jupiter', 2)).toBe(true)
  })

  it('with no planet focused, shows them once the planet is in view and drawn large', () => {
    expect(moonsShown('Jupiter', null, MOON_SHOW_PX)).toBe(true)
    expect(moonsShown('Jupiter', 'Sun', MOON_SHOW_PX + 5)).toBe(true)
    expect(moonsShown('Jupiter', 'naif:-31', MOON_SHOW_PX + 5)).toBe(true)
  })

  it('hides them for a small planet nobody focused (zoomed out)', () => {
    expect(moonsShown('Jupiter', null, MOON_SHOW_PX - 1)).toBe(false)
  })

  it('hides them for a big planet out of view', () => {
    expect(moonsShown('Jupiter', null, MOON_SHOW_PX + 20, false)).toBe(false)
  })

  // Measured on the 1440 px stage: focusing Mars draws Jupiter at 42 px and Earth at 41,
  // because the radii are exaggerated against compressed distances. Only Mars's moons.
  it('with another planet focused, shows only that planet’s moons, however big this one is', () => {
    expect(moonsShown('Jupiter', 'Mars', 42)).toBe(false)
    expect(moonsShown('Earth', 'Mars', 41)).toBe(false)
    expect(moonsShown('Mars', 'Mars', 40)).toBe(true)
  })

  it('stays above what zoomed-out presets draw (Sun preset: Jupiter 26 px at most)', () => {
    expect(MOON_SHOW_PX).toBeGreaterThan(26)
    expect(MOON_SHOW_PX).toBeLessThanOrEqual(42)
  })
})

describe('moonClearance', () => {
  it('keeps Saturn’s moons outside its rings, and the others outside the sphere', () => {
    expect(moonClearance('Saturn')).toBeGreaterThan(2.2)
    expect(moonClearance('Jupiter')).toBe(1)
    expect(moonClearance('Earth')).toBe(1)
  })
})

describe('MoonLayer', () => {
  const io = moon('Io', 'Jupiter', 422_000)
  const enceladus = moon('Enceladus', 'Saturn', 238_040)
  const luna = moon('Moon', 'Earth', 384_400)

  it('places each moon outside its planet as drawn, and outside Saturn’s rings', () => {
    const layer = new MoonLayer()
    layer.setMoons([io, enceladus, luna])
    layer.place(5, parentAt(0.5, 40), null)
    const at = (key: string, parent: Vector3) =>
      (layer.position(key)?.distanceTo(parent) ?? 0) / 0.5
    expect(at('naif:Io', PARENTS.Jupiter ?? new Vector3())).toBeGreaterThan(1.2)
    expect(at('naif:Moon', PARENTS.Earth ?? new Vector3())).toBeGreaterThan(1.2)
    expect(at('naif:Enceladus', PARENTS.Saturn ?? new Vector3())).toBeGreaterThan(
      moonClearance('Saturn'),
    )
    expect(
      layer
        .visible()
        .map((m) => m.key)
        .sort(),
    ).toEqual(['naif:Enceladus', 'naif:Io', 'naif:Moon'])
    expect(layer.parentOf('naif:Io')).toBe('Jupiter')
  })

  // One scale for Earth's neighbourhood (#92): the Moon, the L1/L2 craft and the close
  // approaches all use the Earth frame, so on screen they keep their true order.
  it("puts Earth's Moon in the Earth frame, its loop included", () => {
    const layer = new MoonLayer()
    layer.setMoons([luna])
    layer.place(5, parentAt(0.5, 40), 'Earth')
    const earth = PARENTS.Earth ?? new Vector3()
    expect(layer.position('naif:Moon')?.distanceTo(earth)).toBeCloseTo(
      0.5 * earthFrameRadii(384_400),
      6,
    )
    for (const p of linePoints(layer, 'naif:Moon')) {
      expect(p.distanceTo(earth)).toBeCloseTo(0.5 * earthFrameRadii(384_400), 3)
    }
  })

  it('draws a moon smaller than its planet', () => {
    const layer = new MoonLayer()
    layer.setMoons([io])
    layer.place(5, parentAt(0.5, 40), null)
    const m = layer.visible()[0]
    expect(m?.mesh.scale.x).toBeLessThan(0.5)
    expect(m?.mesh.scale.x).toBeGreaterThan(0)
  })

  it('hides moons of a small, unfocused planet, and shows them once it is focused', () => {
    const layer = new MoonLayer()
    layer.setMoons([io, luna])
    layer.place(5, parentAt(0.05, 4), null)
    expect(layer.visible()).toEqual([])
    layer.place(5, parentAt(0.05, 4), 'Jupiter')
    expect(layer.visible().map((m) => m.key)).toEqual(['naif:Io'])
  })

  it('hides a moon outside its data window: never extrapolated', () => {
    const layer = new MoonLayer()
    layer.setMoons([io])
    layer.place(50, parentAt(0.5, 40), 'Jupiter')
    expect(layer.visible()).toEqual([])
    expect(layer.position('naif:Io')).toBeNull()
  })

  it('reuses meshes across payloads and drops moons that left', () => {
    const layer = new MoonLayer()
    layer.setMoons([io, luna])
    const first = layer.group.children.length
    layer.setMoons([io])
    expect(layer.group.children.length).toBe(first - 1)
    expect(layer.has('naif:Moon')).toBe(false)
    expect(layer.orbits.children.length).toBe(1)
  })
})

describe('MoonLayer orbit lines (#107)', () => {
  const io = moon('Io', 'Jupiter', 422_000)
  const enceladus = moon('Enceladus', 'Saturn', 238_040)
  const luna = moon('Moon', 'Earth', 384_400)

  it('draws each moon’s loop through the moon itself', () => {
    const layer = new MoonLayer()
    layer.setMoons([io, enceladus, luna])
    for (const jd of [1.3, 4.71, 9.9]) {
      layer.place(jd, parentAt(0.5, 40), null)
      for (const key of ['naif:Io', 'naif:Enceladus', 'naif:Moon']) {
        const at = layer.position(key)
        const loop = linePoints(layer, key)
        expect(loop.length, key).toBeGreaterThan(60)
        const nearest = Math.min(...loop.map((p) => p.distanceTo(at ?? new Vector3())))
        expect(nearest, `${key} at ${String(jd)}`).toBeLessThan(0.5 * 1e-4)
      }
    }
  })

  it('keeps Saturn’s moon loops outside its rings', () => {
    const layer = new MoonLayer()
    layer.setMoons([enceladus])
    layer.place(3, parentAt(0.5, 40), 'Saturn')
    const saturn = PARENTS.Saturn ?? new Vector3()
    for (const p of linePoints(layer, 'naif:Enceladus')) {
      expect(p.distanceTo(saturn) / 0.5).toBeGreaterThan(moonClearance('Saturn'))
    }
  })

  it('shows a loop only while its moon shows, and only with the Orbits switch', () => {
    const layer = new MoonLayer()
    layer.setMoons([io])
    layer.place(3, parentAt(0.05, 4), null)
    expect(layer.orbitLine('naif:Io')?.visible).toBe(false)
    layer.place(3, parentAt(0.5, 40), null)
    expect(layer.orbitLine('naif:Io')?.visible).toBe(true)
    layer.place(50, parentAt(0.5, 40), 'Jupiter')
    expect(layer.orbitLine('naif:Io')?.visible).toBe(false)
    layer.setOrbitsVisible(false)
    expect(layer.orbits.visible).toBe(false)
  })

  it('updates the loop in place as the date moves: no new geometry', () => {
    const layer = new MoonLayer()
    layer.setMoons([io])
    layer.place(1, parentAt(0.5, 40), null)
    const geometry = layer.orbitLine('naif:Io')?.geometry
    for (let jd = 1; jd < 9; jd += 0.37) layer.place(jd, parentAt(0.5, 40), null)
    expect(layer.orbitLine('naif:Io')?.geometry).toBe(geometry)
  })

  it('says how each loop was made', () => {
    const layer = new MoonLayer()
    layer.setMoons([io])
    layer.place(3, parentAt(0.5, 40), null)
    expect(layer.orbitKind('naif:Io')).toBe('sampled')
  })
})
