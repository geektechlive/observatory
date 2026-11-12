/**
 * An object looked up at JPL and shown in the orrery (#145): one marker on its Horizons
 * samples (Hermite, hidden where none cover the date, never extrapolated) and its orbit
 * line. The line is in heliocentric au and goes through the scene's scale, so it is
 * rebuilt only when the object or the scale mode changes, except near Earth.
 *
 * Near Earth (#151) the marker joins the Earth frame (#92), and so does its line: the
 * stretch of its samples within 0.1 au of Earth is drawn as a pass, each point placed
 * against Earth at its own date, as the close approaches' paths are, and the loop's
 * points that near Earth are left out, so the dot never sits off a true-scale line.
 */
import type { Vector3 } from 'three'
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three'

import { earthFrameDistance, earthFrameRadii, sceneDirection } from '@/lib/orrery/earthFrame'
import { stateAt } from '@/lib/orrery/ephemeris'
import { lookupNearTimes, type LookupOrbit } from '@/lib/orrery/lookupTrack'
import type { Vec3 } from '@/lib/orrery/scale'
import { AU_KM } from '@/lib/orrery/units'
import { LANES } from '@/lib/palette'
import type { OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'

import { clampRadius, PX_CEILING } from './pxClamp'

/** Its own colour: the "Space objects" lane, apart from the amber approaches and cyan craft. */
const LOOKUP_HEX = LANES.space.emit
/** The marker's radius before the renderer's px clamp (lookupMarkerRadius), scene units. */
const MARKER_RADIUS = 0.02
/** An osculating loop is 256 points, closed with one more. */
const MAX_PATH_POINTS = 600
/** The marker never draws smaller than this, px (#145). */
const LOOKUP_MIN_PX = 3.5
/** Points in the pass near Earth: its sampled times, plus the date shown. */
const NEAR_TIMES = 240
const NEAR_PATH_POINTS = NEAR_TIMES + 1

/**
 * The marker's scene radius, given the scene units that cover one px where it is: 3.5 to
 * 5 px, a point like the comet that may draw the same object (#99), never planet-sized
 * however near the camera comes (#153).
 */
export function lookupMarkerRadius(unitsPerPx: number): number {
  return clampRadius(MARKER_RADIUS, unitsPerPx, LOOKUP_MIN_PX, PX_CEILING.smallBody)
}

export interface LookupData {
  key: string
  label: string
  /** Horizons samples, position and velocity (/api/trajectory). */
  fine: SampledSpan
  orbit: LookupOrbit | null
}

/** The Earth frame as the renderer has it this frame (#92), for the object near Earth. */
export interface LookupNear {
  /** How open the frame is: 0 = everything at its true place, 1 = the open frame. */
  t: number
  /** Horizons' Earth (/api/orrery-bodies), null without it. */
  earthTrack: OrreryTrack | null
  /** Within this distance of Earth, au, the object is drawn in the frame. */
  maxAu: number
  /** Earth as drawn this frame, and its drawn radius (the frame's unit), scene units. */
  earth: Vector3
  radius: number
  /**
   * Where a heliocentric position at a date is drawn in the frame, relative to Earth at
   * that date; null beyond `maxAu` or where Horizons' Earth has no sample.
   */
  at: (helio: Vec3, jd: number) => Vector3 | null
}

/** A run of the loop's points: `length` from `start`, wrapping on a closed loop. */
interface Run {
  start: number
  length: number
  whole: boolean
}

/** The longest run of kept points. On a closed loop a run may wrap past the end. */
function longestKept(keep: Uint8Array, n: number, loop: boolean): Run {
  let firstCut = -1
  for (let i = 0; i < n; i += 1) {
    if (!keep[i]) {
      firstCut = i
      break
    }
  }
  if (firstCut < 0) return { start: 0, length: n, whole: true }
  // Start just after a cut on a loop, so no run is split by the wrap.
  const from = loop ? firstCut + 1 : 0
  let best = { start: 0, length: 0, whole: false }
  let start = -1
  for (let k = 0; k < n; k += 1) {
    const i = (from + k) % n
    if (!keep[i]) {
      start = -1
      continue
    }
    if (start < 0) start = i
    const length = k - ((start - from + n) % n) + 1
    if (length > best.length) best = { start, length, whole: false }
  }
  return best
}

/** Per date of the pass: scene direction from Earth (3), frame radii, true offset. */
const PART = 5

/**
 * The pass's dates and what of each placement does not change from frame to frame: its
 * direction from Earth, its distance in frame radii and where place3d puts it. Only
 * dates within reach of Earth, with Earth sampled, are kept.
 */
function nearParts(
  fine: SampledSpan,
  earth: SampledSpan,
  times: readonly number[],
  maxAu: number,
  toScene: (p: Vec3) => Vector3,
): { times: number[]; parts: Float64Array } {
  const kept: number[] = []
  const parts: number[] = []
  for (const jd of times) {
    const s = stateAt({ fine, coarse: null }, jd)
    const e = s ? stateAt({ fine: earth, coarse: null }, jd) : null
    if (!s || !e) continue
    const p = s.position
    const rel = { x: p.x - e.position.x, y: p.y - e.position.y, z: p.z - e.position.z }
    const { dir, au } = sceneDirection(rel)
    if (au > maxAu) continue
    kept.push(jd)
    const trueOffset = toScene(p).sub(toScene(e.position)).length()
    parts.push(dir.x, dir.y, dir.z, earthFrameRadii(au * AU_KM), trueOffset)
  }
  return { times: kept, parts: Float64Array.from(parts) }
}

function makeLine(points: number, opacity: number, name: string) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(points * 3), 3))
  geometry.setDrawRange(0, 0)
  const line = new Line(
    geometry,
    new LineBasicMaterial({ color: new Color(LOOKUP_HEX), transparent: true, opacity }),
  )
  line.name = name
  line.visible = false
  return line
}

