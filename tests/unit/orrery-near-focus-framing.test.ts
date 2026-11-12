/**
 * Focusing a close approach (#133): the approach and Earth's whole disc both sit in the
 * part of the stage the inspector and time bar leave free. The camera used to stand a fixed
 * 40 frame units off in whatever direction it had, so Earth, 15.6 units from a 0.04 au pass,
 * fell under the inspector or off the stage. The camera also stays near enough to Earth
 * that the Earth frame stays fully open, and no nearer the approach than the old distance.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import {
  FILL,
  type FocusRoom,
  FOV,
  NEAR_FIT_MAX_FACTOR,
  nearFocusAzimuths,
  nearFocusCandidate,
  nearFocusView,
} from '@/components/orrery/three/framing'
import { EARTH_FRAME_OPEN_CAMERA, EARTH_FRAME_UNIT, earthFrameRadii } from '@/lib/orrery/earthFrame'
import { AU_KM } from '@/lib/orrery/units'

const U = EARTH_FRAME_UNIT
const MIN = 40 * U
const MAX_EARTH = EARTH_FRAME_OPEN_CAMERA.open * U * 0.95

/** The free part of each stage measured on 2026-11-12 (canvas px; inspector; time bar). */
const STAGES: { name: string; aspect: number; room: FocusRoom }[] = [
  // 1440×900: canvas 974×678, drawer 353 px on the right, time bar's top 58 px up.
  { name: '1440', aspect: 974 / 678, room: { x: 621 / 974, up: 1, down: (339 - 58) / 339 } },
  // 1920×1080: canvas 1454×858, the same drawer and bar.
  { name: '1920', aspect: 1454 / 858, room: { x: 1101 / 1454, up: 1, down: (429 - 58) / 429 } },
  // 390×844: canvas 356×442, the sheet over its bottom 270 px (the time bar inside it).
  { name: '390', aspect: 356 / 442, room: { x: 1, up: 172 / 442, down: 172 / 442 } },
]

/** A pass `au` from Earth along `dir`, in the open frame, with Earth somewhere near 1 au. */
function geometry(au: number, dir: Vector3) {
  const earth = new Vector3(0.62, 0, -0.58)
  const target = earth
    .clone()
    .addScaledVector(dir.clone().normalize(), U * earthFrameRadii(au * AU_KM))
  return { earth, target }
}

/** Whether a disc of radius r at p sits inside FILL of the room, seen from the view. */
function discFits(
  view: { position: Vector3; target: Vector3 },
  aspect: number,
  room: FocusRoom,
  p: Vector3,
  r: number,
) {
  const camera = new PerspectiveCamera(FOV, aspect, 0.0001, 1e7)
  camera.updateProjectionMatrix()
  camera.position.copy(view.position)
  camera.lookAt(view.target)
  camera.updateMatrixWorld()
  const v = p.clone().project(camera)
  const ry = r / (p.distanceTo(camera.position) * Math.tan((FOV * Math.PI) / 360))
  const rx = ry / aspect
  const eps = 1e-6
  return (
    v.z < 1 &&
    Math.abs(v.x) + rx <= room.x * FILL + eps &&
    v.y + ry <= room.up * FILL + eps &&
    -v.y + ry <= room.down * FILL + eps
  )
}

const DIRECTIONS = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 0, 1),
  new Vector3(0.3, 0.2, -1),
  new Vector3(-0.7, -0.3, 0.6),
]
/** Where the camera was before the focus (from the target): Earth–Moon-like, overhead, low. */
const CURRENT = [new Vector3(0.6, 0.42, 0.68), new Vector3(0, 1, 0.07), new Vector3(-1, 0.1, 0.2)]

describe('nearFocusView (#133)', () => {
  for (const stage of STAGES) {
    it(`holds a 0.04 au pass and Earth in the free part at ${stage.name}`, () => {
      for (const dir of DIRECTIONS) {
        for (const current of CURRENT) {
          const { earth, target } = geometry(0.04, dir)
          const view = nearFocusView({
            target,
            earth,
            earthRadius: U,
            current,
            aspect: stage.aspect,
            room: stage.room,
            minDistance: MIN,
            maxEarthDistance: MAX_EARTH,
          })
          expect(view.target.distanceTo(target)).toBeLessThan(1e-12)
          expect(discFits(view, stage.aspect, stage.room, target, 0)).toBe(true)
          expect(discFits(view, stage.aspect, stage.room, earth, U)).toBe(true)
          expect(view.position.distanceTo(target)).toBeGreaterThanOrEqual(MIN - 1e-12)
          expect(view.position.distanceTo(earth)).toBeLessThanOrEqual(MAX_EARTH + 1e-12)
        }
      }
    })
  }

  it('keeps the camera where it was, at the old distance, when that already holds Earth', () => {
    // A pass 0.0002 au (30,000 km) out is 4.7 frame units from Earth: 40 units off holds both.
    const { earth, target } = geometry(0.0002, new Vector3(1, 0, 0))
    const current = new Vector3(0, 0.5, 1).normalize()
    const stage = STAGES[0]
    if (!stage) throw new Error('no stage')
    const view = nearFocusView({
      target,
      earth,
      earthRadius: U,
      current,
      aspect: stage.aspect,
      room: stage.room,
      minDistance: MIN,
      maxEarthDistance: MAX_EARTH,
    })
    const offset = view.position.clone().sub(target)
    expect(offset.length()).toBeCloseTo(MIN, 9)
    expect(offset.normalize().angleTo(current)).toBeLessThan(1e-9)
  })
})

