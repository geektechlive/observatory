/**
 * Spacecraft in the orrery (#93): one cyan marker per craft (cyan is for spacecraft only,
 * palette.ts), placed from JPL Horizons samples, and the selected craft's whole-mission
 * trajectory (spec Part 14): the past solid, the future dashed. A craft with no sample
 * covering the date is hidden, never extrapolated.
 */
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three'

import { stateAt, trajectoryPoints } from '@/lib/orrery/ephemeris'
import type { Vec3 } from '@/lib/orrery/scale'
import { ISS_HEX } from '@/lib/palette'
import type { OrreryBodyGroup, OrreryTrack } from '@/schemas/orreryBodies'

import { type CraftFilter, DEFAULT_CRAFT_FILTER } from '../craftFilter'

interface CraftEntry {
  key: string
  label: string
  naifId: string
  group: OrreryBodyGroup
  track: OrreryTrack
  mesh: Mesh
  /** Sampled position now (au), or null when no data covers the date. */
  helio: Vec3 | null
  stalk: Stalk
}

/** A craft's line to the ecliptic and the tick where it lands (#93). */
interface Stalk {
  north: Line
  south: Line
  tick: LineSegments
  /** Craft end and plane end, scene space. */
  top: Vector3
  foot: Vector3
}

/** What a test (or the renderer) can see of a craft's stalk. */
export interface StalkView {
  visible: boolean
  south: boolean
  top: Vector3
  foot: Vector3
}

/** A craft marker never draws smaller or larger than these radii, px. */
export const CRAFT_MIN_PX = 3
export const CRAFT_MAX_PX = 5

/**
 * A craft marker's radius, scene units: its scene size, kept between CRAFT_MIN_PX and
 * CRAFT_MAX_PX on screen. Without the cap, a planet focused close up drew a nearby
 * craft's marker 20 px across (#107: Psyche beside Mars).
 */
export function craftRadius(sceneRadius: number, unitsPerPx: number): number {
  return Math.min(CRAFT_MAX_PX * unitsPerPx, Math.max(sceneRadius, CRAFT_MIN_PX * unitsPerPx))
}

/** A stalk is drawn only for craft more than this far off the ecliptic, au. */
export const STALK_MIN_OFFSET_AU = 1
/** Tick half-size as a share of the foot's distance from the Sun, scene units (min 0.05). */
const TICK_SHARE = 0.025

export interface CraftMarker {
  key: string
  label: string
  naifId: string
  group: OrreryBodyGroup
  mesh: Mesh
  /** Distance from the Sun now, au. */
  sunAu: number
}

/** Only these categories are drawn as craft; Earth and the Moon are handled elsewhere. */
const isCraft = (t: OrreryTrack) => t.category === 'spacecraft' || t.category === 'space_telescope'

export class CraftLayer {
  readonly markers = new Group()
  readonly paths = new Group()
  /** Out-of-plane stalks (#93), shown and hidden with the Orbits switch. */
  readonly stalks = new Group()
  private readonly entries = new Map<string, CraftEntry>()
  private readonly geometry = new SphereGeometry(1, 12, 8)
  private readonly material = new MeshBasicMaterial({ color: new Color(ISS_HEX) })
  private readonly stalkMaterial = new LineBasicMaterial({
    color: new Color(ISS_HEX),
    transparent: true,
    opacity: 0.32,
  })
  private readonly stalkSouthMaterial = new LineDashedMaterial({
    color: new Color(ISS_HEX),
    transparent: true,
    opacity: 0.32,
    dashSize: 0.12,
    gapSize: 0.1,
  })
  private filter: CraftFilter = DEFAULT_CRAFT_FILTER
  private dsnIds: ReadonlySet<string> = new Set()
  private trajectoryKey: string | null = null
  private trajectory: { past: Line; future: Line; jds: number[] } | null = null

  private readonly toScene: (pos: Vec3) => Vector3

  constructor(toScene: (pos: Vec3) => Vector3) {
    this.toScene = toScene
  }

