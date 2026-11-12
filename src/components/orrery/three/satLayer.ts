/**
 * The orrery's satellites (#98): every loaded CelesTrak object as one point in the Earth
 * frame, drawn straight from the worker's buffers. The vertex shader does what
 * satScenePosition does on the CPU (TEME to scene axes, then the frame's scale around
 * Earth as drawn), so the main thread never touches the positions: a new pass only
 * swaps the attribute's array. Two draws share one geometry: crisp points up close, a
 * soft haze when pulled back (satView.ts says which, and how strongly).
 *
 * The positions are TEME from SGP4. Earth's map in the orrery has a real spin rate but
 * no fitted prime meridian (#105), so a satellite is in the right place in space but
 * not over the right spot on the drawn map.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  RingGeometry,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  Vector3,
} from 'three'

import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import { SAT_OK } from '@/lib/orbit/bulk/satStatus'
import { SAT_GROUPS, type SatCategory, type SatGroupId } from '@/lib/orbit/satCatalog'
import { EARTH_FRAME_SPREAD, EARTH_RADIUS_KM, GEO_RADII } from '@/lib/orrery/earthFrame'
import { SatController, type SatSnapshot, type SatSource } from '@/lib/orrery/satController'
import {
  isSatKey,
  type Mat3,
  SAT_KEY_PREFIX,
  type SatDisplay,
  satDisplay,
  satKey,
  satPointStrength,
  satScenePosition,
  satViewDistance,
  temeToScene,
} from '@/lib/orrery/satView'
import { BONE_HEX, SAT_CATEGORY_HEX, STATUS_HEX } from '@/lib/palette'

export { isSatKey, satKey } from '@/lib/orrery/satView'
/** Point sizes, CSS px: up close, and in the haze. */
const POINT_PX = 2
/** The points never quite opaque, so Earth still shows through the low-orbit shell. */
const POINT_ALPHA = 0.9
const HAZE_PX = 7
/** The haze is many faint points adding up; this is one point's strength at full haze. */
const HAZE_GAIN = 0.12
/** The chosen satellite's marker, as a share of Earth's drawn radius (the renderer floors it). */
const MARKER_SHARE = 0.04
/** A re-entry ring's radius against the marker's (the renderer floors it in px too). */
const RING_SHARE = MARKER_SHARE * 2
/** At most this many rings: TIP lists a few objects a week, never hundreds. */
const MAX_RINGS = 32
/** After Earth and the points: a ring that skips the depth test must not be painted under them. */
const RING_RENDER_ORDER = 10

const CATEGORIES: readonly SatCategory[] = [
  'station',
  'starlink',
  'navigation',
  'weather',
  'science',
  'other',
  'debris',
]
const CATEGORY_INDEX = new Map(CATEGORIES.map((c, i) => [c, i]))
const GROUP_CATEGORY = new Map(SAT_GROUPS.map((g) => [g.id, g.category]))

const VERTEX = /* glsl */ `
uniform mat3 uTeme;
uniform vec3 uEarth;
uniform float uRadius;
uniform float uSize;
uniform vec3 uColors[${String(CATEGORIES.length)}];
attribute float status;
attribute float category;
varying vec3 vColor;
const float RE = ${EARTH_RADIUS_KM.toFixed(1)};
const float GEO = ${GEO_RADII.toFixed(6)};
const float SPREAD = ${EARTH_FRAME_SPREAD.toFixed(1)};
void main() {
  if (status > 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec3 p = uTeme * position;
  float km = length(p);
  float x = km / RE;
  float r = x <= GEO ? x : GEO + SPREAD * log(x / GEO) / log(10.0);
  vec3 world = uEarth + p * (uRadius * r / km);
  vColor = uColors[int(category + 0.5)];
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  gl_PointSize = uSize;
}
`

const FRAGMENT = /* glsl */ `
uniform float uAlpha;
uniform float uSoft;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = uSoft > 0.5 ? (1.0 - d) * (1.0 - d) : 1.0;
  gl_FragColor = vec4(vColor, a * uAlpha);
  #include <colorspace_fragment>
}
`

function material(soft: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTeme: { value: new Matrix3() },
      uEarth: { value: new Vector3() },
      uRadius: { value: 1 },
      uSize: { value: POINT_PX },
      uColors: { value: CATEGORIES.map((c) => new Color(SAT_CATEGORY_HEX[c])) },
      uAlpha: { value: 0 },
      uSoft: { value: soft ? 1 : 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    // Not additive: about 19,000 haze points over Earth's disc added up to a white disc.
    blending: NormalBlending,
  })
}

export type SatMode = 'points' | 'fading' | 'haze' | 'hidden'

