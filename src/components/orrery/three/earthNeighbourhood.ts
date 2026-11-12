/**
 * Earth's neighbourhood in the orrery (#92): the Earth frame (earthFrame.ts) and what
 * lives in it. The close approaches, the L1/L2 craft (moved by the renderer through
 * `placeNear`), the Sun–Earth line and a marker at L1, where the solar-wind monitors
 * sit. Everything relative to Earth uses Horizons' Earth; without it the frame stays
 * closed and the approaches are hidden (asteroids.ts says why).
 */
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Vector3,
} from 'three'

import { earthFrameOffset, L1_DISTANCE_KM } from '@/lib/orrery/earthFrame'
import { stateAt } from '@/lib/orrery/ephemeris'
import type { Vec3 } from '@/lib/orrery/scale'
import { AU_KM } from '@/lib/orrery/units'
import { HUD_HEX } from '@/lib/palette'
import type { OrreryTrack } from '@/schemas/orreryBodies'

import { AsteroidLayer, type EarthFrameView } from './asteroidLayer'

/** The L1 marker's size as a share of Earth's drawn radius (the renderer keeps a px floor). */
const L1_SHARE = 0.12

export class EarthNeighbourhood {
  readonly group = new Group()
  readonly asteroids = new AsteroidLayer()
  /** A faint line from the Sun to Earth, and a small diamond at L1 on it. */
  readonly l1 = new Mesh(
    new OctahedronGeometry(1),
    new MeshBasicMaterial({ color: new Color(HUD_HEX) }),
  )
  private readonly sunLine: Line<BufferGeometry, LineBasicMaterial>
  private earthTrack: OrreryTrack | null = null
  private sunLineOn = true
  private t = 0
  private earthHelio: Vec3 | null = null

  constructor() {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3))
    this.sunLine = new Line(
      geometry,
      new LineBasicMaterial({ color: new Color(HUD_HEX), transparent: true, opacity: 0.3 }),
    )
    this.sunLine.name = 'sun-earth-line'
    this.l1.name = 'L1'
    this.l1.visible = false
    this.group.add(this.asteroids.group, this.sunLine, this.l1)
  }

  setEarthTrack(track: OrreryTrack | null): void {
    this.earthTrack = track
    this.asteroids.setEarthTrack(track)
  }

  /** The Space weather switch: the Sun–Earth line and the L1 marker. */
  setSunLineVisible(on: boolean): void {
    this.sunLineOn = on
  }

  /** How open the frame is now, 0 to 1. */
  openness(): number {
    return this.t
  }

  /** Horizons' Earth at a date, or null: without it the frame stays closed. */
  private earthAt(jd: number): Vec3 | null {
    const fine = this.earthTrack?.fine
    return fine ? (stateAt({ fine, coarse: null }, jd)?.position ?? null) : null
  }

  /** Whether Horizons' Earth covers a date, so the frame may open. */
  coversEarth(jd: number): boolean {
    return this.earthAt(jd) !== null
  }

  /**
   * The frame for this moment, `t` open (the renderer's earthOpenness), around Earth
   * drawn at `earthRadius`. Closed without Horizons' Earth at the date.
   */
  view(
    jd: number,
    earth: Vector3,
    earthRadius: number,
    t: number,
    toScene: (pos: Vec3) => Vector3,
  ): EarthFrameView {
    this.earthHelio = this.earthAt(jd)
    this.t = this.earthHelio && earthRadius > 0 ? t : 0
    return { earth, radius: earthRadius, t: this.t, toScene }
  }

  /**
   * Where something at a heliocentric position is drawn in the frame, or null when it is
   * farther than `maxAu` from Earth (left at its true place: at 0.1 au the frame and
   * place3d nearly agree, 0.14 against 0.11 scene units).
   */
  placeNear(helio: Vec3, frame: EarthFrameView, maxAu = Infinity): Vector3 | null {
    const e = this.earthHelio
    if (!e) return null
    const rel = { x: helio.x - e.x, y: helio.y - e.y, z: helio.z - e.z }
    if (Math.hypot(rel.x, rel.y, rel.z) > maxAu) return null
    const trueOffset = frame.toScene(helio).sub(frame.earth).length()
    const o = earthFrameOffset(rel, frame.radius, trueOffset, frame.t)
    return new Vector3(frame.earth.x + o.x, frame.earth.y + o.y, frame.earth.z + o.z)
  }

  /**
   * Where something at a heliocentric position at another date is drawn in the frame
   * (#151): relative to Earth at that date, not now, so a looked-up object's pass is drawn
   * as it moves past Earth. Null without Horizons' Earth at that date or beyond `maxAu`.
   */
  placeNearAt(helio: Vec3, jd: number, frame: EarthFrameView, maxAu = Infinity): Vector3 | null {
    const e = this.earthAt(jd)
    if (!e) return null
    const rel = { x: helio.x - e.x, y: helio.y - e.y, z: helio.z - e.z }
    if (Math.hypot(rel.x, rel.y, rel.z) > maxAu) return null
    const trueOffset = frame.toScene(helio).sub(frame.toScene(e)).length()
    const o = earthFrameOffset(rel, frame.radius, trueOffset, frame.t)
    return new Vector3(frame.earth.x + o.x, frame.earth.y + o.y, frame.earth.z + o.z)
  }

  /** Place the approaches, the Sun–Earth line and the L1 marker. */
  place(jd: number, frame: EarthFrameView): void {
    this.asteroids.place(jd, frame)
    const attr = this.sunLine.geometry.getAttribute('position') as Float32BufferAttribute
    attr.setXYZ(1, frame.earth.x, frame.earth.y, frame.earth.z)
    attr.needsUpdate = true
    this.sunLine.geometry.computeBoundingSphere()
    this.sunLine.visible = this.sunLineOn
    const e = this.earthHelio
    const l1 =
      e && this.sunLineOn ? this.placeNear(towardSun(e, L1_DISTANCE_KM / AU_KM), frame) : null
    this.l1.visible = l1 !== null
    if (l1) {
      this.l1.position.copy(l1)
      this.l1.scale.setScalar(frame.radius * L1_SHARE)
    }
  }

  dispose(): void {
    this.asteroids.dispose()
    this.sunLine.geometry.dispose()
    this.sunLine.material.dispose()
    this.l1.geometry.dispose()
    this.l1.material.dispose()
  }
}

/** The point `au` from Earth along the line to the Sun (heliocentric, au). */
function towardSun(earth: Vec3, au: number): Vec3 {
  const r = Math.hypot(earth.x, earth.y, earth.z)
  const k = r > 0 ? (r - au) / r : 0
  return { x: earth.x * k, y: earth.y * k, z: earth.z * k }
}
