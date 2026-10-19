/**
 * three.js objects for a LayerPlan (#49). planLayers() (src/lib/globeLayers.ts) decides
 * what to draw; this file only builds and disposes it.
 *
 * Every glyph is drawn with a void halo, so markers keep their contrast over copper
 * land, city lights and aurora (Codex finding 13). Static layers rebuild only when
 * their data changes; the ISS moves in place at 5 Hz.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  type Object3D,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector3,
} from 'three'

import { isOccluded, type Vec3 } from '@/lib/globe3d'
import type { Glyph, LayerPlan, PlannedPoint } from '@/lib/globeLayers'
import { BONE_HEX, VOID_HEX } from '@/lib/palette'

const GLYPH_PX = 64
const MARKER_SCALE = 0.055
const ISS_SCALE = 0.11
/** Nameplate canvas: ring and dot on the left, the name beside it. */
const PLATE_W = 256
const PLATE_H = 64
const PLATE_DOT_X = 32
/** Nameplate height in globe units; the name's 26px canvas text lands near 11px on screen. */
const PLATE_SCALE = 0.12

interface GlyphTexture {
  map: Texture
  /** width / height of the sprite that shows it */
  aspect: number
  /** where, across the texture, the marker's point sits (sprite.center.x) */
  anchorX: number
}

/** Ring + dot + name, the treatment the SVG globe gives named spacecraft. */
function drawNameplate(name: string, color: string): GlyphTexture {
  const canvas = document.createElement('canvas')
  canvas.width = PLATE_W
  canvas.height = PLATE_H
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const cy = PLATE_H / 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.arc(PLATE_DOT_X, cy, 14, 0, Math.PI * 2)
    ctx.lineWidth = 7
    ctx.strokeStyle = VOID_HEX
    ctx.stroke()
    ctx.lineWidth = 3
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(PLATE_DOT_X, cy, 5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.font = '600 26px "IBM Plex Mono", monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 6
    ctx.strokeStyle = VOID_HEX
    ctx.strokeText(name, PLATE_DOT_X + 26, cy + 1, PLATE_W - PLATE_DOT_X - 30)
    ctx.fillStyle = BONE_HEX
    ctx.fillText(name, PLATE_DOT_X + 26, cy + 1, PLATE_W - PLATE_DOT_X - 30)
  }
  return {
    map: new CanvasTexture(canvas),
    aspect: PLATE_W / PLATE_H,
    anchorX: PLATE_DOT_X / PLATE_W,
  }
}

/** Draws a glyph with a void halo; returns a blank texture where 2D canvas is unavailable (tests). */
function drawGlyph(glyph: Glyph, color: string): GlyphTexture {
  if (glyph.shape === 'spacecraft') return drawNameplate(glyph.name, color)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = GLYPH_PX
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const c = GLYPH_PX / 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    switch (glyph.shape) {
      case 'letter':
        ctx.arc(c, c, 22, 0, Math.PI * 2)
        break
      case 'diamond':
        ctx.moveTo(c, 6)
        ctx.lineTo(58, c)
        ctx.lineTo(c, 58)
        ctx.lineTo(6, c)
        ctx.closePath()
        break
      case 'chevron':
        ctx.moveTo(c, 8)
        ctx.lineTo(54, 48)
        ctx.lineTo(c, 36)
        ctx.lineTo(10, 48)
        ctx.closePath()
        break
      case 'star':
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 26 : 10
          const a = (i * Math.PI) / 5 - Math.PI / 2
          ctx.lineTo(c + r * Math.cos(a), c + r * Math.sin(a))
        }
        ctx.closePath()
        break
      case 'station':
        ctx.rect(14, 14, 36, 36)
        break
    }
    ctx.lineWidth = 8
    ctx.strokeStyle = VOID_HEX
    ctx.stroke()
    ctx.fillStyle = color
    ctx.fill()
    if (glyph.shape === 'letter') {
      ctx.fillStyle = VOID_HEX
      ctx.font = '600 28px "IBM Plex Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(glyph.letter, c, c + 1)
    }
  }
  return { map: new CanvasTexture(canvas), aspect: 1, anchorX: 0.5 }
}

const pointVertex = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  uniform float scale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/** Round points with a soft void rim, so a cluster of fires still reads as separate dots. */
const pointFragment = /* glsl */ `
  uniform vec3 halo;
  uniform float haloAmount;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    vec3 c = mix(vColor, halo, smoothstep(0.62, 0.9, d) * haloAmount);
    gl_FragColor = vec4(c, vAlpha * (1.0 - smoothstep(0.9, 1.0, d)));
    #include <colorspace_fragment>
  }
`

/**
 * A labelled spacecraft. Its sprites skip the depth test (a billboard at the craft's depth
 * was clipped by the nearer Earth surface wherever the name overlapped the globe), so
 * updateOcclusion() hides it instead whenever its anchor is behind the Earth.
 */
interface Nameplate {
  name: string
  object: Object3D
  local: Vector3
}

