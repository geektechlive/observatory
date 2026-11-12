/**
 * This fortnight's close approaches (#92): one small sphere per object, amber, red when
 * JPL lists it as potentially hazardous, placed around Earth in the Earth frame
 * (earthFrame.ts) from Horizons samples minus Horizons' Earth. The selected one draws its
 * ±10-day path through the same frame. An object with no sample covering the date is
 * hidden, never extrapolated. Meshes and the path buffer are made once and reused.
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
  SphereGeometry,
  Vector3,
} from 'three'

import {
  approachPasses,
  approachPathTimes,
  asteroidGeocentric,
  DEFAULT_NEO_FILTER,
  type NeoFilter,
  shortName,
} from '@/lib/orrery/asteroids'
import { earthFrameOffset } from '@/lib/orrery/earthFrame'
import type { Vec3 } from '@/lib/orrery/scale'
import { STATUS_HEX } from '@/lib/palette'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import type { OrreryApproach } from '@/schemas/orreryNeo'

/** An asteroid's radius as a share of Earth's drawn radius (the renderer keeps a px floor). */
export const ASTEROID_SHARE = 0.09
/** Samples in the longest path (±10 days at 3 h is 161). */
const PATH_POINTS = 200

/** Where Earth is drawn this frame, and how open its frame is. */
export interface EarthFrameView {
  earth: Vector3
  /** Earth's drawn radius, scene units. */
  radius: number
  /** 0 = everything at its true place, 1 = the open frame. */
  t: number
  /** The renderer's heliocentric-to-scene placement (place3d or linear). */
  toScene: (pos: Vec3) => Vector3
}

export interface AsteroidMarker {
  key: string
  label: string
  pha: boolean
  mesh: Mesh
}

interface Entry {
  approach: OrreryApproach
  mesh: Mesh
}

export class AsteroidLayer {
  readonly group = new Group()
  private readonly entries = new Map<string, Entry>()
  private readonly geometry = new SphereGeometry(1, 12, 8)
  private readonly amber = new MeshBasicMaterial({ color: new Color(STATUS_HEX.watch) })
  private readonly red = new MeshBasicMaterial({ color: new Color(STATUS_HEX.hazard) })
  private readonly path: Line<BufferGeometry, LineBasicMaterial>
  private earthTrack: OrreryTrack | null = null
  private filter: NeoFilter = DEFAULT_NEO_FILTER
  private selected: string | null = null
  private readonly scratch = new Vector3()

  constructor() {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(PATH_POINTS * 3), 3),
    )
    geometry.setDrawRange(0, 0)
    this.path = new Line(
      geometry,
      new LineBasicMaterial({
        color: new Color(STATUS_HEX.watch),
        transparent: true,
        opacity: 0.45,
      }),
    )
    this.path.name = 'asteroid-path'
    this.path.visible = false
    this.group.add(this.path)
  }

  /** Replace the approaches; meshes are reused by id. */
  setApproaches(list: readonly OrreryApproach[]): void {
    const keep = new Set<string>()
    for (const approach of list) {
      keep.add(approach.id)
      const existing = this.entries.get(approach.id)
      if (existing) {
        existing.approach = approach
        existing.mesh.material = approach.pha ? this.red : this.amber
        continue
      }
      const mesh = new Mesh(this.geometry, approach.pha ? this.red : this.amber)
      mesh.name = approach.id
      mesh.visible = false
      this.group.add(mesh)
      this.entries.set(approach.id, { approach, mesh })
    }
    for (const [key, entry] of this.entries) {
      if (keep.has(key)) continue
      this.group.remove(entry.mesh)
      this.entries.delete(key)
    }
  }

  /** Horizons' Earth from /api/orrery-bodies: without it nothing is placed. */
  setEarthTrack(track: OrreryTrack | null): void {
    this.earthTrack = track
  }

  setFilter(filter: NeoFilter): void {
    this.filter = filter
  }

  setSelected(key: string | null): void {
    this.selected = key && this.entries.has(key) ? key : null
  }

  /** Place every object for a date around Earth as drawn now. */
  place(jd: number, frame: EarthFrameView): void {
    for (const { approach, mesh } of this.entries.values()) {
      const at = this.shown(approach, jd) && this.placeAt(approach, jd, frame, mesh.position)
      mesh.visible = at
      if (at) mesh.scale.setScalar(frame.radius * ASTEROID_SHARE)
    }
    this.placePath(frame)
  }

  /** Through the filter, or chosen. */
  private shown(approach: OrreryApproach, jd: number): boolean {
    return approachPasses(approach, this.filter, jd) || approach.id === this.selected
  }

  /**
   * Whether place() draws this object at a date, asked before it runs: a looked-up object
   * that is also this approach hides its own copy while this one is drawn (#216).
   */
  drawsAt(key: string, jd: number): boolean {
    const entry = this.entries.get(key)
    if (!entry || !this.shown(entry.approach, jd)) return false
    return asteroidGeocentric(entry.approach, this.earthTrack, jd) !== null
  }

  /** Write an object's scene position for a date into `out`; false with no data. */
  private placeAt(
    approach: OrreryApproach,
    jd: number,
    frame: EarthFrameView,
    out: Vector3,
  ): boolean {
    const g = asteroidGeocentric(approach, this.earthTrack, jd)
    if (!g) return false
    const trueOffset = this.scratch.copy(frame.toScene(g.helio)).sub(frame.earth).length()
    const o = earthFrameOffset(g.rel, frame.radius, trueOffset, frame.t)
    out.set(frame.earth.x + o.x, frame.earth.y + o.y, frame.earth.z + o.z)
    return true
  }

  /** The selected object's sampled pass, through the frame as it is now. */
  private placePath(frame: EarthFrameView): void {
    const entry = this.selected ? this.entries.get(this.selected) : undefined
    const attr = this.path.geometry.getAttribute('position') as Float32BufferAttribute
    let n = 0
    if (entry) {
      const p = new Vector3()
      // Dense around closest approach, daily elsewhere (#136).
      for (const t of approachPathTimes(entry.approach, PATH_POINTS)) {
        if (!this.placeAt(entry.approach, t, frame, p)) continue
        attr.setXYZ(n, p.x, p.y, p.z)
        n += 1
      }
      this.path.material.color.set(entry.approach.pha ? STATUS_HEX.hazard : STATUS_HEX.watch)
    }
    attr.needsUpdate = n > 0
    this.path.geometry.setDrawRange(0, n)
    if (n > 0) this.path.geometry.computeBoundingSphere()
    this.path.visible = n > 1
  }

  visible(): AsteroidMarker[] {
    const out: AsteroidMarker[] = []
    for (const { approach, mesh } of this.entries.values()) {
      if (mesh.visible) {
        out.push({ key: approach.id, label: shortName(approach.name), pha: approach.pha, mesh })
      }
    }
    return out
  }

  position(key: string): Vector3 | null {
    const e = this.entries.get(key)
    return e?.mesh.visible ? e.mesh.position.clone() : null
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  /** Points in the selected object's path, for the e2e checks. */
  pathPoints(): number {
    return this.path.visible ? this.path.geometry.drawRange.count : 0
  }

  dispose(): void {
    this.geometry.dispose()
    this.amber.dispose()
    this.red.dispose()
    this.path.geometry.dispose()
    this.path.material.dispose()
  }
}
