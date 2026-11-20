/**
 * The fly-in inside the orrery (#268): the driver's phases, the model's true size, the camera
 * it places, and what a visitor's drag or a leave does, against a fake scene.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { FlyInDriver, type FlyInHost, MODEL_WAIT_MS } from '@/components/orrery/three/flyInDriver'
import { EASE_MS, FLIGHT_MS, LEAVE_EASE_MS, LEAVE_FLIGHT_MS } from '@/lib/orrery/flyInPath'
import type { Surroundings } from '@/lib/orrery/surroundings'
import { AU_KM } from '@/lib/orrery/units'

const K = 10
/** Parker 0.1 au from the Sun along +x, drawn (Big bodies) at 0.3 units. */
const HELIO = { x: 0.1, y: 0, z: 0 }
const DRAWN = new Vector3(0.3, 0, 0)

const surroundings = (): Surroundings => ({
  jd: 2_461_000.5,
  craftAu: HELIO,
  bodies: [
    { key: 'Sun', name: 'Sun', kind: 'sun', relKm: [-0.1 * AU_KM, 0, 0], radiusKm: 695_700 },
  ],
  omitted: [],
  omittedNear: [],
})

function host(over: Partial<FlyInHost> = {}) {
  const camera = new PerspectiveCamera(30, 1.6, 0.01, 2e5)
  const target = DRAWN.clone()
  camera.position.set(0.3, 4, 0)
  const controls = {
    target,
    minDistance: 0.5,
    maxDistance: 120_000,
  } as unknown as FlyInHost['controls']
  let drawn = DRAWN.clone()
  const h: FlyInHost & { setDrawn: (v: Vector3 | null) => void } = {
    camera,
    controls,
    reducedMotion: false,
    unitsPerAu: K,
    fovDeg: 30,
    aspect: () => 1.6,
    heightPx: () => 900,
    freeShare: () => ({ x: 0.75, y: 0.85 }),
    drawn: () => drawn,
    helio: () => HELIO,
    bodies: () => [{ helio: { x: 0, y: 0, z: 0 }, drawn: new Vector3() }],
    shape: () => null,
    facing: () => new Vector3(-1, 0, 0),
    setDrawn: (v) => {
      drawn = v as Vector3
    },
    ...over,
  }
  return h
}

const options = { size: { bodyM: 3, spanM: 3 }, axis: [0, 0, 1] as const, surroundings }