export class GlobeLayerObjects {
  readonly group = new Group()
  private readonly staticGroup = new Group()
  private readonly glyphCache = new Map<string, GlyphTexture>()
  private issGroup: Group | null = null
  private issPlate: Nameplate | null = null
  private staticPlates: Nameplate[] = []
  private trailLine: Line | null = null
  private pixelScale = 460
  private readonly scratch = new Vector3()

  constructor() {
    this.group.add(this.staticGroup)
  }

  /** Point sizes are in globe units; this converts them to pixels for the canvas size. */
  setPixelScale(px: number): void {
    this.pixelScale = px
    this.staticGroup.traverse((o) => {
      if (o instanceof Points) (o.material as ShaderMaterial).uniforms['scale'] = { value: px }
    })
  }

  buildStatic(plan: LayerPlan): void {
    this.clear(this.staticGroup)
    this.staticPlates = []
    for (const m of plan.markers) {
      const key = `${JSON.stringify(m.glyph)}:${m.color}`
      let glyph = this.glyphCache.get(key)
      if (!glyph) {
        glyph = drawGlyph(m.glyph, m.color)
        this.glyphCache.set(key, glyph)
      }
      this.staticGroup.add(this.nameplateOrGlyph(glyph, m.position, m.color, m.glyph))
    }
    if (plan.spikes.length) this.staticGroup.add(this.buildSpikes(plan))
    for (const layer of ['fires', 'aurora'] as const) {
      const pts = plan.points.filter((p) => p.layer === layer)
      if (pts.length) this.staticGroup.add(this.buildPoints(pts, layer === 'aurora'))
    }
  }

