/**
 * The fly-in inside the orrery (#268, B+): its state and the camera, frame by frame. The
 * renderer owns the scene and draws it; this decides the camera, how far the view has eased
 * to true scale (`trueness`), how much decoration still shows (`decor`) and the true size of
 * the craft's model. Timeline: lib/orrery/flyInPath.ts. The model's own pass: nearPass.ts.
 *
 * Phases: waiting (for the model to arrive or fail) -> enter (ease, then flight) -> arrived
 * (the visitor turns and zooms about the craft) -> leave (back out, then the ease back) -> gone.
 * While it runs, the bodies are placed at the epoch it started (a fast clock would otherwise
 * move them under a planned path); once arrived the clock is live again.
 */
import { type PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { outlineFraming } from '@/lib/orrery/detailFraming'
import {
  decorAt,
  enterAt,
  FLIGHT_START_KM,
  type FlyInPlan,
  leaveAt,
  type LeavePlan,
  planFlyIn,
  radialClear,
  scaleRatio,
  type V3,
} from '@/lib/orrery/flyInPath'
import type { Vec3 } from '@/lib/orrery/scale'
import type { Surroundings } from '@/lib/orrery/surroundings'
import {
  type CraftSize,
  flightStart,
  framingApproach,
  type Km3,
  modelMetresPerUnit,
} from '@/lib/orrery/trueScale'
import { AU_KM } from '@/lib/orrery/units'

/** What the page hands the fly-in: the craft's real size and its surroundings now. */
export interface FlyInOptions {
  readonly size: CraftSize
  readonly surroundings: () => Surroundings | null
  /** The model's own axis its attitude points (craftModels' `axis`). */
  readonly axis: readonly [number, number, number]
}

export type FlyInPhase = 'waiting' | 'enter' | 'arrived' | 'leave'

/** What the page shows over the stage, each drawn frame. */
export interface FlyInState {
  readonly key: string
  readonly phase: FlyInPhase
  readonly trueness: number
  readonly decor: number
  /** The craft on screen: CSS px from the canvas's top left, its drawn radius and range. */
  readonly target: { x: number; y: number; radiusPx: number; rangeKm: number } | null
}

/** What the driver reads from the renderer. */
export interface FlyInHost {
  readonly camera: PerspectiveCamera
  readonly controls: OrbitControls
  readonly reducedMotion: boolean
  /** Scene units per au at true scale. */
  readonly unitsPerAu: number
  readonly fovDeg: number
  aspect(): number
  heightPx(): number
  /** The share of the canvas's width and height the inspector and time bar leave free. */
  freeShare(): { x: number; y: number }
  /** The craft as drawn now, or null when it is not drawn. */
  drawn(key: string): Vector3 | null
  /** The craft's heliocentric ecliptic position now, au. */
  helio(key: string): Vec3 | null
  /** The Sun and planets: heliocentric au and as drawn now. */
  bodies(): readonly { helio: Vec3; drawn: Vector3 }[]
  /** The model's shape, once it has arrived. */
  shape(): { points: Float32Array; fullShare: number } | null
  /** The scene direction the model's axis points along now (its attitude), or null. */
  facing(key: string): Vector3 | null
}

/** Wait this long for the model before flying without it, ms. */
export const MODEL_WAIT_MS = 6_000
/**
 * The share of the free part of the stage left clear round the model on arrival: more than the
 * old close-up's 0.08, since here the inspector and time bar sit over the same picture.
 */
const FRAME_MARGIN = 0.15
/** Zooming out stops where the model's farthest vertex is this many px; a push there leaves. */
export const WALL_PX = 12
/** With no model, arrive this far out, metres. */
const NO_MODEL_ARRIVAL_M = 60
/** The flight starts no farther out than this, km. */
const D1_MAX_KM = 1e10

const ecliptic = (v: Vector3): Km3 => [v.x, -v.z, v.y]
const scene = (k: Km3): V3 => [k[0], k[2], -k[1]]
const asV3 = (v: Vector3): V3 => [v.x, v.y, v.z]
const unitV = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return l === 0 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l]
}
const linear = (p: Vec3, k: number): V3 => [p.x * k, p.z * k, -p.y * k]

