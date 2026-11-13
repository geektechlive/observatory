/**
 * Comets and the interstellar objects (#99): a marker each on its Horizons samples
 * (smallBodyView.ts: hidden where none cover the date, never extrapolated) and its line.
 * A comet's line is its orbit from the elements, a line only; 1I, 2I and 3I follow their
 * sampled paths. Lines are in heliocentric au through the scene's scale, rebuilt only when
 * the data or the scale mode changes, never per frame. Every group starts switched off.
 *
 * The dwarf planets (#99 item 8) are a third group: a marker on their coarse span, and the
 * closed orbit from their elements, drawn whenever the group is on, even where the
 * marker is hidden outside the span.
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
  dwarfMoonRelative,
  dwarfMoonShown,
  entryPath,
  entryState,
  isDwarfMoon,
  type OrreryEntry,
  type OrreryEntryGroup,
} from '@/lib/orrery/dwarfView'
import { toScaleMoonPosition } from '@/lib/orrery/moonPlacement'
import type { Vec3 } from '@/lib/orrery/scale'
import { DWARF_HEX, LANES } from '@/lib/palette'

/**
 * Comets in the hydro lane's pale ice blue; the interstellar objects in the "Space
 * objects" lane, as a looked-up object is. Cyan is spacecraft, amber the close
 * approaches and red hazard only. The dwarf planets (#99 item 8) have their own token.
 */
const HEX: Record<OrreryEntryGroup, string> = {
  comets: LANES.hydro.emit,
  interstellar: LANES.space.emit,
  // The bright asteroids (#99 item 4): the thermal lane's orange (the geophysical gold sat
  // too close to the close approaches' amber), apart from comets' ice blue, the visitors'
  // violet and cyan craft. Orange is also nearer the hazard red than gold was: close
  // approaches are small markers beside Earth, asteroids labelled dots out in the belt.
  asteroids: LANES.thermal.emit,
  dwarfs: DWARF_HEX,
}
/** The marker's radius before the renderer's px clamp, scene units. */
const MARKER_RADIUS = 0.02
const LINE_OPACITY = 0.5

export type SmallBodyGroups = Record<OrreryEntryGroup, boolean>

interface Item {
  entry: OrreryEntry
  mesh: Mesh<SphereGeometry, MeshBasicMaterial>
  line: Line<BufferGeometry, LineBasicMaterial>
  /** Heliocentric position now, au; null where no sample covers the date. */
  helio: Vec3 | null
  /** Charon only: its vector from the Pluto barycentre now, au, or null. */
  rel: Vec3 | null
}

export class SmallBodyLayer {
  readonly markers = new Group()
  readonly paths = new Group()
  private readonly sphere = new SphereGeometry(1, 16, 12)
  private readonly markerMaterials: Record<OrreryEntryGroup, MeshBasicMaterial> = {
    comets: markerMaterial('comets'),
    interstellar: markerMaterial('interstellar'),
    asteroids: markerMaterial('asteroids'),
    dwarfs: markerMaterial('dwarfs'),
  }
  private readonly lineMaterials: Record<OrreryEntryGroup, LineBasicMaterial> = {
    comets: lineMaterial('comets'),
    interstellar: lineMaterial('interstellar'),
    asteroids: lineMaterial('asteroids'),
    dwarfs: lineMaterial('dwarfs'),
  }
  private items = new Map<string, Item>()
  private groups: SmallBodyGroups = {
    comets: false,
    interstellar: false,
    asteroids: false,
    dwarfs: false,
  }
  /** The scale mode the lines were last built for; '' means rebuild. */
  private builtMode = ''

  constructor() {
    this.markers.name = 'small-body-markers'
    this.paths.name = 'small-body-paths'
  }