/** The satellites' state for the page: the controller's, and how they show now. */
export type SatViewState = SatSnapshot & { mode: SatMode }

/** What the inspector shows for a satellite. */
export interface SatInfo {
  key: string
  noradId: string
  name: string
  group: SatGroupId
  epochMs: number
  /** TEME km now, or null when it has no position at this date. */
  teme: [number, number, number] | null
  /**
   * A pass covers the loaded objects, so a null `teme` means no position at this date.
   * False after a field change until a pass lands (#206); absent means true.
   */
  computed?: boolean
  /** Not computed yet, and a pass is on its way from the worker (#206). */
  pending?: boolean
}

export interface SatPlace {
  jd: number
  simMs: number
  wallMs: number
  /** Sim seconds per wall second, signed. */
  rate: number
  earth: Vector3
  /** Earth's drawn radius, scene units. */
  radius: number
  /** How open the Earth frame is, 0 to 1. */
  openness: number
  camera: Vector3
  pixelRatio: number
  /** The stage's width over height (satViewDistance); 1 when unknown. */
  aspect?: number
  /** Earth's drawn radius on screen, CSS px (#198); full-strength points when unknown. */
  earthPx?: number
}

export class SatLayer {
  readonly group = new Group()
  readonly marker: Mesh<SphereGeometry, MeshBasicMaterial>
  private readonly ctl: SatController
  private geometry = new BufferGeometry()
  private readonly pointsMaterial = material(false)
  private readonly hazeMaterial = material(true)
  private readonly points: Points<BufferGeometry, ShaderMaterial>
  private readonly haze: Points<BufferGeometry, ShaderMaterial>
  private attachedVersion = -1
  private attached: Float32Array | null = null
  private teme: Mat3 = temeToScene(2_451_545)
  private readonly earth = new Vector3()
  private radius = 1
  private display: SatDisplay = { pointsAlpha: 0, hazeAlpha: 0, pickable: false, cadenceMs: null }
  private selected: string | null = null
  /** Objects Space-Track predicts will re-enter soon (#101), ringed in amber. */
  private flagged: readonly string[] = []
  private readonly rings: Mesh<RingGeometry, MeshBasicMaterial>[] = []
  private readonly ringGeometry = new RingGeometry(0.78, 1, 32)
  private readonly ringMaterial = new MeshBasicMaterial({
    color: new Color(STATUS_HEX.watch),
    side: DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    // A re-entering object sits lower than the ring is wide, so Earth would cut it into
    // arcs (#199). It is a marker, always drawn whole; renderOrder keeps it after Earth.
    depthTest: false,
  })
  /** The camera's distance from Earth this frame, Earth radii across the narrow side. */
  private re = Number.POSITIVE_INFINITY

  /** `source` is the data (the page passes /api/orrery-sats and the shared worker). */
  constructor(onChange: () => void, source: SatSource) {
    this.ctl = new SatController(source, onChange)
    this.points = new Points(this.geometry, this.pointsMaterial)
    this.haze = new Points(this.geometry, this.hazeMaterial)
    for (const p of [this.points, this.haze]) {
      // The shader moves every point; the geometry's own bounds mean nothing.
      p.frustumCulled = false
      p.visible = false
    }
    this.points.name = 'satellites'
    this.haze.name = 'satellite-haze'
    this.haze.renderOrder = -1
    this.marker = new Mesh(
      new SphereGeometry(1, 12, 8),
      new MeshBasicMaterial({ color: new Color(BONE_HEX) }),
    )
    this.marker.name = 'satellite-marker'
    this.marker.visible = false
    this.group.add(this.haze, this.points, this.marker)
  }

  setEnabled(groups: ReadonlySet<SatGroupId>): void {
    this.ctl.setEnabled(groups)
  }

  /** The objects to ring as predicted to re-enter soon, by NORAD id (#101). */
  setFlagged(noradIds: readonly string[]): void {
    this.flagged = noradIds.slice(0, MAX_RINGS)
  }

  /** The re-entry rings drawn now, for the renderer's px floor and the canvas's data. */
  flagRings(): Mesh<RingGeometry, MeshBasicMaterial>[] {
    return this.rings.filter((r) => r.visible)
  }

  /** The chosen satellite by key (`sat:25544`), or null. */
  setSelected(key: string | null): void {
    this.selected = key && isSatKey(key) ? key.slice(SAT_KEY_PREFIX.length) : null
  }

