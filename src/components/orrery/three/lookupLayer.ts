/**
 * An object looked up at JPL and shown in the orrery (#145): one marker on its Horizons
 * samples (Hermite, hidden where none cover the date, never extrapolated) and its orbit
 * line. The line is in heliocentric au and goes through the scene's scale, so it is
 * rebuilt only when the object or the scale mode changes, never per frame.
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

import { stateAt } from '@/lib/orrery/ephemeris'
import type { LookupOrbit } from '@/lib/orrery/lookupTrack'
import type { Vec3 } from '@/lib/orrery/scale'
import { LANES } from '@/lib/palette'
import type { SampledSpan } from '@/schemas/orreryBodies'

/** Its own colour: the "Space objects" lane, apart from the amber approaches and cyan craft. */
const LOOKUP_HEX = LANES.space.emit
/** The marker's radius before the renderer's px floor, scene units. */
const MARKER_RADIUS = 0.02
/** An osculating loop is 256 points, closed with one more. */
const MAX_PATH_POINTS = 600

export interface LookupData {
  key: string
  label: string
  /** Horizons samples, position and velocity (/api/trajectory). */
  fine: SampledSpan
  orbit: LookupOrbit | null
}

export class LookupLayer {
  readonly marker = new Mesh(
    new SphereGeometry(1, 16, 12),
    new MeshBasicMaterial({ color: new Color(LOOKUP_HEX) }),
  )
  readonly path: Line<BufferGeometry, LineBasicMaterial>
  private data: LookupData | null = null
  /** Heliocentric position now, au; null where no sample covers the date. */
  private helio: Vec3 | null = null
  /** The data and scale mode the line was last built for. */
  private builtFor: { data: LookupData; mode: string } | null = null

  constructor() {
    this.marker.name = 'lookup-marker'
    this.marker.visible = false
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(MAX_PATH_POINTS * 3), 3),
    )
    geometry.setDrawRange(0, 0)
    this.path = new Line(
      geometry,
      new LineBasicMaterial({ color: new Color(LOOKUP_HEX), transparent: true, opacity: 0.55 }),
    )
    this.path.name = 'lookup-path'
    this.path.visible = false
  }

  set(data: LookupData | null): void {
    this.data = data
    this.builtFor = null
  }

  has(key: string): boolean {
    return this.data?.key === key
  }

  /** Place the marker for a date and (re)build the line if the object or mode changed. */
  place(jd: number, toScene: (p: Vec3) => Vector3, mode: string): void {
    const s = this.data ? stateAt({ fine: this.data.fine, coarse: null }, jd) : null
    this.helio = s ? s.position : null
    this.marker.visible = s !== null
    if (s) {
      this.marker.position.copy(toScene(s.position))
      this.marker.scale.setScalar(MARKER_RADIUS)
    }
    const data = this.data
    if (data && (this.builtFor?.data !== data || this.builtFor.mode !== mode)) {
      this.buildPath(data, toScene)
      this.builtFor = { data, mode }
    }
    this.path.visible = this.marker.visible && this.path.geometry.drawRange.count > 1
  }

  private buildPath(data: LookupData, toScene: (p: Vec3) => Vector3): void {
    const attr = this.path.geometry.getAttribute('position') as Float32BufferAttribute
    const points = data.orbit?.points ?? []
    const closed = data.orbit?.kind === 'osculating' && points[0] ? [...points, points[0]] : points
    const n = Math.min(MAX_PATH_POINTS, closed.length)
    for (let i = 0; i < n; i += 1) {
      const v = toScene(closed[i] ?? { x: 0, y: 0, z: 0 })
      attr.setXYZ(i, v.x, v.y, v.z)
    }
    attr.needsUpdate = true
    this.path.geometry.setDrawRange(0, n)
    if (n > 0) this.path.geometry.computeBoundingSphere()
  }

  /** Near Earth the marker joins the Earth frame (#92), as the craft do. */
  placeNear(move: (helio: Vec3) => Vector3 | null): void {
    if (!this.helio || !this.marker.visible) return
    const p = move(this.helio)
    if (p) this.marker.position.copy(p)
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

  dispose(): void {
    this.marker.geometry.dispose()
    this.marker.material.dispose()
    this.path.geometry.dispose()
    this.path.material.dispose()
  }
}