export class FlyInDriver {
  readonly key: string
  readonly options: FlyInOptions
  phase: FlyInPhase = 'waiting'
  /** 0 is the visitor's scale, 1 true scale. */
  trueness = 0
  /** How much decoration shows: 1 far from the craft, 0 close in. */
  decor = 1
  /** Bodies are placed at this epoch while it moves; null when the clock is live. */
  frozenJd: number | null = null
  /** The model's robust radius at true size, scene units. */
  robustUnits = 0
  /** Its farthest vertex, in robust radii. */
  fullShare = 1
  /** The model's drawn robust radius this frame (its true size, or the icon floor easing out). */
  unit = 0

  private readonly host: FlyInHost
  private readonly since: number
  private readonly saved: { dir: V3; distance: number }
  private start = 0
  private plan: FlyInPlan | null = null
  private leavePlan: LeavePlan | null = null
  private frame: { distance: number; direction: V3 } | null = null
  private fit = { min: 0, wall: Infinity }

  constructor(host: FlyInHost, key: string, options: FlyInOptions, now: number) {
    this.host = host
    this.key = key
    this.options = options
    this.since = now
    const off = host.camera.position.clone().sub(host.controls.target)
    this.saved = { dir: unitV(asV3(off)), distance: Math.max(off.length(), 1e-9) }
  }

  /**
   * Advance to `now`. Returns 'lost' when the craft has no place (it left its data), 'done'
   * when a leave has finished, else null.
   */
  step(now: number, settled: boolean, lastJd: number): 'lost' | 'done' | null {
    if (this.phase === 'waiting') {
      if (!settled && now - this.since < MODEL_WAIT_MS) return null
      return this.begin(now, lastJd) ? null : 'lost'
    }
    if (this.phase === 'enter' && this.plan) {
      const f = enterAt(this.plan, now - this.start, this.host.reducedMotion)
      this.trueness = f.trueness
      this.frame = f
      if (f.phase === 'arrived') {
        // The last frame of the flight (or, with reduced motion, the only one): the camera
        // lands at arrival before the visitor's limits are set from it.
        const target = this.host.drawn(this.key)
        if (target) this.placeOn(f, target)
        this.arrive()
      }
    } else if (this.phase === 'leave' && this.leavePlan) {
      const f = leaveAt(this.leavePlan, now - this.start, this.host.reducedMotion)
      this.trueness = f.trueness
      this.frame = f
      if (f.phase === 'done') return 'done'
    }
    return null
  }

  /** Whether the camera is being moved by the timeline (not the visitor). */
  scripted(): boolean {
    return this.phase === 'enter' || this.phase === 'leave'
  }

  /**
   * Put the camera where the timeline says, about the craft as drawn now (after the bodies are
   * placed). False when the craft is not drawn.
   */
  placeCamera(): boolean {
    const target = this.host.drawn(this.key)
    if (!target) return false
    if (this.scripted() && this.frame) this.placeOn(this.frame, target)
    return true
  }

  /** The camera `frame.distance` out along `frame.direction` from `target`, looking at it. */
  private placeOn(frame: { distance: number; direction: V3 }, target: Vector3): void {
    const { camera, controls } = this.host
    const [x, y, z] = frame.direction
    controls.target.copy(target)
    camera.position.set(x, y, z).multiplyScalar(frame.distance).add(target)
    camera.lookAt(target)
  }

  /** The decoration and the model's drawn size for this frame, once the camera is placed. */
  measure(unitsPerPxAt: (depth: number) => number, iconPx: number): void {
    const target = this.host.drawn(this.key)
    const depth = target ? target.distanceTo(this.host.camera.position) : Infinity
    // Scene units are km only at true scale: before that the decoration stays whole.
    this.decor = this.trueness < 1 ? 1 : decorAt((depth / this.host.unitsPerAu) * AU_KM)
    const floor = iconPx * (1 - this.trueness) * unitsPerPxAt(depth)
    this.unit = Math.max(this.robustUnits, floor)
  }

