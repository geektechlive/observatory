/**
 * Selective bloom for the high tier (#50, spec section 5). The scene is drawn to the
 * canvas exactly as before; this then renders only BLOOM_LAYER into an offscreen
 * target, blurs it with UnrealBloomPass, and adds just the blur onto the canvas. The
 * base pixels, the transparent background and the approved colour output are
 * untouched, and the sources don't glow twice.
 *
 * Not `renderToScreen`: in that mode the pass clears the canvas and copies its input
 * there first, which wiped the Earth (seen on an M5 Pro, 2026-10-23). No
 * EffectComposer either: one offscreen pass needs none.
 */
import {
  CustomBlending,
  HalfFloatType,
  OneFactor,
  type PerspectiveCamera,
  type Scene,
  ShaderMaterial,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

import type { BloomLike } from './GlobeRenderer'
import { BLOOM_LAYER } from './layers'

/** Every source is pre-selected by layer, so nothing needs a luminance threshold. */
const THRESHOLD = 0
/**
 * Tuned on an M5 Pro after the sRGB encode: encoding lifts the blur's faint wide mips,
 * so a larger radius or strength veils the whole night side (seen at 1.1 / 0.55).
 */
const STRENGTH = 0.5
const RADIUS = 0.15

/**
 * Adds light onto a premultiplied, transparent canvas: colour one-plus-one, and alpha
 * grows by the glow's brightest channel so a halo past the limb still shows.
 */
function addMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { glow: { value: null } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D glow;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(glow, vUv).rgb;
        gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
        // The blur is linear (HalfFloat target); the canvas is sRGB like the main pass.
        #include <colorspace_fragment>
      }
    `,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  })
}

export class SelectiveBloom implements BloomLike {
  private readonly renderer: WebGLRenderer
  private readonly scene: Scene
  private readonly camera: PerspectiveCamera
  private readonly target: WebGLRenderTarget
  private readonly pass: UnrealBloomPass
  private readonly add = addMaterial()
  private readonly quad = new FullScreenQuad(this.add)

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.target = new WebGLRenderTarget(width, height, { type: HalfFloatType })
    this.pass = new UnrealBloomPass(new Vector2(width, height), STRENGTH, RADIUS, THRESHOLD)
  }

  render(): void {
    const { renderer, camera } = this
    const mask = camera.layers.mask
    camera.layers.set(BLOOM_LAYER)
    try {
      renderer.setRenderTarget(this.target)
      renderer.render(this.scene, camera)
    } finally {
      // Left on BLOOM_LAYER, every later main pass would draw only the glow sources.
      camera.layers.mask = mask
      renderer.setRenderTarget(null)
    }
    // Offscreen: the pass leaves the composited blur in renderTargetsHorizontal[0].
    this.pass.render(renderer, this.target, this.target, 0, false)
    const glow = this.add.uniforms['glow']
    if (glow) glow.value = this.pass.renderTargetsHorizontal[0]?.texture ?? null
    renderer.setRenderTarget(null)
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    this.quad.render(renderer)
    renderer.autoClear = autoClear
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height)
    this.pass.setSize(width, height)
  }

  dispose(): void {
    this.target.dispose()
    this.pass.dispose()
    this.add.dispose()
    this.quad.dispose()
  }
}