  /** New data: lines are rebuilt, and those no longer in it are freed. */
  set(entries: readonly OrreryEntry[]): void {
    this.clear()
    for (const entry of entries) {
      const mesh = new Mesh(this.sphere, this.markerMaterials[entry.group])
      mesh.name = `small-body:${entry.key}`
      mesh.visible = false
      const line = new Line(new BufferGeometry(), this.lineMaterials[entry.group])
      line.visible = false
      this.markers.add(mesh)
      this.paths.add(line)
      this.items.set(entry.key, { entry, mesh, line, helio: null, rel: null })
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
      const s = on ? entryState(item.entry, jd) : null
      item.helio = s ? s.position : null
      if (isDwarfMoon(item.entry)) {
        // Placed around its planet as drawn, after the px clamp (placeMoons).
        item.rel = s ? (dwarfMoonRelative(item.entry, jd)?.position ?? null) : null
        item.mesh.visible = false
        item.line.visible = false
        continue
      }
      item.mesh.visible = s !== null
      if (s) {
        item.mesh.position.copy(toScene(s.position))
        item.mesh.scale.setScalar(MARKER_RADIUS)
      }
      if (rebuild) buildLine(item, toScene)
      // A dwarf planet's orbit stays drawn where its span ends; a comet's line goes with it.
      const lineOn = item.entry.group === 'dwarfs' ? on : item.mesh.visible
      item.line.visible = lineOn && item.line.geometry.drawRange.count > 1
    }
    this.builtMode = mode
  }

  /** Near Earth a marker joins the Earth frame (#92), as the craft do. */
  placeNear(move: (helio: Vec3) => Vector3 | null): void {
    for (const item of this.items.values()) {
      if (!item.helio || !item.mesh.visible || isDwarfMoon(item.entry)) continue
      const p = move(item.helio)
      if (p) item.mesh.position.copy(p)
    }
  }

  /**
   * Charon (#99), each frame after the planets' px clamp: around Pluto's marker as drawn,
   * to Pluto's own scale (toScaleMoonPosition), and only with Pluto or Charon focused
   * (dwarfMoonShown). Its radius before the renderer's clamp is Pluto's drawn radius times
   * the true ratio of the two.
   */
  placeMoons(focus: string | null): void {
    for (const item of this.items.values()) {
      const { entry, mesh, rel } = item
      if (!isDwarfMoon(entry)) continue
      const parent = this.items.get(entry.parent.key)?.mesh
      mesh.visible = false
      if (rel === null || !parent?.visible || !dwarfMoonShown(entry, focus)) continue
      mesh.visible = true
      const r = parent.scale.x
      const p = toScaleMoonPosition(parent.position, rel, r, entry.spec.parentRadiusKm)
      mesh.position.set(p.x, p.y, p.z)
      mesh.scale.setScalar((r * entry.spec.radiusKm) / entry.spec.parentRadiusKm)
    }
  }

  /** Charon's marker while drawn, for the renderer's px clamp. */
  moonMeshes(): Mesh[] {
    const out: Mesh[] = []
    for (const item of this.items.values()) {
      if (isDwarfMoon(item.entry) && item.mesh.visible) out.push(item.mesh)
    }
    return out
  }

  /**
   * Where it is drawn now, or null when it is hidden or not known. For Charon, wherever
   * its samples cover the date: the Pluto barycentre it circles, so the camera frames the
   * pair (and can fly there before Charon itself shows).
   */
  position(key: string): Vector3 | null {
    const item = this.items.get(key)
    if (item && isDwarfMoon(item.entry)) {
      return item.rel ? this.position(item.entry.parent.key) : null
    }
    return item?.mesh.visible ? item.mesh.position.clone() : null
  }

  /** Its heliocentric position now, au, or null. */
  helio(key: string): Vec3 | null {
    return this.items.get(key)?.helio ?? null
  }

  /** The drawn markers, for the px clamp, the labels and picking. */
  visible(): { key: string; label: string; group: OrreryEntryGroup; mesh: Mesh }[] {
    const out: { key: string; label: string; group: OrreryEntryGroup; mesh: Mesh }[] = []
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

function markerMaterial(group: OrreryEntryGroup): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(HEX[group]) })
}

function lineMaterial(group: OrreryEntryGroup): LineBasicMaterial {
  return new LineBasicMaterial({
    color: new Color(HEX[group]),
    transparent: true,
    opacity: LINE_OPACITY,
  })
}

/** An object's line in scene space: a buffer sized to its own points. */
function buildLine(item: Item, toScene: (p: Vec3) => Vector3): void {
  const path = entryPath(item.entry)
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