  /** Replace the craft from a new payload; markers are reused by id. */
  setTracks(tracks: readonly OrreryTrack[]): void {
    const keep = new Set<string>()
    for (const track of tracks) {
      if (!isCraft(track)) continue
      keep.add(track.id)
      const existing = this.entries.get(track.id)
      if (existing) {
        existing.track = track
        continue
      }
      const mesh = new Mesh(this.geometry, this.material)
      mesh.name = track.id
      mesh.visible = false
      this.markers.add(mesh)
      const stalk = this.makeStalk()
      this.stalks.add(stalk.north, stalk.south, stalk.tick)
      this.entries.set(track.id, {
        key: track.id,
        label: track.name,
        naifId: track.naifId,
        group: track.group,
        track,
        mesh,
        helio: null,
        stalk,
      })
    }
    for (const [key, entry] of this.entries) {
      if (keep.has(key)) continue
      this.markers.remove(entry.mesh)
      this.stalks.remove(entry.stalk.north, entry.stalk.south, entry.stalk.tick)
      for (const line of [entry.stalk.north, entry.stalk.south, entry.stalk.tick]) {
        line.geometry.dispose()
      }
      this.entries.delete(key)
    }
    this.rebuildTrajectory()
  }

  setFilter(filter: CraftFilter): void {
    this.filter = filter
  }

  setDsnIds(ids: ReadonlySet<string>): void {
    this.dsnIds = ids
  }

  private passes(entry: CraftEntry): boolean {
    const g = entry.group
    const groupOn = g === 'deep-space' || g === 'mission' || g === 'l1' ? this.filter[g] : false
    return groupOn && (!this.filter.dsnOnly || this.dsnIds.has(entry.naifId))
  }

