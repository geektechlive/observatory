/**
 * Real imagery on the orrery's bodies (#105). Each planet keeps its flat-colour sphere as
 * the distant dot and the fallback; once it draws at least SKIN_MIN_PX across, a lit,
 * mapped sphere takes over, tilted to its IAU pole and spun at its sidereal rate. Maps
 * load on first need, so a visitor who never zooms in downloads none of them. The Sun
 * is GOES SUVI's latest frame on a camera-facing sprite (sunImage.ts).
 */
import {
  AddEquation,
  CanvasTexture,
  Color,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OneFactor,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  Vector3,
  ZeroFactor,
} from 'three'

import { type BodyName } from '@/lib/orrery/bodies'
import { type PlanetName, PLANETS } from '@/lib/orrery/elements'
import { BODY_IMAGERY, poleEcliptic, SATURN_RINGS, spinAngle } from '@/lib/orrery/imagery'
import { SUVI_FRAME } from '@/lib/orrery/suvi'
import { BODY_HEX, HUD_HEX } from '@/lib/palette'

/** A body draws its map once its radius on screen reaches this, px. */
export const SKIN_MIN_PX = 6
/** The live Sun is drawn at this size, px; it replaces the canvas it was cropped into. */
const SUN_TEXTURE_PX = 512
const UP = new Vector3(0, 1, 0)
/** The Sun's sprite sits this many Sun radii toward the camera (just past the surface). */
const SUN_SPRITE_LIFT = 1.05

interface Skin {
  readonly mesh: Mesh<SphereGeometry, MeshLambertMaterial>
  /** Ecliptic north is +y in the scene: the pole's tilt, before the spin. */
  readonly tilt: Quaternion
  readonly texture?: string
  state: 'idle' | 'loading' | 'ready' | 'failed'
  rings?: Mesh<RingGeometry, MeshBasicMaterial>
}

/** The corona fades out between these fractions of the crop's half-width (disc: 0.70). */
const FADE_FROM = 0.8
const FADE_TO = 0.98

/**
 * Darken a square RGBA frame toward its edge, so the cropped corona ends in a soft circle
 * rather than the crop's straight edges (seen zoomed in on the Sun). Alpha is untouched.
 */
export function fadeCorona(data: Uint8ClampedArray, size: number): void {
  const half = size / 2
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half
      if (r <= FADE_FROM) continue
      const t = Math.min(1, (r - FADE_FROM) / (FADE_TO - FADE_FROM))
      const k = 1 - t * t * (3 - 2 * t)
      const i = (y * size + x) * 4
      data[i] = (data[i] ?? 0) * k
      data[i + 1] = (data[i + 1] ?? 0) * k
      data[i + 2] = (data[i + 2] ?? 0) * k
    }
  }
}

export class BodySkins {
  private readonly skins = new Map<PlanetName, Skin>()
  private readonly geometry = new SphereGeometry(1, 48, 32)
  private readonly textures: Texture[] = []
  private readonly spin = new Quaternion()
  private readonly toCamera = new Vector3()
  private sun: Sprite | null = null
  private sunMaterial: SpriteMaterial | null = null

  private readonly loadTexture: (url: string) => Promise<Texture>
  /** A map arrived: the renderer draws once more. */
  private readonly onReady: () => void

  constructor(loadTexture: (url: string) => Promise<Texture>, onReady: () => void) {
    this.loadTexture = loadTexture
    this.onReady = onReady
  }

  /** Give each planet mesh its mapped twin, hidden until it is big enough to show. */
  build(bodies: ReadonlyMap<BodyName, Mesh>): void {
    for (const planet of PLANETS) {
      const parent = bodies.get(planet)
      if (!parent) continue
      const imagery = BODY_IMAGERY[planet]
      // A mapped body's colour multiplies its map, so it is plain white (no tint).
      const material = new MeshLambertMaterial({
        color: imagery.texture ? new Color(1, 1, 1) : new Color(BODY_HEX[planet] ?? HUD_HEX),
      })
      const mesh = new Mesh(this.geometry, material)
      mesh.visible = false
      mesh.name = `${planet}:skin`
      const p = poleEcliptic(planet)
      const tilt = new Quaternion().setFromUnitVectors(UP, new Vector3(p.x, p.z, -p.y))
      const skin: Skin = {
        mesh,
        tilt,
        state: imagery.texture ? 'idle' : 'ready',
        ...(imagery.texture ? { texture: imagery.texture } : {}),
      }
      if (planet === 'Saturn') skin.rings = this.buildRings(mesh)
      parent.add(mesh)
      this.skins.set(planet, skin)
    }
  }

  private buildRings(saturn: Mesh): Mesh<RingGeometry, MeshBasicMaterial> {
    const inner = SATURN_RINGS.innerKm / SATURN_RINGS.saturnRadiusKm
    const outer = SATURN_RINGS.outerKm / SATURN_RINGS.saturnRadiusKm
    const geometry = new RingGeometry(inner, outer, 160, 1)
    // The strip runs inner edge to outer edge: u is the radius, not the planar x.
    const pos = geometry.getAttribute('position')
    const uv: number[] = []
    for (let i = 0; i < pos.count; i += 1) {
      const r = Math.hypot(pos.getX(i), pos.getY(i))
      uv.push((r - inner) / (outer - inner), 0.5)
    }
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    // RingGeometry lies in xy; the equator is the skin's xz plane (its pole is +y).
    geometry.rotateX(-Math.PI / 2)
    const material = new MeshBasicMaterial({
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      visible: false,
    })
    const rings = new Mesh(geometry, material)
    rings.name = 'Saturn:rings'
    saturn.add(rings)
    return rings
  }