  /** The visitor took the camera: a flight stops where it is; a leave finishes. */
  interrupt(): 'arrived' | 'done' | null {
    // In the ease the scale is half way: it finishes first, and the drag does nothing.
    if (this.phase === 'enter' && this.trueness >= 1) {
      this.trueness = 1
      this.arrive()
      return 'arrived'
    }
    return this.phase === 'leave' ? 'done' : null
  }

  /** Start back out, from wherever the camera is. False: nothing to fly back from. */
  startLeave(now: number, lastJd: number): boolean {
    if (this.phase === 'leave') return true
    // Before the flight began (waiting, or still easing in), there is nothing to fly back
    // along: the caller ends it and puts the camera back.
    if (!this.plan || this.phase === 'waiting' || this.trueness < 1) return false
    const { camera, controls } = this.host
    const off = camera.position.clone().sub(controls.target)
    this.leavePlan = {
      fromDir: unitV(asV3(off)),
      from: off.length(),
      toDir: this.saved.dir,
      d1: this.plan.d1,
      d0: this.saved.distance,
    }
    this.phase = 'leave'
    this.start = now
    this.frozenJd = lastJd
    controls.minDistance = 0
    controls.maxDistance = Infinity
    return true
  }

  /** Put the camera back where the visitor had it, about the craft as drawn now. */
  restoreCamera(): void {
    const target = this.host.drawn(this.key)
    if (!target) return
    const { camera, controls } = this.host
    const [x, y, z] = this.saved.dir
    controls.target.copy(target)
    camera.position.set(x, y, z).multiplyScalar(this.saved.distance).add(target)
    camera.lookAt(target)
  }

  /** Whether the camera is at the zoom-out wall (arrived): a fresh push out leaves. */
  atWall(slack: number): boolean {
    if (this.phase !== 'arrived') return false
    const d = this.host.camera.position.distanceTo(this.host.controls.target)
    return d * slack >= this.host.controls.maxDistance
  }

  state(
    project: (p: Vector3) => { x: number; y: number } | null,
    unitsPerPxAt: (d: number) => number,
  ): FlyInState {
    const at = this.host.drawn(this.key)
    let target: FlyInState['target'] = null
    if (at && this.phase !== 'waiting') {
      const depth = at.distanceTo(this.host.camera.position)
      const xy = project(at)
      if (xy && depth > 0) {
        target = {
          ...xy,
          radiusPx: (this.unit * this.fullShare) / unitsPerPxAt(depth),
          rangeKm: (depth / this.host.unitsPerAu) * AU_KM,
        }
      }
    }
    return { key: this.key, phase: this.phase, trueness: this.trueness, decor: this.decor, target }
  }

