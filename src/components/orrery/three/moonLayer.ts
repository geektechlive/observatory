/**
 * Moons in the orrery (#107): small lit spheres around their planet as drawn, placed by
 * moonScenePosition's exaggerated local scale (not to scale; the inspector says so). They
 * show only near their planet: when it is the focused planet, or, with no planet focused,
 * once it is in view and drawn at least MOON_SHOW_PX in radius. Zoomed out they would all
 * sit on the planet's dot. A moon with no sample covering the date is hidden, never
 * extrapolated.
 */
import type { Vector3 } from 'three'
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three'

import { earthFramePosition } from '@/lib/orrery/earthFrame'
import { type PlanetName, PLANETS } from '@/lib/orrery/elements'
import { SATURN_RINGS } from '@/lib/orrery/imagery'
import { MOON_ORBIT_POINTS, moonOrbit, type MoonOrbitKind } from '@/lib/orrery/moonOrbit'
import { moonScenePosition } from '@/lib/orrery/moonPlacement'
import { type MoonBody, moonRelative } from '@/lib/orrery/moonState'
import { BODY_HEX, HUD_HEX } from '@/lib/palette'

/**
 * With no planet focused, a planet's moons show once it draws at least this radius, px.
 * Measured on the 1440 px stage (2026-11-07): presets draw planets at 26 px at most (the
 * Sun preset's Jupiter); a focused planet draws at 42.
 */
export const MOON_SHOW_PX = 36
/** A moon's radius as a share of its planet's drawn radius (the renderer keeps a px floor). */
export const MOON_SHARE = 0.14

const PLANET_NAMES = new Set<string>(PLANETS)

/**
 * Whether a planet's moons are drawn. A focused planet shows only its own: with Mars
 * focused, Jupiter still draws 42 px (exaggerated radii against compressed distances),
 * and its moons would crowd the view. Otherwise: in view and big enough.
 */
export function moonsShown(
  parent: string,
  focus: string | null,
  parentRadiusPx: number,
  inView = true,
): boolean {
  if (focus !== null && PLANET_NAMES.has(focus)) return focus === parent
  return inView && parentRadiusPx >= MOON_SHOW_PX
}

/**
 * How far out the moon zone starts, in planet radii: Saturn's rings reach 2.4 of its
 * radii, so without this Enceladus would sit inside them (it is outside in reality).
 */
export function moonClearance(parent: PlanetName): number {
  return parent === 'Saturn' ? SATURN_RINGS.outerKm / SATURN_RINGS.saturnRadiusKm : 1
}

/** Where a planet is drawn this frame. */
export interface DrawnParent {
  position: Vector3
  /** Drawn radius, scene units (after the minimum on-screen size). */
  radius: number
  radiusPx: number
  /** On the stage (in front of the camera, inside the canvas). Defaults to true. */
  inView?: boolean
}

export interface MoonMarker {
  key: string
  label: string
  parent: PlanetName
  mesh: Mesh
}

interface Entry {
  body: MoonBody
  mesh: Mesh
  /** Its orbit loop (#107): local points at unit radius, placed and scaled each frame. */
  line: LineLoop<BufferGeometry, LineBasicMaterial>
  /** The date the loop was built for, and how it was made. */
  orbitJd: number
  orbitKind: MoonOrbitKind | null
}

const ORIGIN = { x: 0, y: 0, z: 0 }

/**
 * Where a moon sits around its planet as drawn. Earth's Moon uses the Earth frame (#92),
 * the scale the L1/L2 craft and close approaches use, so their order on screen is true;
 * the others use the moons' own log scale. Both are linear in the radius.
 */
function placementFor(parent: PlanetName): typeof moonScenePosition {
  return parent === 'Earth' ? earthFramePosition : moonScenePosition
}

export class MoonLayer {
  readonly group = new Group()
  /** Moon orbit loops, which the renderer files with the planets' orbits (Orbits switch). */
  readonly orbits = new Group()
  private readonly entries = new Map<string, Entry>()
  private readonly geometry = new SphereGeometry(1, 16, 12)
  // Lit by the Sun's point light, so each moon shows its phase.
  private readonly material = new MeshLambertMaterial({
    color: new Color(BODY_HEX['Moon'] ?? HUD_HEX),
  })
  // The planets' orbit treatment (OrreryRenderer.buildScene): the body's colour, faint.
  private readonly lineMaterial = new LineBasicMaterial({
    color: new Color(BODY_HEX['Moon'] ?? HUD_HEX),
    transparent: true,
    opacity: 0.32,
  })