  private makeStalk(): Stalk {
    const line = (material: LineBasicMaterial | LineDashedMaterial) => {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3))
      const l = new Line(geometry, material)
      l.visible = false
      return l
    }
    const tickGeometry = new BufferGeometry()
    tickGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(12), 3))
    const tick = new LineSegments(tickGeometry, this.stalkMaterial)
    tick.visible = false
    return {
      north: line(this.stalkMaterial),
      south: line(this.stalkSouthMaterial),
      tick,
      top: new Vector3(),
      foot: new Vector3(),
    }
  }

  /** Point a craft's stalk from its marker straight to the ecliptic (scene y = 0). */
  private placeStalk(entry: CraftEntry): void {
    const { stalk, helio, mesh } = entry
    const show = mesh.visible && helio !== null && Math.abs(helio.z) > STALK_MIN_OFFSET_AU
    const south = helio !== null && helio.z < 0
    stalk.north.visible = show && !south
    stalk.south.visible = show && south
    stalk.tick.visible = show
    if (!show) return
    stalk.top.copy(mesh.position)
    stalk.foot.set(mesh.position.x, 0, mesh.position.z)
    const line = south ? stalk.south : stalk.north
    const pos = line.geometry.getAttribute('position') as Float32BufferAttribute
    pos.setXYZ(0, stalk.top.x, stalk.top.y, stalk.top.z)
    pos.setXYZ(1, stalk.foot.x, stalk.foot.y, stalk.foot.z)
    pos.needsUpdate = true
    line.geometry.computeBoundingSphere()
    if (south) line.computeLineDistances()
    // A small cross where the stalk lands, in the plane.
    const s = Math.max(0.05, TICK_SHARE * Math.hypot(stalk.foot.x, stalk.foot.z))
    const t = stalk.tick.geometry.getAttribute('position') as Float32BufferAttribute
    const { x, z } = stalk.foot
    t.setXYZ(0, x - s, 0, z)
    t.setXYZ(1, x + s, 0, z)
    t.setXYZ(2, x, 0, z - s)
    t.setXYZ(3, x, 0, z + s)
    t.needsUpdate = true
    stalk.tick.geometry.computeBoundingSphere()
  }

  /** The Orbits switch hides the stalks with the orbit lines. */
  setStalksVisible(on: boolean): void {
    this.stalks.visible = on
  }

  /** A craft's stalk, for tests and checks. */
  stalkFor(key: string): StalkView | undefined {
    const e = this.entries.get(key)
    if (!e) return undefined
    const { stalk } = e
    return {
      visible: stalk.north.visible || stalk.south.visible,
      south: stalk.south.visible,
      top: stalk.top.clone(),
      foot: stalk.foot.clone(),
    }
  }

  /** Move every craft to a Julian date; hide those with no data or filtered out. */
  place(jd: number, radius: number): void {
    for (const entry of this.entries.values()) {
      const s = stateAt(entry.track, jd)
      entry.helio = s ? s.position : null
      entry.mesh.visible = s !== null && this.passes(entry)
      if (s) entry.mesh.position.copy(this.toScene(s.position))
      entry.mesh.scale.setScalar(radius)
      this.placeStalk(entry)
    }
    this.updateSplit(jd)
  }

  /** The craft drawn now. */
  visible(): CraftMarker[] {
    const out: CraftMarker[] = []
    for (const e of this.entries.values()) {
      if (!e.mesh.visible || !e.helio) continue
      out.push({
        key: e.key,
        label: e.label,
        naifId: e.naifId,
        group: e.group,
        mesh: e.mesh,
        sunAu: Math.hypot(e.helio.x, e.helio.y, e.helio.z),
      })
    }
    return out
  }

  /** Where a craft is drawn now, or null when it is hidden. */
  position(key: string): Vector3 | null {
    const e = this.entries.get(key)
    return e?.mesh.visible ? e.mesh.position.clone() : null
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  /** Draw (or stop drawing) a craft's whole-mission trajectory. */
  setTrajectory(key: string | null): void {
    if (key === this.trajectoryKey) return
    this.trajectoryKey = key
    this.rebuildTrajectory()
  }

  /** Re-place the trajectory through the current scale (call on a scale-mode change). */
  rebuildTrajectory(): void {
    this.disposeTrajectory()
    const entry = this.trajectoryKey ? this.entries.get(this.trajectoryKey) : undefined
    if (!entry) return
    const points = trajectoryPoints(entry.track)
    if (points.length < 2) return
    const flat: number[] = []
    for (const p of points) {
      const v = this.toScene(p)
      flat.push(v.x, v.y, v.z)
    }
    const pastGeometry = new BufferGeometry()
    pastGeometry.setAttribute('position', new Float32BufferAttribute(flat, 3))
    const futureGeometry = new BufferGeometry()
    futureGeometry.setAttribute('position', new Float32BufferAttribute(flat, 3))
    const color = new Color(ISS_HEX)
    const past = new Line(
      pastGeometry,
      new LineBasicMaterial({ color, transparent: true, opacity: 0.6 }),
    )
    const future = new Line(
      futureGeometry,
      new LineDashedMaterial({
        color,
        dashSize: 0.18,
        gapSize: 0.12,
        transparent: true,
        opacity: 0.5,
      }),
    )
    future.computeLineDistances()
    past.name = 'trajectory-past'
    future.name = 'trajectory-future'
    this.paths.add(past, future)
    this.trajectory = { past, future, jds: points.map((p) => p.jd) }
  }

  /** Split the path at the sim date: solid behind it, dashed ahead. */
  private updateSplit(jd: number): void {
    const t = this.trajectory
    if (!t) return
    let k = 0
    while (k < t.jds.length && (t.jds[k] ?? Infinity) <= jd) k += 1
    const n = t.jds.length
    t.past.geometry.setDrawRange(0, k)
    t.future.geometry.setDrawRange(Math.max(0, k - 1), n - Math.max(0, k - 1))
  }

  /** For the e2e checks: how many points each half of the path draws. */
  trajectoryCounts(): { past: number; future: number } | null {
    const t = this.trajectory
    if (!t) return null
    return { past: t.past.geometry.drawRange.count, future: t.future.geometry.drawRange.count }
  }

  private disposeTrajectory(): void {
    const t = this.trajectory
    if (!t) return
    for (const line of [t.past, t.future]) {
      this.paths.remove(line)
      line.geometry.dispose()
      ;(line.material as LineBasicMaterial).dispose()
    }
    this.trajectory = null
  }

  dispose(): void {
    this.disposeTrajectory()
    for (const e of this.entries.values()) {
      for (const line of [e.stalk.north, e.stalk.south, e.stalk.tick]) line.geometry.dispose()
    }
    this.geometry.dispose()
    this.material.dispose()
    this.stalkMaterial.dispose()
    this.stalkSouthMaterial.dispose()
  }
}
