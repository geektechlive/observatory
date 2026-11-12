/**
 * Comets and the interstellar objects (#99): a marker each on its Horizons samples
 * (smallBodyView.ts: hidden where none cover the date, never extrapolated) and its line.
 * A comet's line is its orbit from the elements, a line only; 1I, 2I and 3I follow their
 * sampled paths. Lines are in heliocentric au through the scene's scale, rebuilt only when
 * the data or the scale mode changes, never per frame. Both groups start switched off.
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

import type { Vec3 } from '@/lib/orrery/scale'
import {
  type SmallBodyEntry,
  type SmallBodyGroup,
  smallBodyPath,
  smallBodyState,
} from '@/lib/orrery/smallBodyView'
import { LANES } from '@/lib/palette'

/**
 * Comets in the hydro lane's pale ice blue; the interstellar objects in the "Space
 * objects" lane, as a looked-up object is. Cyan is spacecraft, amber the close
 * approaches and red hazard only.
 */
const HEX: Record<SmallBodyGroup, string> = {
  comets: LANES.hydro.emit,
  interstellar: LANES.space.emit,
}
/** The marker's radius before the renderer's px clamp, scene units. */
const MARKER_RADIUS = 0.02
const LINE_OPACITY = 0.5

export type SmallBodyGroups = Record<SmallBodyGroup, boolean>

interface Item {
  entry: SmallBodyEntry
  mesh: Mesh<SphereGeometry, MeshBasicMaterial>
  line: Line<BufferGeometry, LineBasicMaterial>
  /** Heliocentric position now, au; null where no sample covers the date. */
  helio: Vec3 | null
}

export class SmallBodyLayer {
  readonly markers = new Group()
  readonly paths = new Group()
  private readonly sphere = new SphereGeometry(1, 16, 12)
  private readonly markerMaterials: Record<SmallBodyGroup, MeshBasicMaterial> = {
    comets: new MeshBasicMaterial({ color: new Color(HEX.comets) }),
    interstellar: new MeshBasicMaterial({ color: new Color(HEX.interstellar) }),
  }
  private readonly lineMaterials: Record<SmallBodyGroup, LineBasicMaterial> = {
    comets: new LineBasicMaterial({
      color: new Color(HEX.comets),
      transparent: true,
      opacity: LINE_OPACITY,
    }),
    interstellar: new LineBasicMaterial({
      color: new Color(HEX.interstellar),
      transparent: true,
      opacity: LINE_OPACITY,
    }),
  }
  private items = new Map<string, Item>()
  private groups: SmallBodyGroups = { comets: false, interstellar: false }
  /** The scale mode the lines were last built for; '' means rebuild. */
  private builtMode = ''

  constructor() {
    this.markers.name = 'small-body-markers'
    this.paths.name = 'small-body-paths'
  }

  /** New data: lines are rebuilt, and those no longer in it are freed. */
  set(entries: readonly SmallBodyEntry[]): void {
    this.clear()
    for (const entry of entries) {
      const mesh = new Mesh(this.sphere, this.markerMaterials[entry.group])
      mesh.name = `small-body:${entry.key}`
      mesh.visible = false
      const line = new Line(new BufferGeometry(), this.lineMaterials[entry.group])
      line.visible = false
      this.markers.add(mesh)
      this.paths.add(line)
      this.items.set(entry.key, { entry, mesh, line, helio: null })
    }
    this.builtMode = ''
  }

  setGroups(groups: SmallBodyGroups): void {
    this.groups = { ...groups }
  }

  has(key: string): boolean {
    return this.items.has(key)
  }

  /** Known, and its group is switched on (drawn wherever its samples cover the date). */
  groupOn(key: string): boolean {
    const item = this.items.get(key)
    return item !== undefined && this.groups[item.entry.group]
  }

  /** Drawn now: its group is on and a sample covers the date. */
  drawn(key: string): boolean {
    return this.items.get(key)?.mesh.visible === true
  }

