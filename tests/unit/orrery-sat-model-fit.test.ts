import { Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { craftModelPx, PX_CEILING } from '@/components/orrery/three/pxClamp'
import {
  SAT_MODEL_OFFSCREEN_PX,
  satFacing,
  satModelPx,
  satRingPx,
  SceneModelCache,
  sunOnScreen,
} from '@/components/orrery/three/satModelFit'
import { modelForSatellite, sceneModel } from '@/lib/orrery/modelDescriptor'

describe('satFacing (#194)', () => {
  const earth = new Vector3(10, 0, 0)
  const sun = new Vector3(0, 0, 1000)
  const sat = new Vector3(13, 4, 0)

  it('earth attitude is nadir: from the satellite to the middle of Earth', () => {
    const d = satFacing('earth', sat, earth, sun)
    expect(d.length()).toBeCloseTo(1)
    expect(d.x).toBeCloseTo(-0.6)
    expect(d.y).toBeCloseTo(-0.8)
  })

  it('sun attitude points from the satellite at the Sun', () => {
    const d = satFacing('sun', sat, earth, sun)
    expect(d.z).toBeGreaterThan(0.99)
  })

  it('ecliptic north is scene +Y', () => {
    expect(satFacing('ecliptic-north', sat, earth, sun).toArray()).toEqual([0, 1, 0])
  })

  it('a satellite at the target gives a unit vector, not NaN', () => {
    const d = satFacing('earth', earth, earth, sun)
    expect(d.length()).toBeCloseTo(1)
  })
})

describe('satModelPx (#194, ADR 0030)', () => {
  const base = { earthPx: 300, markerPx: 4, sunPx: 10, sunVisible: true }

  it('with the Sun on screen is the focused craft model size: 0.9 of the Sun, 9 px at its floor', () => {
    expect(satModelPx(base)).toBe(craftModelPx(10))
    expect(satModelPx(base)).toBe(9)
    expect(satModelPx({ ...base, sunPx: 20 })).toBe(craftModelPx(20))
  })

  it('with the Sun on screen stays under it as drawn', () => {
    for (const sunPx of [10, 14, 40]) expect(satModelPx({ ...base, sunPx })).toBeLessThan(sunPx)
  })

  it('with the Sun off screen is 20 px radius (about 40 px across), whatever the Sun would draw', () => {
    expect(SAT_MODEL_OFFSCREEN_PX).toBe(20)
    expect(satModelPx({ ...base, sunVisible: false })).toBe(20)
    expect(satModelPx({ ...base, sunVisible: false, sunPx: Number.NaN })).toBe(20)
  })

  it('never swallows Earth: at most a quarter of its drawn radius, Sun on or off', () => {
    expect(satModelPx({ ...base, earthPx: 20 })).toBe(5)
    expect(satModelPx({ ...base, earthPx: 36 })).toBe(9)
    expect(satModelPx({ ...base, sunVisible: false, earthPx: 60 })).toBe(15)
    expect(satModelPx({ ...base, sunVisible: false, earthPx: 80 })).toBe(20)
  })

  it('is never smaller than the marker it replaces', () => {
    expect(satModelPx({ ...base, earthPx: 4 })).toBe(4)
    expect(satModelPx({ ...base, sunVisible: false, earthPx: 4, markerPx: 6 })).toBe(6)
  })

  it('takes a Sun that is not a number as the craft model floor when it counts as visible', () => {
    expect(satModelPx({ ...base, sunPx: Number.NaN })).toBe(9)
  })
})

describe('satRingPx (#194)', () => {
  it('is the usual ring when no model is drawn', () => {
    expect(satRingPx({ modelPx: null, sunPx: 10, sunVisible: true })).toBe(PX_CEILING.satSelect)
  })

  it('with the Sun on screen stands outside a model, under the Sun', () => {
    const ring = satRingPx({ modelPx: 9, sunPx: 10, sunVisible: true })
    expect(ring).toBeGreaterThan(9)
    expect(ring).toBeLessThan(10)
  })

  it('never shrinks below the usual ring for a small model', () => {
    expect(satRingPx({ modelPx: 4, sunPx: 10, sunVisible: true })).toBe(PX_CEILING.satSelect)
  })

  it('grows with a model in a bigger Sun, 1.25 of it', () => {
    expect(satRingPx({ modelPx: 18, sunPx: 40, sunVisible: true })).toBeCloseTo(22.5)
  })

  it('with the Sun off screen clears the model by 1.25 whatever the Sun would draw', () => {
    expect(satRingPx({ modelPx: 20, sunPx: 10, sunVisible: false })).toBeCloseTo(25)
  })
})

describe('sunOnScreen (#194, ADR 0030)', () => {
  const view = { width: 1440, height: 900, sunPx: 10 }
  const centre = { x: 0, y: 0, z: 0.5 }

  it('is on when the Sun is inside the view', () => {
    expect(sunOnScreen({ ...view, ...centre, wasOn: false })).toBe(true)
  })

  it('is off when the Sun is behind the camera, wherever it projects', () => {
    expect(sunOnScreen({ ...view, ...centre, z: 1.2, wasOn: false })).toBe(false)
    expect(sunOnScreen({ ...view, ...centre, z: 1.2, wasOn: true })).toBe(false)
  })

  it('is off when the Sun is well past an edge', () => {
    expect(sunOnScreen({ ...view, x: 1.5, y: 0, z: 0.5, wasOn: false })).toBe(false)
    expect(sunOnScreen({ ...view, x: 0, y: -1.6, z: 0.5, wasOn: false })).toBe(false)
  })

  it('counts a Sun whose disc reaches into the view, though its centre is outside', () => {
    // 5 px outside the right edge, radius 10: the disc is 5 px inside.
    const x = 1 + 5 / 720
    expect(sunOnScreen({ ...view, x, y: 0, z: 0.5, wasOn: false })).toBe(true)
  })

  it('keeps hysteresis: once on it stays on a little past the edge, once off it waits', () => {
    // 30 px outside the right edge, disc radius 10: 20 px clear of the view.
    const x = 1 + 30 / 720
    expect(sunOnScreen({ ...view, x, y: 0, z: 0.5, wasOn: false })).toBe(false)
    expect(sunOnScreen({ ...view, x, y: 0, z: 0.5, wasOn: true })).toBe(true)
    // 200 px outside: gone either way.
    expect(sunOnScreen({ ...view, x: 1 + 200 / 720, y: 0, z: 0.5, wasOn: true })).toBe(false)
  })
})

describe('sceneModel (#194, ADR 0030)', () => {
  it('draws a satellite that has a model of its own', () => {
    expect(sceneModel(modelForSatellite('25544', null))?.scope).toBe('own')
  })

  it('leaves a satellite with only a family stand-in as its dot', () => {
    expect(modelForSatellite('43000', 'generic-bus')?.scope).toBe('family')
    expect(sceneModel(modelForSatellite('43000', 'generic-bus'))).toBeUndefined()
    expect(sceneModel(modelForSatellite('43037', 'cubesat'))).toBeUndefined()
  })

  it('has nothing to draw for no model', () => {
    expect(sceneModel(undefined)).toBeUndefined()
  })
})

describe('SceneModelCache (#194)', () => {
  const field = {}
  const model = modelForSatellite('25544', null)

  it('looks a satellite up once while the choice and the field stay the same', () => {
    const cache = new SceneModelCache()
    const compute = vi.fn(() => model)
    for (let i = 0; i < 5; i += 1) expect(cache.resolve('sat:25544', field, compute)).toBe(model)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('looks again when the choice moves', () => {
    const cache = new SceneModelCache()
    const compute = vi.fn(() => model)
    cache.resolve('sat:25544', field, compute)
    cache.resolve('sat:20580', field, compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('looks again when a new field of satellites arrives', () => {
    const cache = new SceneModelCache()
    const compute = vi.fn(() => model)
    cache.resolve('sat:25544', null, compute)
    cache.resolve('sat:25544', {}, compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('remembers that there is no model, too', () => {
    const cache = new SceneModelCache()
    const compute = vi.fn(() => undefined)
    cache.resolve('sat:44000', field, compute)
    expect(cache.resolve('sat:44000', field, compute)).toBeUndefined()
    expect(compute).toHaveBeenCalledTimes(1)
  })
})