  updateIss(plan: LayerPlan): void {
    if (!plan.iss) {
      if (this.issGroup) this.disposeObject(this.issGroup)
      this.issGroup = null
      this.issPlate = null
      if (this.trailLine) this.disposeObject(this.trailLine)
      this.trailLine = null
      return
    }
    if (!this.issGroup) {
      this.issGroup = new Group()
      const core = new Mesh(
        new SphereGeometry(0.012, 12, 8),
        new MeshBasicMaterial({ color: plan.iss.color }),
      )
      const glow = new Sprite(
        new SpriteMaterial({
          map: this.glow(plan.iss.color),
          blending: AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          transparent: true,
        }),
      )
      glow.scale.setScalar(ISS_SCALE)
      const plate = drawNameplate(plan.iss.name, plan.iss.color)
      this.glyphCache.set(`plate:${plan.iss.name}:${plan.iss.color}`, plate)
      const label = new Sprite(
        new SpriteMaterial({
          map: plate.map,
          depthWrite: false,
          depthTest: false,
          transparent: true,
        }),
      )
      label.center.set(plate.anchorX, 0.5)
      label.scale.set(PLATE_SCALE * plate.aspect, PLATE_SCALE, 1)
      this.issGroup.add(core, glow, label)
      // Hidden until the first occlusion test: its sprites skip the depth test (#60).
      this.issGroup.visible = false
      this.group.add(this.issGroup)
      this.issPlate = {
        name: plan.iss.name,
        object: this.issGroup,
        local: new Vector3(),
      }
    }
    this.issGroup.position.fromArray(plan.iss.position)
    this.issPlate?.local.fromArray(plan.iss.position)

    if (!this.trailLine) {
      this.trailLine = new Line(
        new BufferGeometry(),
        new LineBasicMaterial({
          color: plan.iss.color,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      )
      this.group.add(this.trailLine)
    }
    this.trailLine.geometry.setFromPoints(plan.trail.map((p) => new Vector3().fromArray(p)))
  }

  /**
   * Moves the satellite nameplates to their new positions without rebuilding them (#60).
   * Returns false, and changes nothing, unless the plan names exactly the same
   * spacecraft in the same order; the caller then rebuilds.
   */
  moveSpacecraft(plan: LayerPlan): boolean {
    const craft = plan.markers.filter((m) => m.glyph.shape === 'spacecraft')
    if (craft.length !== this.staticPlates.length) return false
    const same = craft.every(
      (m, i) => m.glyph.shape === 'spacecraft' && m.glyph.name === this.staticPlates[i]?.name,
    )
    if (!same) return false
    craft.forEach((m, i) => {
      const plate = this.staticPlates[i]
      if (!plate) return
      plate.local.fromArray(m.position)
      for (const child of plate.object.children) child.position.fromArray(m.position)
    })
    return true
  }

  /** Hide every nameplate whose anchor is behind the Earth from this camera. */
  updateOcclusion(globeMatrixWorld: Matrix4, camera: Vec3): void {
    for (const plate of this.issPlate ? [this.issPlate, ...this.staticPlates] : this.staticPlates) {
      this.scratch.copy(plate.local).applyMatrix4(globeMatrixWorld)
      plate.object.visible = !isOccluded(this.scratch.toArray(), camera)
    }
  }

  /** For tests: every nameplate, the ISS first. */
  debugNameplates(): readonly Nameplate[] {
    return this.issPlate ? [this.issPlate, ...this.staticPlates] : this.staticPlates
  }

  /** A plain glyph sprite, or a spacecraft nameplate with its glow, anchored on the marker point. */
  private nameplateOrGlyph(
    glyph: GlyphTexture,
    position: readonly number[],
    color: string,
    shape: Glyph,
  ): Object3D {
    const spacecraft = shape.shape === 'spacecraft'
    const sprite = new Sprite(
      new SpriteMaterial({
        map: glyph.map,
        depthWrite: false,
        depthTest: !spacecraft,
        transparent: true,
      }),
    )
    sprite.position.fromArray(position)
    sprite.center.set(glyph.anchorX, 0.5)
    const h = spacecraft ? PLATE_SCALE : MARKER_SCALE
    sprite.scale.set(h * glyph.aspect, h, 1)
    if (shape.shape !== 'spacecraft') return sprite
    const group = new Group()
    const glow = new Sprite(
      new SpriteMaterial({
        map: this.glow(color),
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        transparent: true,
      }),
    )
    glow.position.fromArray(position)
    glow.scale.setScalar(ISS_SCALE * 0.8)
    group.add(glow, sprite)
    // Hidden until the first occlusion test: these sprites skip the depth test, so a
    // plate drawn before the test would show through the Earth (#60).
    group.visible = false
    this.staticPlates.push({
      name: shape.name,
      object: group,
      local: new Vector3().fromArray(position),
    })
    return group
  }

  dispose(): void {
    this.clear(this.group)
    for (const t of this.glyphCache.values()) t.map.dispose()
    this.glyphCache.clear()
  }

  private buildSpikes(plan: LayerPlan): InstancedMesh {
    // A unit cone with its base at the origin, scaled per quake along the surface normal.
    const geometry = new ConeGeometry(0.009, 1, 6).translate(0, 0.5, 0)
    const mesh = new InstancedMesh(
      geometry,
      new MeshBasicMaterial({ color: 0xffffff }), // identity multiplier: colour is per instance
      plan.spikes.length,
    )
    const up = new Vector3(0, 1, 0)
    const m = new Matrix4()
    const q = new Quaternion()
    const color = new Color()
    plan.spikes.forEach((s, i) => {
      const n = new Vector3().fromArray(s.base).normalize()
      q.setFromUnitVectors(up, n)
      m.compose(new Vector3().fromArray(s.base), q, new Vector3(1, s.height, 1))
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, color.set(s.color))
    })
    return mesh
  }

  private buildPoints(pts: readonly PlannedPoint[], field: boolean): Points {
    const geometry = new BufferGeometry()
    const color = new Color()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        pts.flatMap((p) => p.position),
        3,
      ),
    )
    geometry.setAttribute(
      'color',
      new Float32BufferAttribute(
        pts.flatMap((p) => color.set(p.color).toArray()),
        3,
      ),
    )
    geometry.setAttribute(
      'size',
      new Float32BufferAttribute(
        pts.map((p) => p.size),
        1,
      ),
    )
    geometry.setAttribute(
      'alpha',
      new Float32BufferAttribute(
        pts.map((p) => p.alpha),
        1,
      ),
    )
    const material = new ShaderMaterial({
      uniforms: {
        scale: { value: this.pixelScale },
        halo: { value: new Color(VOID_HEX) },
        // A field (aurora) has no halo; discrete markers keep theirs for contrast.
        haloAmount: { value: field ? 0 : 1 },
      },
      vertexShader: pointVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthWrite: false,
      // Normal blending even for the aurora field: additive overlap of a dense grid climbs to white.
      blending: NormalBlending,
    })
    return new Points(geometry, material)
  }

  private glow(color: string): Texture {
    const key = `glow:${color}`
    const cached = this.glyphCache.get(key)
    if (cached) return cached.map
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = GLYPH_PX
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      g.addColorStop(0, color)
      g.addColorStop(0.3, `${color}99`)
      g.addColorStop(1, `${color}00`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, GLYPH_PX, GLYPH_PX)
    }
    const texture = new CanvasTexture(canvas)
    this.glyphCache.set(key, { map: texture, aspect: 1, anchorX: 0.5 })
    return texture
  }

  private clear(parent: Group): void {
    for (const child of [...parent.children]) {
      if (child === this.staticGroup) {
        this.clear(this.staticGroup)
        continue
      }
      this.disposeObject(child)
    }
  }

  private disposeObject(object: Object3D): void {
    object.removeFromParent()
    object.traverse((o) => {
      if (o instanceof Mesh || o instanceof Points || o instanceof Line || o instanceof Sprite) {
        ;(o.geometry as BufferGeometry).dispose()
        const materials: unknown[] = Array.isArray(o.material) ? o.material : [o.material]
        // Glyph and glow textures are cached and freed in dispose(), not here.
        for (const mat of materials) (mat as Material).dispose()
      }
    })
  }
}