/** The 1440 stage's input for a pass `au` from Earth along `dir`, seen from `current`. */
function input1440(au: number, dir: Vector3, current: Vector3, room?: FocusRoom) {
  const stage = STAGES[0]
  if (!stage) throw new Error('no stage')
  return {
    ...geometry(au, dir),
    earthRadius: U,
    current,
    aspect: stage.aspect,
    room: room ?? stage.room,
    minDistance: MIN,
    maxEarthDistance: MAX_EARTH,
  }
}

const offsetDir = (view: { position: Vector3; target: Vector3 }) =>
  view.position.clone().sub(view.target).normalize()

describe('nearFocusView: turning, hysteresis and limits (#133 review)', () => {
  it('falls back to the open azimuth (of 24) with the widest gap when its own side fails', () => {
    // Looking straight down the approach–Earth line: Earth's disc covers the approach.
    const dir = new Vector3(1, 0.2, -0.4)
    const input = input1440(0.04, dir, dir.clone().negate())
    const view = nearFocusView(input)
    const candidates = nearFocusAzimuths().map((d) => nearFocusCandidate(input, d))
    const open = candidates.filter((c) => c.fits && c.earthDistance <= MAX_EARTH)
    expect(open.length).toBeGreaterThan(0)
    const widest = open.reduce((a, b) => (b.gap > a.gap ? b : a))
    expect(view.turned).toBe(true)
    expect(offsetDir(view).angleTo(widest.dir)).toBeLessThan(1e-9)
  })

  it('the 24 azimuths are unit vectors 25° above the ecliptic, 15° apart', () => {
    const dirs = nearFocusAzimuths()
    expect(dirs).toHaveLength(24)
    for (const d of dirs) {
      expect(d.length()).toBeCloseTo(1, 12)
      expect(Math.asin(d.y) * (180 / Math.PI)).toBeCloseTo(25, 9)
    }
  })

  it('does not flip sides on a refit where the gap is only marginal', () => {
    // Find a side whose refit gap sits between 1 and 2 Earth radii on screen: a first
    // focus would turn away from it, a refit must keep it.
    const pass = new Vector3(1, 0, 0.3)
    const earthLine = pass.clone().normalize().negate()
    let marginal: Vector3 | null = null
    for (let deg = 0.5; deg < 40 && !marginal; deg += 0.25) {
      const side = new Vector3(0, 1, 0).cross(earthLine).normalize()
      const current = earthLine.clone().applyAxisAngle(side, (deg * Math.PI) / 180)
      const c = nearFocusCandidate(input1440(0.04, pass, current), current)
      if (c.fits && c.gap > c.earthNdc * 1.05 && c.gap < c.earthNdc * 1.95) marginal = current
    }
    if (!marginal) throw new Error('no marginal side found')
    const refit = nearFocusView({ ...input1440(0.04, pass, marginal), refit: true })
    expect(refit.turned).toBe(false)
    expect(offsetDir(refit).angleTo(marginal)).toBeLessThan(1e-9)
    const first = nearFocusView(input1440(0.04, pass, marginal))
    expect(first.turned).toBe(true)
  })

  it('a straight-down camera, current = (0, 1, 0) exactly, still frames both', () => {
    for (const stage of STAGES) {
      const input = { ...input1440(0.04, new Vector3(1, 0, 0), new Vector3(0, 1, 0)) }
      const view = nearFocusView({ ...input, aspect: stage.aspect, room: stage.room })
      expect(Number.isFinite(view.position.x + view.position.y + view.position.z)).toBe(true)
      expect(view.fits).toBe(true)
      expect(discFits(view, stage.aspect, stage.room, input.target, 0)).toBe(true)
      expect(discFits(view, stage.aspect, stage.room, input.earth, U)).toBe(true)
    }
  })

  it('a room too small to hold both says so, at a finite, clamped distance', () => {
    const tiny: FocusRoom = { x: 1e-7, up: 1e-7, down: 1e-7 }
    const input = input1440(0.04, new Vector3(1, 0, 0), new Vector3(0, 0.5, 1), tiny)
    const view = nearFocusView(input)
    expect(view.fits).toBe(false)
    const distance = view.position.distanceTo(view.target)
    expect(Number.isFinite(distance)).toBe(true)
    expect(distance).toBeLessThanOrEqual(MIN * NEAR_FIT_MAX_FACTOR * (1 + 1e-9))
  })
})