export class LookupLayer {
  readonly marker = new Mesh(
    new SphereGeometry(1, 16, 12),
    new MeshBasicMaterial({ color: new Color(LOOKUP_HEX) }),
  )
  /** The orbit line at true scale. */
  readonly path = makeLine(MAX_PATH_POINTS, 0.55, 'lookup-path')
  /** The pass near Earth, through the Earth frame (#151). */
  readonly nearPath = makeLine(NEAR_PATH_POINTS, 0.55, 'lookup-near-path')
  private data: LookupData | null = null
  /** Heliocentric position now, au; null where no sample covers the date. */
  private helio: Vec3 | null = null
  /** The data and scale mode the line was last built for. */
  private builtFor: { data: LookupData; mode: string } | null = null
  /** The date last placed, Julian (TDB), and the scene placement it used. */
  private jd = Number.NaN
  private toScene: ((p: Vec3) => Vector3) | null = null
  /** The line's points, heliocentric au, and whether they close on themselves. */
  private loop: { points: Vec3[]; closed: boolean } = { points: [], closed: false }
  /** The loop's run drawn now: rewritten only when it changes (ADR 0017). */
  private drawnRun: Run | null = null
  private keep = new Uint8Array(0)
  /** The scale mode last placed in. */
  private mode = ''
  /** The pass's dates and fixed parts, kept until the object, Earth's samples or mode change. */
  private near: {
    data: LookupData
    earth: OrreryTrack | null
    mode: string
    times: number[]
    parts: Float64Array
  } | null = null
  /** The date and frame the pass was last written for: the same again writes nothing. */
  private nearKey: number[] = []

  constructor() {
    this.marker.name = 'lookup-marker'
    this.marker.visible = false
  }

  set(data: LookupData | null): void {
    this.data = data
    this.builtFor = null
    this.near = null
    this.nearKey = []
  }

  has(key: string): boolean {
    return this.data?.key === key
  }

