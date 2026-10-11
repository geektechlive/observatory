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

import type { Glyph, LayerPlan, PlannedPoint } from '@/lib/globeLayers'
import { VOID_HEX } from '@/lib/palette'

const GLYPH_PX = 64
const MARKER_SCALE = 0.055
const ISS_SCALE = 0.11

/** Draws a glyph with a void halo; returns a blank texture where 2D canvas is unavailable (tests). */
function drawGlyph(glyph: Glyph, color: string): Texture {
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
  return new CanvasTexture(canvas)
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

export class GlobeLayerObjects {
  readonly group = new Group()
  private readonly staticGroup = new Group()
  private readonly glyphCache = new Map<string, Texture>()
  private issGroup: Group | null = null
  private trailLine: Line | null = null
  private pixelScale = 460

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
    for (const m of plan.markers) {
      const key = `${JSON.stringify(m.glyph)}:${m.color}`
      let map = this.glyphCache.get(key)
      if (!map) {
        map = drawGlyph(m.glyph, m.color)
        this.glyphCache.set(key, map)
      }
      const sprite = new Sprite(new SpriteMaterial({ map, depthWrite: false }))
      sprite.position.fromArray(m.position)
      sprite.scale.setScalar(MARKER_SCALE)
      this.staticGroup.add(sprite)
    }
    if (plan.spikes.length) this.staticGroup.add(this.buildSpikes(plan))
    for (const layer of ['fires', 'satellites', 'aurora'] as const) {
      const pts = plan.points.filter((p) => p.layer === layer)
      if (pts.length) this.staticGroup.add(this.buildPoints(pts, layer === 'aurora'))
    }
  }

  updateIss(plan: LayerPlan): void {
    if (!plan.iss) {
      if (this.issGroup) this.disposeObject(this.issGroup)
      this.issGroup = null
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
          transparent: true,
        }),
      )
      glow.scale.setScalar(ISS_SCALE)
      this.issGroup.add(core, glow)
      this.group.add(this.issGroup)
    }
    this.issGroup.position.fromArray(plan.iss.position)

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

  dispose(): void {
    this.clear(this.group)
    for (const t of this.glyphCache.values()) t.dispose()
    this.glyphCache.clear()
  }

  private buildSpikes(plan: LayerPlan): InstancedMesh {
    // A unit cone with its base at the origin, scaled per quake along the surface normal.
    const geometry = new ConeGeometry(0.009, 1, 6).translate(0, 0.5, 0)
    const mesh = new InstancedMesh(
      geometry,
      new MeshBasicMaterial({ color: '#ffffff' }),
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
    if (cached) return cached
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
    this.glyphCache.set(key, texture)
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