  /** Place every marker for a date, and (re)build the lines if the mode changed. */
  place(jd: number, toScene: (p: Vec3) => Vector3, mode: string): void {
    const rebuild = this.builtMode !== mode
    for (const item of this.items.values()) {
      const on = this.groups[item.entry.group]
      const s = on ? smallBodyState(item.entry.body, jd) : null
      item.helio = s ? s.position : null
      item.mesh.visible = s !== null
      if (s) {
        item.mesh.position.copy(toScene(s.position))
        item.mesh.scale.setScalar(MARKER_RADIUS)
      }
      if (rebuild) buildLine(item, toScene)
      item.line.visible = item.mesh.visible && item.line.geometry.drawRange.count > 1
    }
    this.builtMode = mode
  }

  /** Near Earth a marker joins the Earth frame (#92), as the craft do. */
  placeNear(move: (helio: Vec3) => Vector3 | null): void {
    for (const item of this.items.values()) {
      if (!item.helio || !item.mesh.visible) continue
      const p = move(item.helio)
      if (p) item.mesh.position.copy(p)
    }
  }

  /** Where it is drawn now, or null when it is hidden or not known. */
  position(key: string): Vector3 | null {
    const item = this.items.get(key)
    return item?.mesh.visible ? item.mesh.position.clone() : null
  }

  /** Its heliocentric position now, au, or null. */
  helio(key: string): Vec3 | null {
    return this.items.get(key)?.helio ?? null
  }

  /** The drawn markers, for the px clamp, the labels and picking. */
  visible(): { key: string; label: string; group: SmallBodyGroup; mesh: Mesh }[] {
    const out: { key: string; label: string; group: SmallBodyGroup; mesh: Mesh }[] = []
    for (const item of this.items.values()) {
      if (!item.mesh.visible) continue
      out.push({
        key: item.entry.key,
        label: item.entry.label,
        group: item.entry.group,
        mesh: item.mesh,
      })
    }
    return out
  }

  /** Points in one object's drawn line (0 when hidden), for the tests. */
  pathPoints(key: string): number {
    const line = this.items.get(key)?.line
    return line?.visible ? line.geometry.drawRange.count : 0
  }

  /** One point of an object's line, scene space, for the tests. */
  linePoint(key: string, index: number): Vector3 | null {
    const line = this.items.get(key)?.line
    if (!line || index >= line.geometry.drawRange.count) return null
    const attr = line.geometry.getAttribute('position') as Float32BufferAttribute
    return new Vector3(attr.getX(index), attr.getY(index), attr.getZ(index))
  }

  /** Markers and lines drawn now, for the e2e checks. */
  counts(): { drawn: number; paths: number } {
    let drawn = 0
    let paths = 0
    for (const item of this.items.values()) {
      if (item.mesh.visible) drawn += 1
      if (item.line.visible) paths += 1
    }
    return { drawn, paths }
  }

  private clear(): void {
    for (const item of this.items.values()) {
      item.line.geometry.dispose()
      this.markers.remove(item.mesh)
      this.paths.remove(item.line)
    }
    this.items = new Map()
  }

  dispose(): void {
    this.clear()
    this.sphere.dispose()
    for (const m of Object.values(this.markerMaterials)) m.dispose()
    for (const m of Object.values(this.lineMaterials)) m.dispose()
  }
}

/** An object's line in scene space: a buffer sized to its own points. */
function buildLine(item: Item, toScene: (p: Vec3) => Vector3): void {
  const path = smallBodyPath(item.entry.body)
  const points = path.closed && path.points[0] ? [...path.points, path.points[0]] : path.points
  const array = new Float32Array(points.length * 3)
  points.forEach((p, i) => {
    const v = toScene(p)
    array[i * 3] = v.x
    array[i * 3 + 1] = v.y
    array[i * 3 + 2] = v.z
  })
  const geometry = item.line.geometry
  geometry.setAttribute('position', new Float32BufferAttribute(array, 3))
  geometry.setDrawRange(0, points.length)
  if (points.length > 0) geometry.computeBoundingSphere()
}