  /** Plan the flight from the camera as it is now. False when the craft has no place. */
  private begin(now: number, lastJd: number): boolean {
    const host = this.host
    const helio = host.helio(this.key)
    const drawn = host.drawn(this.key)
    const s = this.options.surroundings()
    if (!helio || !drawn || !s) return false
    const k = host.unitsPerAu
    const unitsPerKm = k / AU_KM
    const ratio = scaleRatio(
      { true: linear(helio, k), drawn: asV3(drawn) },
      host.bodies().map((b) => ({ true: linear(b.helio, k), drawn: asV3(b.drawn) })),
    )
    const fromVec = host.camera.position.clone().sub(host.controls.target)
    const fromDir = unitV(asV3(fromVec))
    const d0 = Math.max(fromVec.length(), 1e-9)
    // The framing side (opposite the biggest-looking body, turned toward the visitor's side),
    // moved off any body in the way: the old close-up's rule.
    const approach = framingApproach(s.bodies, ecliptic(new Vector3(...fromDir)))
    const start = flightStart(
      approach,
      FLIGHT_START_KM,
      s.bodies.map((b) => ({ center: b.relKm, radiusKm: b.radiusKm })),
    )
    const toDir = unitV(scene(start))
    // The model at its real size (ESA DISCOS): its robust radius in metres.
    const shape = host.shape()
    this.fullShare = shape?.fullShare ?? 1
    const robustM = modelMetresPerUnit(this.options.size, this.fullShare)
    this.robustUnits = (robustM / 1000) * unitsPerKm
    const halfTan = Math.tan(((host.fovDeg / 2) * Math.PI) / 180)
    const wall = (this.robustUnits * this.fullShare * host.heightPx()) / (2 * halfTan * WALL_PX)
    const obstacles = s.bodies.map((b) => ({
      center: scene([b.relKm[0] * unitsPerKm, b.relKm[1] * unitsPerKm, b.relKm[2] * unitsPerKm]),
      radius: b.radiusKm * unitsPerKm,
    }))
    const planFor = (side: V3) => {
      const fit = this.arrivalFit(side, shape, unitsPerKm)
      this.fit = { min: fit.min, wall: Math.max(wall, fit.arrival * 1.5) }
      return planFlyIn({
        fromDir,
        toDir: side,
        d0,
        ratio,
        arrival: fit.arrival,
        turnEndDistance: FLIGHT_START_KM * unitsPerKm,
        obstacles,
        d1Min: 2 * FLIGHT_START_KM * unitsPerKm,
        d1Max: D1_MAX_KM * unitsPerKm,
      })
    }
    // The visitor's own angle first, straight in and straight back out: the old turn to the
    // framing side swung the camera up to 180 degrees (owner, 2026-11-20). The turn is
    // kept for when a body sits on that line in.
    // planFor sets this.fit for the side it plans: the plan kept must be the last planned.
    // turnFirst is forced off because the planner, finding nothing clear, would turn in the ease.
    const straight = planFor(fromDir)
    let plan: FlyInPlan
    if (radialClear(fromDir, straight.d1, straight.arrival, obstacles)) {
      plan = { ...straight, toDir: fromDir, turnFirst: false }
    } else {
      plan = planFor(toDir)
      // The planner may come straight in on the visitor's side instead: fit for that side.
      const [x, y, z] = plan.toDir
      if (x * toDir[0] + y * toDir[1] + z * toDir[2] < 1 - 1e-9) {
        const arrival = this.arrivalFit(plan.toDir, shape, unitsPerKm)
        this.fit = { min: arrival.min, wall: Math.max(wall, arrival.arrival * 1.5) }
        plan = { ...plan, arrival: arrival.arrival }
      }
    }
    this.plan = plan
    this.phase = 'enter'
    this.start = now
    this.frozenJd = lastJd
    host.controls.minDistance = 0
    host.controls.maxDistance = Infinity
    return true
  }

  /**
   * Where the flight arrives, seen from `side`: the model framed by its real outline in its
   * own axes, in the part of the stage the inspector and time bar leave free.
   */
  private arrivalFit(
    side: V3,
    shape: { points: Float32Array; fullShare: number } | null,
    unitsPerKm: number,
  ): { arrival: number; min: number } {
    const host = this.host
    if (!shape) {
      const arrival = (NO_MODEL_ARRIVAL_M / 1000) * unitsPerKm
      return { arrival, min: arrival * 0.4 }
    }
    const facing = host.facing(this.key)
    const turn = facing
      ? new Quaternion().setFromUnitVectors(
          new Vector3(...this.options.axis).normalize(),
          facing.clone().normalize(),
        )
      : new Quaternion()
    const local = new Vector3(...side).applyQuaternion(turn.invert())
    const fit = outlineFraming(shape.points, local, host.fovDeg, host.aspect(), FRAME_MARGIN)
    // Fitted to the whole canvas; the model must fit the part left free, so stand back by
    // the tighter of the two shares.
    const free = host.freeShare()
    return {
      arrival: (fit.distance * this.robustUnits) / Math.min(free.x, free.y),
      min: fit.minDistance * this.robustUnits,
    }
  }

  private arrive(): void {
    this.phase = 'arrived'
    this.frozenJd = null
    const { camera, controls } = this.host
    const d = camera.position.distanceTo(controls.target)
    controls.minDistance = Math.min(this.fit.min, d)
    controls.maxDistance = Math.max(this.fit.wall, d)
  }
}