  /** Each drawn frame: tick the controller, then place everything from the current pass. */
  place(p: SatPlace): void {
    this.radius = p.radius
    this.earth.copy(p.earth)
    const re =
      p.radius > 0
        ? satViewDistance(p.camera.distanceTo(p.earth) / p.radius, p.aspect ?? 1)
        : Number.POSITIVE_INFINITY
    this.re = re
    this.display = satDisplay(re, p.rate, p.openness)
    this.ctl.tick({
      near: p.openness > 0,
      cadenceMs: this.display.cadenceMs,
      simMs: p.simMs,
      wallMs: p.wallMs,
    })
    this.teme = temeToScene(p.jd)
    this.syncGeometry()
    const m = this.teme
    for (const mat of [this.pointsMaterial, this.hazeMaterial]) {
      const u = mat.uniforms
      ;(u['uTeme']?.value as Matrix3).set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8])
      ;(u['uEarth']?.value as Vector3).copy(p.earth)
      if (u['uRadius']) u['uRadius'].value = p.radius
    }
    const drawn = this.attached !== null
    this.setStrength(
      this.pointsMaterial,
      this.display.pointsAlpha * POINT_ALPHA * satPointStrength(p.earthPx ?? Infinity),
      POINT_PX * p.pixelRatio,
    )
    this.setStrength(this.hazeMaterial, this.display.hazeAlpha * HAZE_GAIN, HAZE_PX * p.pixelRatio)
    this.points.visible = drawn && this.display.pointsAlpha > 0
    this.haze.visible = drawn && this.display.hazeAlpha > 0
    const at = this.selectedPosition()
    this.marker.visible = at !== null && this.display.pointsAlpha > 0
    if (at) {
      this.marker.position.copy(at)
      this.marker.scale.setScalar(p.radius * MARKER_SHARE)
    }
    this.placeRings(p)
  }

  /** A ring, facing the camera, on each flagged object that is drawn as a point now. */
  private placeRings(p: SatPlace): void {
    let used = 0
    if (this.display.pointsAlpha > 0) {
      for (const id of this.flagged) {
        const at = this.positionOf(id)
        if (!at) continue
        const ring = this.ring(used)
        ring.position.copy(at)
        ring.lookAt(p.camera)
        ring.scale.setScalar(p.radius * RING_SHARE)
        ring.visible = true
        used += 1
      }
    }
    for (let i = used; i < this.rings.length; i += 1) {
      const ring = this.rings[i]
      if (ring) ring.visible = false
    }
  }

  private ring(i: number): Mesh<RingGeometry, MeshBasicMaterial> {
    const had = this.rings[i]
    if (had) return had
    const ring = new Mesh(this.ringGeometry, this.ringMaterial)
    ring.name = 'satellite-reentry'
    ring.renderOrder = RING_RENDER_ORDER
    this.rings.push(ring)
    this.group.add(ring)
    return ring
  }

  private setStrength(mat: ShaderMaterial, alpha: number, size: number): void {
    const u = mat.uniforms
    if (u['uAlpha']) u['uAlpha'].value = alpha
    if (u['uSize']) u['uSize'].value = size
  }

  /** Point the geometry at the current pass; rebuild it only when the field changes size. */
  private syncGeometry(): void {
    const frame = this.ctl.frame()
    const field = this.ctl.field()
    if (!frame || !field) {
      this.attached = null
      return
    }
    if (field.version !== this.attachedVersion) {
      this.geometry.dispose()
      this.geometry = new BufferGeometry()
      const category = new Uint8Array(field.ids.length)
      for (const span of field.groups) {
        const c = CATEGORY_INDEX.get(GROUP_CATEGORY.get(span.group) ?? 'other') ?? 0
        category.fill(c, span.start, span.start + span.count)
      }
      this.geometry.setAttribute('position', new BufferAttribute(frame.positions, 3))
      this.geometry.setAttribute('status', new BufferAttribute(frame.status, 1))
      this.geometry.setAttribute('category', new BufferAttribute(category, 1))
      // Three sorts transparent objects by their bounds' centre and would compute them
      // from the raw TEME km (NaN for objects without a position). Fixed bounds instead.
      this.geometry.boundingSphere = new Sphere(new Vector3(), Number.MAX_SAFE_INTEGER)
      this.points.geometry = this.geometry
      this.haze.geometry = this.geometry
      this.attachedVersion = field.version
      this.attached = frame.positions
      return
    }
    if (frame.positions === this.attached) return
    // A new pass for the same field: same lengths, so swap the arrays and re-upload.
    const pos = this.geometry.getAttribute('position') as BufferAttribute
    const status = this.geometry.getAttribute('status') as BufferAttribute
    pos.array = frame.positions
    status.array = frame.status
    pos.needsUpdate = true
    status.needsUpdate = true
    this.attached = frame.positions
  }

  private indexOf(noradId: string): number {
    return this.ctl.field()?.ids.indexOf(noradId) ?? -1
  }

  private temeAt(i: number): [number, number, number] | null {
    const frame = this.ctl.frame()
    if (!frame || frame.status[i] !== SAT_OK) return null
    const x = frame.positions[i * 3]
    const y = frame.positions[i * 3 + 1]
    const z = frame.positions[i * 3 + 2]
    return x === undefined || y === undefined || z === undefined ? null : [x, y, z]
  }

  /** Where the chosen satellite is drawn now, or null. */
  selectedPosition(): Vector3 | null {
    return this.selected ? this.positionOf(this.selected) : null
  }

  /** Where a loaded object is drawn now, by NORAD id, or null. */
  positionOf(noradId: string): Vector3 | null {
    const teme = this.temeAt(this.indexOf(noradId))
    const p = teme && satScenePosition(teme, this.teme, this.earth, this.radius)
    return p ? new Vector3(p.x, p.y, p.z) : null
  }

  /** The chosen satellite's key and label, when it is drawn. */
  selectedLabel(): { key: string; label: string } | null {
    if (!this.selected || !this.marker.visible) return null
    const field = this.ctl.field()
    const i = this.indexOf(this.selected)
    const name = i >= 0 ? field?.names[i] : undefined
    return name ? { key: satKey(this.selected), label: name } : null
  }

  /**
   * The satellite nearest a canvas point within `radiusPx`, when points are pickable.
   * `project` gives a scene point's canvas position, or null when out of view.
   */
  pick(
    x: number,
    y: number,
    radiusPx: number,
    project: (v: Vector3) => { x: number; y: number } | null,
  ): string | null {
    const field = this.ctl.field()
    const frame = this.ctl.frame()
    if (!this.display.pickable || !field || !frame) return null
    let best: string | null = null
    let bestD = radiusPx
    const v = new Vector3()
    for (let i = 0; i < field.ids.length; i += 1) {
      const teme = this.temeAt(i)
      const p = teme && satScenePosition(teme, this.teme, this.earth, this.radius)
      if (!p) continue
      const s = project(v.set(p.x, p.y, p.z))
      if (!s) continue
      const d = Math.hypot(s.x - x, s.y - y)
      if (d <= bestD) {
        bestD = d
        best = field.ids[i] ?? null
      }
    }
    return best === null ? null : satKey(best)
  }

  /** A satellite's details for the inspector, or null when it is not loaded. */
  info(key: string): SatInfo | null {
    if (!isSatKey(key)) return null
    const id = key.slice(SAT_KEY_PREFIX.length)
    const field = this.ctl.field()
    const i = this.indexOf(id)
    if (!field || i < 0) return null
    const span = field.groups.find((g) => i >= g.start && i < g.start + g.count)
    const computed = this.ctl.frame() !== null
    return {
      key,
      noradId: id,
      name: field.names[i] ?? id,
      group: span?.group ?? 'other',
      epochMs: field.epochMs[i] ?? Number.NaN,
      teme: this.temeAt(i),
      computed,
      pending: !computed && this.ctl.passing(),
    }
  }

  /** Every loaded object in a group, for search. */
  listGroup(group: SatGroupId): { key: string; name: string }[] {
    const field = this.ctl.field()
    const span = field?.groups.find((g) => g.group === group)
    if (!field || !span) return []
    return field.ids
      .slice(span.start, span.start + span.count)
      .map((id, k) => ({ key: satKey(id), name: field.names[span.start + k] ?? id }))
  }

  /** The camera's distance from Earth as the layer judged it this frame, Earth radii. */
  distance(): number {
    return this.re
  }

  /** Whether the points are close enough to pick now. */
  pickable(): boolean {
    return this.display.pickable
  }

  /** The loaded field's names, ids, groups, orbit classes and launches (the browser, #158). */
  field(): SatFieldInfo | null {
    return this.ctl.field()
  }

  snapshot(): SatSnapshot {
    return this.ctl.snapshot()
  }

  /** The current display mode, for the canvas's data attributes. */
  mode(): SatMode {
    const { pointsAlpha, hazeAlpha, pickable } = this.display
    if (pointsAlpha > 0) return pickable ? 'points' : 'fading'
    return hazeAlpha > 0 ? 'haze' : 'hidden'
  }

  dispose(): void {
    this.ctl.dispose()
    this.geometry.dispose()
    this.pointsMaterial.dispose()
    this.hazeMaterial.dispose()
    this.marker.geometry.dispose()
    this.marker.material.dispose()
    this.ringGeometry.dispose()
    this.ringMaterial.dispose()
  }
}