describe('FlyInDriver (#268)', () => {
  it('waits for the model, then begins from where the visitor is', () => {
    const h = host()
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    expect(d.step(100, false, 1)).toBeNull()
    expect(d.phase).toBe('waiting')
    expect(d.step(200, true, 1)).toBeNull()
    expect(d.phase).toBe('enter')
    // The bodies are held at the epoch it began.
    expect(d.frozenJd).toBe(1)
  })

  it('flies without the model once the wait is over', () => {
    const d = new FlyInDriver(host(), 'naif:-96', options, 0)
    d.step(MODEL_WAIT_MS + 1, false, 1)
    expect(d.phase).toBe('enter')
  })

  it('ends when the craft has no place to fly to', () => {
    const h = host({ helio: () => null })
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    expect(d.step(0, true, 1)).toBe('lost')
  })

  it('sizes the model from DISCOS: a 3 m body is 1.5 m in robust radius', () => {
    const d = new FlyInDriver(host(), 'naif:-96', options, 0)
    d.step(0, true, 1)
    expect((d.robustUnits / K) * AU_KM * 1000).toBeCloseTo(1.5, 6)
  })

  it('eases to true scale, flies in, and arrives with the clock live again', () => {
    const h = host()
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    d.step(0, true, 1)
    d.step(EASE_MS / 2, true, 1)
    expect(d.trueness).toBeGreaterThan(0)
    expect(d.trueness).toBeLessThan(1)
    d.step(EASE_MS + FLIGHT_MS, true, 1)
    expect(d.phase).toBe('arrived')
    expect(d.trueness).toBe(1)
    expect(d.frozenJd).toBeNull()
  })

  it('puts the camera on the timeline, about the craft as drawn', () => {
    const h = host()
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    d.step(0, true, 1)
    d.step(EASE_MS + FLIGHT_MS * 0.5, true, 1)
    expect(d.placeCamera()).toBe(true)
    expect(h.controls.target.distanceTo(DRAWN)).toBe(0)
    const km = (h.camera.position.distanceTo(DRAWN) / K) * AU_KM
    expect(km).toBeGreaterThan(0.01)
    expect(km).toBeLessThan(1e7)
  })

  it('keeps the visitor’s angle: arrives along the line it started on, no swing', () => {
    const h = host()
    const from = h.camera.position.clone().sub(h.controls.target).normalize()
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    d.step(0, true, 1)
    for (const ms of [EASE_MS / 2, EASE_MS + FLIGHT_MS / 2, EASE_MS + FLIGHT_MS]) {
      d.step(ms, true, 1)
      d.placeCamera()
      const dir = h.camera.position.clone().sub(h.controls.target).normalize()
      expect(dir.angleTo(from)).toBeLessThan(1e-6)
    }
  })

  it('turns only when a body sits on the visitor’s line in', () => {
    // The camera looks at Parker from straight past the Sun: the line in crosses the Sun.
    const h = host()
    h.camera.position.set(0.3 - 4, 0, 0)
    const from = h.camera.position.clone().sub(h.controls.target).normalize()
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    d.step(0, true, 1)
    d.step(EASE_MS + FLIGHT_MS, true, 1)
    d.placeCamera()
    const dir = h.camera.position.clone().sub(h.controls.target).normalize()
    expect(dir.angleTo(from)).toBeGreaterThan(0.1)
  })

  it('stops a flight where a drag finds it, but lets the ease finish first', () => {
    const d = new FlyInDriver(host(), 'naif:-96', options, 0)
    d.step(0, true, 1)
    d.step(EASE_MS / 2, true, 1)
    // Half way to true scale: the drag does nothing, so nothing pops.
    expect(d.interrupt()).toBeNull()
    expect(d.phase).toBe('enter')
    d.step(EASE_MS + FLIGHT_MS / 2, true, 1)
    expect(d.interrupt()).toBe('arrived')
    expect(d.phase).toBe('arrived')
    expect(d.trueness).toBe(1)
  })

  it('keeps the decoration whole until true scale, whatever the scene distance', () => {
    const h = host()
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    d.step(0, true, 1)
    d.step(EASE_MS / 2, true, 1)
    d.placeCamera()
    h.camera.position.copy(DRAWN).add(new Vector3(0, 0.01, 0))
    d.measure(() => 1e-6, 9)
    expect(d.decor).toBe(1)
  })

  it('leaves back out to the visitor’s side and scale', () => {
    const h = host()
    const start = h.camera.position.clone()
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    d.step(0, true, 1)
    d.step(EASE_MS + FLIGHT_MS, true, 1)
    expect(d.startLeave(10_000, 1)).toBe(true)
    expect(d.phase).toBe('leave')
    d.step(10_000 + LEAVE_FLIGHT_MS + LEAVE_EASE_MS / 2, true, 1)
    expect(d.trueness).toBeGreaterThan(0)
    expect(d.trueness).toBeLessThan(1)
    expect(d.step(10_000 + LEAVE_FLIGHT_MS + LEAVE_EASE_MS, true, 1)).toBe('done')
    d.restoreCamera()
    expect(h.camera.position.distanceTo(start)).toBeLessThan(1e-9)
  })

  it('cannot fly back before the flight has begun: the caller ends it at once', () => {
    const d = new FlyInDriver(host(), 'naif:-96', options, 0)
    expect(d.startLeave(0, 1)).toBe(false)
    d.step(0, true, 1)
    d.step(EASE_MS / 2, true, 1)
    expect(d.startLeave(EASE_MS / 2, 1)).toBe(false)
  })

  it('fades the decoration with distance and drops the icon floor with the ease', () => {
    const h = host()
    const d = new FlyInDriver(h, 'naif:-96', options, 0)
    d.step(0, true, 1)
    d.step(EASE_MS + FLIGHT_MS, true, 1)
    d.placeCamera()
    // At arrival the camera is a few hundred metres out: no decoration, the true size.
    h.camera.position.copy(DRAWN).add(new Vector3(0, (0.3 / AU_KM) * K, 0))
    d.measure(() => 1e-12, 9)
    expect(d.decor).toBe(0)
    expect(d.unit).toBe(d.robustUnits)
  })
})
