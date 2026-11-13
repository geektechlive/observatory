/**
 * Comets and the interstellar objects (#99): one marker each on its Horizons samples
 * (hidden where none cover the date, never extrapolated), each line through the scene's
 * scale, and a switch per group.
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { SmallBodyLayer } from '@/components/orrery/three/smallBodyLayer'
import { dwarfEntries } from '@/lib/orrery/dwarfView'
import { place3d } from '@/lib/orrery/scale'
import { type SmallBodyEntry, smallBodyPath, smallBodyState } from '@/lib/orrery/smallBodyView'
import type { OrreryDwarfs } from '@/schemas/orreryDwarfs'
import type { OrrerySmallBody } from '@/schemas/orrerySmallBodies'

const toScene = (p: { x: number; y: number; z: number }) => {
  const v = place3d(p)
  return new Vector3(v.x, v.y, v.z)
}
const linear = (p: { x: number; y: number; z: number }) =>
  new Vector3(p.x * 10, p.z * 10, -p.y * 10)

const START = 2461326.5
function fine(n: number) {
  const samples: number[] = []
  for (let k = 0; k < n; k += 1) samples.push(2 + 0.01 * k, 0.5, 0, 0.01, 0, 0)
  return { start: START, step: 1, samples }
}
/** 1,300 positions: more than any fixed line buffer a layer might start with. */
function coarse(n: number) {
  const samples: number[] = []
  for (let k = 0; k < n; k += 1) samples.push(-5 + 0.01 * k, 1, 0.1)
  return { start: START - 3000, step: 5, samples }
}

const comet: OrrerySmallBody = {
  id: 'sb:1004119',
  spkid: '1004119',
  des: 'C/2026 A2',
  name: 'C/2026 A2 (Bok)',
  kind: 'comet',
  interstellar: false,
  discovered: null,
  magnitude: 13.8,
  m1: 10,
  k1: 10,
  h: null,
  elements: { epochJd: START, e: 0.9976, q: 1.94, tp: START, om: 120, w: 40, i: 60 },
  elementsSource: 'horizons',
  vInfKms: null,
  solution: null,
  target: null,
  availableFrom: null,
  availableTo: null,
  fine: fine(61),
  coarse: null,
}
const visitor: OrrerySmallBody = {
  ...comet,
  id: 'sb:1004083',
  spkid: '1004083',
  name: '3I/ATLAS',
  interstellar: true,
  vInfKms: 58,
  elements: { ...comet.elements, e: 6.12, q: 1.35 },
  coarse: coarse(1300),
}
const entries: SmallBodyEntry[] = [
  { key: comet.id, label: comet.name, group: 'comets', body: comet },
  { key: visitor.id, label: visitor.name, group: 'interstellar', body: visitor },
]
const BOTH = { comets: true, interstellar: true, asteroids: false, dwarfs: false }

function layer() {
  const l = new SmallBodyLayer()
  l.set(entries)
  l.setGroups(BOTH)
  return l
}