  /** The shown object's key, or null when none is. */
  key(): string | null {
    return this.data?.key ?? null
  }

  /** Its heliocentric position now, au, or null where no sample covers the date. */
  helioNow(): Vec3 | null {
    return this.helio
  }

  /**
   * Place the marker for a date and (re)build the line if the object or mode changed.
   * `hidden`: the same object is drawn from the comet data (#99), so this copy hides its
   * marker, line and label; it is still placed, so the camera can frame it.
   */
  place(jd: number, toScene: (p: Vec3) => Vector3, mode: string, hidden = false): void {
    this.jd = jd
    this.toScene = toScene
    this.mode = mode
    const s = this.data ? stateAt({ fine: this.data.fine, coarse: null }, jd) : null
    this.helio = s ? s.position : null
    this.marker.visible = s !== null && !hidden
    if (s) {
      this.marker.position.copy(toScene(s.position))
      this.marker.scale.setScalar(MARKER_RADIUS)
    }
    const data = this.data
    if (data && (this.builtFor?.data !== data || this.builtFor.mode !== mode)) {
      const points = data.orbit?.points ?? []
      this.loop = { points, closed: data.orbit?.kind === 'osculating' && points.length > 0 }
      this.keep = new Uint8Array(points.length)
      this.drawnRun = null
      this.nearKey = []
      this.writeLoop(null)
      this.builtFor = { data, mode }
    }
    this.path.visible = this.marker.visible && this.path.geometry.drawRange.count > 1
    if (!this.marker.visible) this.nearPath.visible = false
  }

  /**
   * Write the loop through the scene's scale, leaving out the points within `maxAu` of
   * `earth` (au) when given. Its points don't move in the scene, so only a change of run
   * rewrites it.
   */
  private writeLoop(cut: { earth: Vec3; maxAu: number } | null): void {
    const toScene = this.toScene
    if (!toScene) return
    const { points, closed } = this.loop
    const n = points.length
    for (let i = 0; i < n; i += 1) {
      const p = points[i]
      this.keep[i] =
        !cut ||
        !p ||
        Math.hypot(p.x - cut.earth.x, p.y - cut.earth.y, p.z - cut.earth.z) >= cut.maxAu
          ? 1
          : 0
    }
    const run = longestKept(this.keep, n, closed)
    const was = this.drawnRun
    if (was?.start === run.start && was.length === run.length && was.whole === run.whole) return
    this.drawnRun = run
    const count = Math.min(MAX_PATH_POINTS, run.length + (closed && run.whole && n > 0 ? 1 : 0))
    const attr = this.path.geometry.getAttribute('position') as Float32BufferAttribute
    for (let k = 0; k < count; k += 1) {
      const v = toScene(points[(run.start + k) % n] ?? { x: 0, y: 0, z: 0 })
      attr.setXYZ(k, v.x, v.y, v.z)
    }
    attr.needsUpdate = true
    this.path.geometry.setDrawRange(0, count)
    if (count > 0) this.path.geometry.computeBoundingSphere()
    this.path.visible = this.marker.visible && count > 1
  }

  /**
   * Near Earth the marker joins the Earth frame (#92), as the craft do, and with the frame
   * open its pass is drawn there (#151). Called every frame the frame is placed.
   */
  placeNear(near: LookupNear): void {
    if (!this.helio || !this.marker.visible || !this.data) {
      this.leaveFrame()
      return
    }
    const p = near.at(this.helio, this.jd)
    if (p) this.marker.position.copy(p)
    const earth = near.earthTrack?.fine
    const earthNow = earth ? stateAt({ fine: earth, coarse: null }, this.jd)?.position : null
    if (!p || near.t <= 0 || !earth || !earthNow) {
      this.leaveFrame()
      return
    }
    const n = this.writeNearPath(this.data, near, earth, p)
    if (n < 2) {
      this.leaveFrame()
      return
    }
    this.writeLoop({ earth: earthNow, maxAu: near.maxAu })
  }

