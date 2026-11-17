/**
 * The fly-in's surroundings (#261): the Sun, the planets, the moons and the real stars at their
 * true places, in the close-up scene's units (the model's robust radius is 1 unit, and
 * `metresPerUnit` says what that is in metres). The craft sits at the origin. One point light
 * at the Sun's true place lights everything, so every body shows its true phase from wherever
 * the camera is; a faint ambient keeps a night side's shape readable (owner's choice,
 * 2026-11-17). Axes are the orrery's: ecliptic (x, y, z) to scene (x, z, -y).
 */
import {
  AmbientLight,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three'

import type { BodyName } from '@/lib/orrery/bodies'
import { BRIGHT_STAR_STRIDE, BRIGHT_STARS } from '@/lib/orrery/brightStars'
import type { PlanetName } from '@/lib/orrery/elements'
import { BODY_IMAGERY, poleEcliptic, spinAngle } from '@/lib/orrery/imagery'
import { earthSkinToScene } from '@/lib/orrery/satView'
import type { Surroundings, TrueBody } from '@/lib/orrery/surroundings'
import { angularRadius, type Km3 } from '@/lib/orrery/trueScale'
import { BODY_HEX, HUD_HEX } from '@/lib/palette'

/** The orrery's own sunlight and ambient (OrreryRenderer), so the planets read the same. */
const SUNLIGHT_INTENSITY = Math.PI * 1.1
/** The faint fill on a night side: a quarter of the orrery's ambient. */
export const FILL_INTENSITY = Math.PI * 0.03
/**
 * The Sun's face, unlit, as an eye would see it: the palette's Sun (a gold label colour)
 * taken most of the way to white. Derived here, not a palette entry, so the first load
 * carries nothing for it. (The live SUVI image is in extreme ultraviolet.)
 */
const SUN_FACE_WHITENESS = 0.8
const sunFace = () =>
  new Color(BODY_HEX['Sun'] ?? HUD_HEX).lerp(new Color(1, 1, 1), SUN_FACE_WHITENESS)
/** A moon with no colour of its own. */
const MOON_HEX = BODY_HEX['Moon'] ?? HUD_HEX
/** A planet's map loads once it is this big from the craft, radians: about 0.06°, a px or two. */
const SKIN_MIN_RADIUS = 1e-3
/** Stars sit on a sphere this many units round the camera: inside the far plane. */
export const STAR_SPHERE = 1e14
/** Star point sizes, px, by magnitude band: brighter than 0, 1, 2, then the rest. */
const STAR_BANDS: readonly { maxMag: number; px: number }[] = [
  { maxMag: 0, px: 3.2 },
  { maxMag: 1, px: 2.6 },
  { maxMag: 2, px: 2 },
  { maxMag: Infinity, px: 1.5 },
]

const UP = new Vector3(0, 1, 0)

/** Ecliptic km to scene units: (x, z, -y), metres over metres-per-unit. */
export function toScene(relKm: Km3, metresPerUnit: number): Vector3 {
  const k = 1000 / metresPerUnit
  return new Vector3(relKm[0] * k, relKm[2] * k, -relKm[1] * k)
}

/** A star's colour from its B-V index: blue-white near -0.3, white near 0.3, orange past 1.4. */
export function starColour(bv: number, vmag: number): Color {
  const t = Math.max(0, Math.min(1, (bv + 0.3) / 1.9))
  const c = new Color().setRGB(
    0.72 + 0.28 * Math.min(1, t * 1.8),
    0.8 + 0.2 * (1 - Math.abs(t - 0.35) * 1.5),
    1 - 0.55 * t,
  )
  // Fainter stars dimmer: 2.512 per magnitude, held so the faintest still show.
  const k = Math.max(0.35, Math.min(1, 2.512 ** -(vmag - 0.5) * 1.6))
  return c.multiplyScalar(k)
}

/** The star field: one Points per magnitude band, around the origin (followCamera moves it). */
function buildStars(): Group {
  const group = new Group()
  group.name = 'stars'
  for (const [i, band] of STAR_BANDS.entries()) {
    const min = i === 0 ? -Infinity : (STAR_BANDS[i - 1]?.maxMag ?? -Infinity)
    const positions: number[] = []
    const colours: number[] = []
    for (let s = 0; s < BRIGHT_STARS.length; s += BRIGHT_STAR_STRIDE) {
      const [x = 0, y = 0, z = 0, v = 0, bv = 0] = BRIGHT_STARS.slice(s, s + BRIGHT_STAR_STRIDE)
      if (v <= min || v > band.maxMag) continue
      positions.push(x * STAR_SPHERE, z * STAR_SPHERE, -y * STAR_SPHERE)
      const c = starColour(bv, v)
      colours.push(c.r, c.g, c.b)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
    const material = new PointsMaterial({
      size: band.px,
      sizeAttenuation: false,
      vertexColors: true,
      depthWrite: false,
      depthTest: false,
    })
    const points = new Points(geometry, material)
    points.frustumCulled = false
    points.renderOrder = -1
    group.add(points)
  }
  return group
}

interface Drawn {
  mesh: Mesh<SphereGeometry, MeshBasicMaterial | MeshLambertMaterial>
  body: TrueBody
  /** Whether its map has been asked for (only once it looks big enough, #261). */
  skinAsked: boolean
}

export interface TrueSkyOptions {
  /** What one scene unit (the model's robust radius) is, in metres. */
  metresPerUnit: number
  /** Loads a planet map (the scene's own context: textures can't be shared across contexts). */
  loadTexture: (url: string) => Promise<Texture>
  /** A map arrived: draw again. */
  onReady: () => void
}

/** The surroundings, built once and moved to each new `Surroundings`. */
export class TrueSky {
  readonly group = new Group()
  private readonly sunLight = new PointLight(new Color(1, 1, 1), SUNLIGHT_INTENSITY, 0, 0)
  private readonly fill = new AmbientLight(new Color(1, 1, 1), FILL_INTENSITY)
  private readonly stars = buildStars()
  private readonly geometry = new SphereGeometry(1, 64, 32)
  private readonly drawn = new Map<string, Drawn>()
  private readonly options: TrueSkyOptions
  private readonly textures: Texture[] = []
  private disposed = false

  constructor(options: TrueSkyOptions) {
    this.options = options
    this.group.name = 'true-sky'
    this.group.add(this.sunLight, this.fill, this.stars)
  }

  /** Move every body to where `s` puts it; bodies new to `s` are built, missing ones hidden. */
  update(s: Surroundings): void {
    const seen = new Set<string>()
    for (const body of s.bodies) {
      seen.add(body.key)
      const d = this.drawn.get(body.key) ?? this.build(body)
      d.body = body
      d.mesh.visible = true
      d.mesh.position.copy(toScene(body.relKm, this.options.metresPerUnit))
      d.mesh.scale.setScalar((body.radiusKm * 1000) / this.options.metresPerUnit)
      this.orient(d, s.jd)
      if (body.kind === 'sun') this.sunLight.position.copy(d.mesh.position)
      // A planet's map (Earth's is 2k) is fetched only once it would show (#261).
      if (body.kind === 'planet' && !d.skinAsked && this.looksBig(body)) {
        d.skinAsked = true
        this.skin(d, body.name as PlanetName)
      }
    }
    for (const [key, d] of this.drawn) if (!seen.has(key)) d.mesh.visible = false
  }

  /** The stars stay round the camera, so they sit at infinity in their true directions. */
  followCamera(camera: Object3D): void {
    this.stars.position.copy(camera.position)
  }

  /** A body's scene position and drawn radius, for tests and framing. */
  placed(key: string): { position: Vector3; radius: number } | null {
    const d = this.drawn.get(key)
    return d?.mesh.visible ? { position: d.mesh.position.clone(), radius: d.mesh.scale.x } : null
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const d of this.drawn.values()) d.mesh.material.dispose()
    for (const t of this.textures) t.dispose()
    this.geometry.dispose()
    for (const child of this.stars.children) {
      const p = child as Points<BufferGeometry, PointsMaterial>
      p.geometry.dispose()
      p.material.dispose()
    }
    this.group.clear()
  }

  private build(body: TrueBody): Drawn {
    const material =
      body.kind === 'sun'
        ? new MeshBasicMaterial({ color: sunFace() })
        : new MeshLambertMaterial({ color: new Color(this.hexOf(body)) })
    const mesh = new Mesh(this.geometry, material)
    mesh.name = body.name
    const d: Drawn = { mesh, body, skinAsked: false }
    this.drawn.set(body.key, d)
    this.group.add(mesh)

    return d
  }

  /** Big enough from the craft for its map to show: past SKIN_MIN_RADIUS. */
  private looksBig(body: TrueBody): boolean {
    const [x, y, z] = body.relKm
    return angularRadius(body.radiusKm, Math.hypot(x, y, z)) > SKIN_MIN_RADIUS
  }

  private hexOf(body: TrueBody): string {
    if (body.kind === 'moon') return MOON_HEX
    return BODY_HEX[body.name] ?? HUD_HEX
  }

  /** A planet's map, where it has one; the plain colour until it arrives. */
  private skin(d: Drawn, planet: PlanetName): void {
    const url = BODY_IMAGERY[planet].texture
    if (!url) return
    void this.options
      .loadTexture(url)
      .then((texture) => {
        if (this.disposed) {
          texture.dispose()
          return
        }
        this.textures.push(texture)
        // The maps are sRGB, as the orrery's skins mark them (bodySkins.ts), or colours wash out.
        texture.colorSpace = SRGBColorSpace
        const m = d.mesh.material
        m.map = texture
        m.color.set(0xffffff)
        m.needsUpdate = true
        this.options.onReady()
      })
      .catch(() => {
        // The plain colour stays: a missing map is not worth failing the view for.
      })
  }

  /** A planet turned to its pole and spin (Earth to Greenwich, as the orrery does). */
  private orient(d: Drawn, jd: number): void {
    if (d.body.kind !== 'planet') return
    const planet = d.body.name as BodyName
    if (planet === 'Earth') {
      const [a, b, c, e, f, g, h, i, j] = earthSkinToScene(jd)
      d.mesh.quaternion.setFromRotationMatrix(
        new Matrix4().set(a, b, c, 0, e, f, g, 0, h, i, j, 0, 0, 0, 0, 1),
      )
      return
    }
    const p = poleEcliptic(planet as PlanetName)
    const tilt = new Quaternion().setFromUnitVectors(UP, new Vector3(p.x, p.z, -p.y))
    const spin = new Quaternion().setFromAxisAngle(UP, spinAngle(planet, jd))
    d.mesh.quaternion.copy(tilt).multiply(spin)
  }
}