describe('SmallBodyLayer (#99)', () => {
  it('places each marker on its samples, through the scene scale', () => {
    const l = layer()
    l.place(START + 10, toScene, 'exaggerated')
    const want = toScene(smallBodyState(comet, START + 10)?.position ?? { x: 0, y: 0, z: 0 })
    expect(l.position(comet.id)?.distanceTo(want)).toBeLessThan(1e-9)
    expect(l.visible().map((v) => v.key)).toEqual([comet.id, visitor.id])
  })

  it('hides a marker and its line where no sample covers the date', () => {
    const l = layer()
    l.place(START + 200, toScene, 'exaggerated')
    expect(l.position(comet.id)).toBeNull()
    // The interstellar object's coarse span still covers it.
    expect(l.position(visitor.id)).not.toBeNull()
    expect(l.counts()).toEqual({ drawn: 1, paths: 1 })
  })

  it("draws a comet's orbit line from its elements and an interstellar path in full", () => {
    const l = layer()
    l.place(START + 10, toScene, 'exaggerated')
    expect(l.pathPoints(comet.id)).toBe(smallBodyPath(comet).points.length)
    // Every coarse position, however many: no fixed buffer cuts it short.
    expect(l.pathPoints(visitor.id)).toBe(1300)
  })

  it('switches each group on and off', () => {
    const l = layer()
    l.setGroups({ comets: false, interstellar: true, asteroids: false, dwarfs: false })
    l.place(START + 10, toScene, 'exaggerated')
    expect(l.position(comet.id)).toBeNull()
    expect(l.pathPoints(comet.id)).toBe(0)
    expect(l.counts()).toEqual({ drawn: 1, paths: 1 })
    expect(l.drawn(visitor.id)).toBe(true)
    expect(l.drawn(comet.id)).toBe(false)
    expect(l.groupOn(visitor.id)).toBe(true)
    expect(l.groupOn(comet.id)).toBe(false)
    expect(l.groupOn('sb:nope')).toBe(false)
  })

  it('starts with both groups off', () => {
    const l = new SmallBodyLayer()
    l.set(entries)
    l.place(START + 10, toScene, 'exaggerated')
    expect(l.counts()).toEqual({ drawn: 0, paths: 0 })
  })

  it('rebuilds the lines when the scale mode changes', () => {
    const l = layer()
    l.place(START + 10, toScene, 'exaggerated')
    const a = l.linePoint(visitor.id, 0)
    l.place(START + 10, linear, 'proportional')
    const b = l.linePoint(visitor.id, 0)
    expect(a && b && a.distanceTo(b)).toBeGreaterThan(0.1)
  })

  it('moves a marker into the Earth frame when that says so', () => {
    const l = layer()
    l.place(START + 10, toScene, 'exaggerated')
    l.placeNear((helio) => (helio.x > 1 ? new Vector3(9, 9, 9) : null))
    expect(l.position(comet.id)?.x).toBe(9)
    expect(l.helio(comet.id)?.x).toBeCloseTo(2.1, 6)
  })

  it('draws a dwarf planet as a third group: its marker on the span, its line always', () => {
    // A span from 2000 to 2050, so 1000 AD is outside it.
    const span = { start: 2451544.5, step: 1826, samples: [] as number[] }
    for (let k = 0; k < 11; k += 1) span.samples.push(2.7, 0.1 * k, 0)
    const ceres = dwarfEntries({
      dwarfs: [
        {
          id: 'sb:20000001',
          spkid: '20000001',
          name: 'Ceres',
          target: '1 Ceres (A801 AA)',
          availableFrom: null,
          availableTo: null,
          coarse: span,
        },
      ],
    } as unknown as OrreryDwarfs)
    const l = new SmallBodyLayer()
    l.set([...entries, ...ceres])
    l.setGroups({ comets: false, interstellar: false, asteroids: false, dwarfs: true })
    l.place(2451544.5 + 100, toScene, 'exaggerated')
    expect(l.drawn('sbc:20000001')).toBe(true)
    expect(l.visible().map((v) => [v.key, v.group])).toEqual([['sbc:20000001', 'dwarfs']])
    // The closed orbit from the elements: 360 points and back to the first.
    expect(l.pathPoints('sbc:20000001')).toBe(361)
    // 1000 AD: no marker, but the orbit line stays.
    l.place(2086302.5, toScene, 'exaggerated')
    expect(l.drawn('sbc:20000001')).toBe(false)
    expect(l.position('sbc:20000001')).toBeNull()
    expect(l.pathPoints('sbc:20000001')).toBe(361)
    expect(l.counts()).toEqual({ drawn: 0, paths: 1 })
    // Switched off: neither.
    l.setGroups({ comets: false, interstellar: false, asteroids: false, dwarfs: false })
    l.place(2451544.5 + 100, toScene, 'exaggerated')
    expect(l.counts()).toEqual({ drawn: 0, paths: 0 })
    l.dispose()
  })

  it('disposes the lines it drops when new data replaces the old', () => {
    const l = layer()
    l.place(START + 10, toScene, 'exaggerated')
    const before = l.paths.children.length
    l.set([entries[0] as SmallBodyEntry])
    expect(l.paths.children.length).toBe(before - 1)
    expect(l.markers.children.length).toBe(1)
    expect(l.has(visitor.id)).toBe(false)
    l.dispose()
    expect(l.paths.children.length).toBe(0)
  })
})