  /** Tilt and spin every skin for a date. Only a moving clock changes it. */
  orient(jd: number): void {
    for (const [planet, skin] of this.skins) {
      this.spin.setFromAxisAngle(UP, spinAngle(planet, jd))
      skin.mesh.quaternion.copy(skin.tilt).multiply(this.spin)
    }
  }

  /**
   * Each frame, per body: the map once it is big enough and loaded, else the flat dot.
   * Returns the bodies drawing their skin, for the canvas's data attribute.
   */
  apply(radiusPx: (planet: PlanetName) => number, flat: ReadonlyMap<BodyName, Mesh>): string[] {
    const shown: string[] = []
    for (const [planet, skin] of this.skins) {
      const big = radiusPx(planet) >= SKIN_MIN_PX
      if (big && skin.state === 'idle') this.load(skin)
      const show = big && skin.state === 'ready'
      skin.mesh.visible = show
      if (skin.rings) skin.rings.material.visible = show && skin.rings.material.map !== null
      const dot = flat.get(planet)?.material
      if (dot && !Array.isArray(dot)) dot.visible = !show
      if (show) shown.push(planet)
    }
    return shown
  }

  private load(skin: Skin): void {
    if (!skin.texture) return
    skin.state = 'loading'
    const wanted = [this.loadTexture(skin.texture)]
    if (skin.rings) wanted.push(this.loadTexture(SATURN_RINGS.texture))
    Promise.all(wanted)
      .then(([map, ringMap]) => {
        if (!map) throw new Error('no map')
        this.adopt(map)
        skin.mesh.material.map = map
        skin.mesh.material.needsUpdate = true
        if (skin.rings && ringMap) {
          this.adopt(ringMap)
          skin.rings.material.map = ringMap
          skin.rings.material.needsUpdate = true
        }
        skin.state = 'ready'
        this.onReady()
      })
      .catch(() => {
        // The flat dot stays: it is the fallback.
        skin.state = 'failed'
      })
  }

  private adopt(texture: Texture): void {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    this.textures.push(texture)
  }

  /**
   * Show a live SUVI frame on the Sun: cropped to the disc and its corona (dropping the
   * caption), on an additive sprite sized so the disc matches the sphere. The sphere
   * writes only depth, so orbits and planets behind the Sun stay hidden; faceCamera()
   * keeps the sprite just in front of it.
   */
  setSunImage(sunMesh: Mesh, image: CanvasImageSource): void {
    const canvas = document.createElement('canvas')
    canvas.width = SUN_TEXTURE_PX
    canvas.height = SUN_TEXTURE_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { size, crop } = SUVI_FRAME
    const from = size / 2 - crop
    ctx.drawImage(image, from, from, crop * 2, crop * 2, 0, 0, SUN_TEXTURE_PX, SUN_TEXTURE_PX)
    const pixels = ctx.getImageData(0, 0, SUN_TEXTURE_PX, SUN_TEXTURE_PX)
    fadeCorona(pixels.data, SUN_TEXTURE_PX)
    ctx.putImageData(pixels, 0, 0)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    if (!this.sun || !this.sunMaterial) {
      // Additive colour, but the canvas's alpha is left alone: the page composites the
      // transparent canvas premultiplied, so the frame's black adds nothing over the
      // stage instead of painting an opaque square (seen on the first real-GPU shot).
      this.sunMaterial = new SpriteMaterial({
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: ZeroFactor,
        blendDstAlpha: OneFactor,
        depthWrite: false,
        transparent: true,
      })
      this.sun = new Sprite(this.sunMaterial)
      this.sun.name = 'Sun:suvi'
      // The disc spans 2 * discRadius of the 2 * crop px drawn: scale it to the sphere.
      this.sun.scale.setScalar((2 * SUVI_FRAME.crop) / SUVI_FRAME.discRadius)
      sunMesh.add(this.sun)
    }
    this.sunMaterial.map?.dispose()
    this.sunMaterial.map = texture
    this.sunMaterial.needsUpdate = true
    const flat = sunMesh.material
    if (!Array.isArray(flat)) flat.colorWrite = false
  }

  /**
   * Each frame: move the Sun's sprite from its centre to just past the sphere's near
   * side, toward the camera, so the sphere's depth no longer hides the disc.
   */
  faceCamera(camera: Vector3): void {
    const sun = this.sun
    const parent = sun?.parent
    if (!sun || !parent) return
    this.toCamera.copy(camera).sub(parent.position).normalize()
    sun.position.copy(this.toCamera).multiplyScalar(SUN_SPRITE_LIFT)
  }

  dispose(): void {
    this.geometry.dispose()
    for (const skin of this.skins.values()) {
      skin.mesh.material.dispose()
      skin.rings?.geometry.dispose()
      skin.rings?.material.dispose()
    }
    for (const t of this.textures) t.dispose()
    this.sunMaterial?.map?.dispose()
    this.sunMaterial?.dispose()
  }
}