  /**
   * The pass near Earth, with the date shown among its points (`now`, where the marker
   * is); how many points are drawn. Per frame this is a scale and an add per point: the
   * rest is cached (`nearParts`), and an unchanged date and frame write nothing (ADR 0017).
   */
  private writeNearPath(
    data: LookupData,
    near: LookupNear,
    earth: SampledSpan,
    now: Vector3,
  ): number {
    const cache = this.near
    if (cache?.data !== data || cache.earth !== near.earthTrack || cache.mode !== this.mode) {
      const toScene = this.toScene
      if (!toScene) return 0
      const earthAt = (jd: number) => stateAt({ fine: earth, coarse: null }, jd)?.position ?? null
      const times = lookupNearTimes(data.fine, earthAt, near.maxAu, NEAR_TIMES)
      this.near = {
        data,
        earth: near.earthTrack,
        mode: this.mode,
        ...nearParts(data.fine, earth, times, near.maxAu, toScene),
      }
      this.nearKey = []
    }
    const { times, parts } = this.near ?? { times: [], parts: new Float64Array(0) }
    const e = near.earth
    const key = [this.jd, near.t, near.radius, e.x, e.y, e.z]
    if (key.every((v, i) => v === this.nearKey[i])) return this.nearPath.geometry.drawRange.count
    this.nearKey = key
    const attr = this.nearPath.geometry.getAttribute('position') as Float32BufferAttribute
    let n = 0
    let nowWritten = times.length === 0 || this.jd < (times[0] ?? Infinity)
    for (let i = 0; i < times.length; i += 1) {
      const jd = times[i] ?? 0
      // The date shown is a point of its own, so the dot sits on the line, not on a chord.
      if (!nowWritten && jd >= this.jd) {
        if (jd !== this.jd) attr.setXYZ(n++, now.x, now.y, now.z)
        nowWritten = true
      }
      const o = i * PART
      const r = earthFrameDistance(parts[o + 4] ?? 0, near.radius * (parts[o + 3] ?? 0), near.t)
      attr.setXYZ(
        n++,
        e.x + (parts[o] ?? 0) * r,
        e.y + (parts[o + 1] ?? 0) * r,
        e.z + (parts[o + 2] ?? 0) * r,
      )
    }
    attr.needsUpdate = n > 0
    this.nearPath.geometry.setDrawRange(0, n)
    if (n > 0) this.nearPath.geometry.computeBoundingSphere()
    this.nearPath.visible = n > 1
    return n
  }

  /** Back to the whole loop and no pass: the frame is closed, or the object is away. */
  private leaveFrame(): void {
    this.nearPath.visible = false
    this.nearPath.geometry.setDrawRange(0, 0)
    this.nearKey = []
    if (this.drawnRun && !this.drawnRun.whole) this.writeLoop(null)
  }

  /** Where it is drawn now, or null when it is hidden or not this key. */
  position(key: string): Vector3 | null {
    return this.has(key) && this.marker.visible ? this.marker.position.clone() : null
  }

  /** Its key and label while drawn, for the label pass. */
  labelled(): { key: string; label: string } | null {
    return this.data && this.marker.visible ? { key: this.data.key, label: this.data.label } : null
  }

  /** Points in the drawn line, for the e2e checks. */
  pathPoints(): number {
    return this.path.visible ? this.path.geometry.drawRange.count : 0
  }

  /** Points in the pass drawn through the Earth frame (#151), for the e2e checks. */
  nearPathPoints(): number {
    return this.nearPath.visible ? this.nearPath.geometry.drawRange.count : 0
  }

  dispose(): void {
    this.marker.geometry.dispose()
    this.marker.material.dispose()
    this.path.geometry.dispose()
    this.path.material.dispose()
    this.nearPath.geometry.dispose()
    this.nearPath.material.dispose()
  }
}