  /** Replace the moons; meshes are reused by key. */
  setMoons(bodies: readonly MoonBody[]): void {
    const keep = new Set<string>()
    for (const body of bodies) {
      keep.add(body.key)
      const existing = this.entries.get(body.key)
      if (existing) {
        existing.body = body
        continue
      }
      const mesh = new Mesh(this.geometry, this.material)
      mesh.name = body.key
      mesh.visible = false
      this.group.add(mesh)
      // One fixed-size buffer per loop, rewritten in place: no geometry churn as it moves.
      const geometry = new BufferGeometry()
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(new Float32Array(MOON_ORBIT_POINTS * 3), 3),
      )
      const line = new LineLoop(geometry, this.lineMaterial)
      line.name = `${body.key}:orbit`
      line.visible = false
      this.orbits.add(line)
      this.entries.set(body.key, { body, mesh, line, orbitJd: Number.NaN, orbitKind: null })
    }
    for (const [key, entry] of this.entries) {
      if (keep.has(key)) continue
      this.group.remove(entry.mesh)
      this.orbits.remove(entry.line)
      entry.line.geometry.dispose()
      this.entries.delete(key)
    }
  }

  /** The Orbits switch. */
  setOrbitsVisible(on: boolean): void {
    this.orbits.visible = on
  }

  /** Rewrite a moon's loop for a date, at unit radius around the origin. */
  private buildOrbit(entry: Entry, jd: number): void {
    const orbit = moonOrbit(entry.body, jd)
    entry.orbitJd = jd
    entry.orbitKind = orbit?.kind ?? null
    if (!orbit) return
    const attr = entry.line.geometry.getAttribute('position') as Float32BufferAttribute
    orbit.points.forEach((rel, i) => {
      // Both placements are linear in the radius: at radius 1 around the origin, then
      // the line's position and scale put it around the planet as drawn.
      const p = placementFor(entry.body.parent)(ORIGIN, rel, 1)
      attr.setXYZ(i, p.x, p.y, p.z)
    })
    attr.needsUpdate = true
    entry.line.geometry.setDrawRange(0, orbit.points.length)
    entry.line.geometry.computeBoundingSphere()
  }

  /** Place every moon for a date around its planet as drawn now. */
  place(
    jd: number,
    parentOf: (name: PlanetName) => DrawnParent | null,
    focus: string | null,
  ): void {
    for (const entry of this.entries.values()) {
      const { body, mesh, line } = entry
      const parent = parentOf(body.parent)
      const state =
        parent && moonsShown(body.parent, focus, parent.radiusPx, parent.inView ?? true)
          ? moonRelative(body, jd)
          : null
      mesh.visible = state !== null && parent !== null
      line.visible = false
      if (!state || !parent) continue
      const r = parent.radius * moonClearance(body.parent)
      const p = placementFor(body.parent)(parent.position, state.position, r)
      mesh.position.set(p.x, p.y, p.z)
      mesh.scale.setScalar(parent.radius * MOON_SHARE)
      // Rebuild the loop once the date has moved a grid step, so the moon stays on it.
      const step = body.periodDays / MOON_ORBIT_POINTS
      if (!(Math.abs(jd - entry.orbitJd) < step)) this.buildOrbit(entry, jd)
      line.visible = entry.orbitKind !== null
      line.position.copy(parent.position)
      line.scale.setScalar(r)
    }
  }

  /** Moon loops drawn now (the Orbits switch included). */
  drawnOrbits(): number {
    if (!this.orbits.visible) return 0
    let n = 0
    for (const e of this.entries.values()) if (e.line.visible) n += 1
    return n
  }

  /** A moon's orbit loop, for tests and checks. */
  orbitLine(key: string): LineLoop<BufferGeometry, LineBasicMaterial> | undefined {
    return this.entries.get(key)?.line
  }

  /** How a moon's loop was made: sampled from Horizons, or the osculating ellipse. */
  orbitKind(key: string): MoonOrbitKind | null {
    return this.entries.get(key)?.orbitKind ?? null
  }

  visible(): MoonMarker[] {
    const out: MoonMarker[] = []
    for (const { body, mesh } of this.entries.values()) {
      if (mesh.visible) out.push({ key: body.key, label: body.name, parent: body.parent, mesh })
    }
    return out
  }

  /** Where a moon is drawn now, or null when it is hidden. */
  position(key: string): Vector3 | null {
    const e = this.entries.get(key)
    return e?.mesh.visible ? e.mesh.position.clone() : null
  }

  parentOf(key: string): PlanetName | undefined {
    return this.entries.get(key)?.body.parent
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
    for (const e of this.entries.values()) e.line.geometry.dispose()
    this.lineMaterial.dispose()
  }
}
