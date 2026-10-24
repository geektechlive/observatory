/**
 * The three.js globe (ROCI v2, #46/#47). Imperative, not React: the frame loop never
 * touches React state. Loaded only through a dynamic import from GlobeHost, so
 * three.js stays out of the entry chunk (scripts/check-bundle.mjs enforces it).
 *
 * Lifecycle: create() loads textures and builds the scene; attach()/detach() move
 * the canvas without losing the GPU context (so Earth/Sun/Sky switches don't churn
 * contexts); dispose() releases everything the spike leaked.
 */
import {
  AdditiveBlending,
  BackSide,
  type BufferGeometry,
  Group,
  type Material,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'

import {
  facingLongitude,
  GLOBE_SPIN_DEG_PER_SEC,
  isSurfaceVisible,
  rotationForFacing,
  sunDirection,
  terminatorFacing,
} from '@/lib/globe3d'
import { layerCounts, type LayerInput, planLayers } from '@/lib/globeLayers'
import { GLOBE_GRADE, hexToLinear, ISS_HEX } from '@/lib/palette'

import { SelectiveBloom } from './bloom'
import { BLOOM_LAYER, GlobeLayerObjects } from './layers'
import {
  atmosphereFragment,
  atmosphereVertex,
  earthBloomFragment,
  earthFragment,
  earthVertex,
} from './shaders'

/** Layers that rebuild when their contents change. Satellites move in place instead. */
const STATIC_KEYS = [
  'events',
  'quakes',
  'fires',
  'fireballs',
  'launches',
  'disasters',
  'aurora',
] as const

/**
 * Same items in the same order. App re-renders at 5 Hz and hands over fresh arrays
 * (a new `[]` for every layer that's off), so array identity alone rebuilt every
 * marker five times a second (#60).
 */
function sameItems(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a === b || (a.length === b.length && a.every((item, i) => item === b[i]))
}

/** A focusable item's position on the canvas this frame (CSS px from the top left). */
export interface ProjectedItem {
  layer: 'events' | 'quakes'
  index: number
  x: number
  y: number
  /** False when the item is behind the Earth's limb. */
  visible: boolean
}

/** The slice of WebGLRenderer the globe uses; tests pass a fake. */
export interface WebGLRendererLike {
  domElement: HTMLCanvasElement
  setPixelRatio(ratio: number): void
  setSize(width: number, height: number, updateStyle?: boolean): void
  render(scene: Scene, camera: PerspectiveCamera): void
  dispose(): void
  forceContextLoss(): void
  capabilities: { getMaxAnisotropy(): number }
}

/** The high tier's bloom post-process (#50); tests pass a fake, since it needs a GPU. */
export interface BloomLike {
  /** Adds the glow onto the canvas; call right after the scene is drawn. */
  render(): void
  /** Device pixels. */
  setSize(width: number, height: number): void
  dispose(): void
}

export interface RendererDeps {
  createRenderer: () => WebGLRendererLike
  loadTexture: (url: string) => Promise<Texture>
  requestFrame: (cb: (t: number) => void) => number
  cancelFrame: (id: number) => void
  /** Only called when options.bloom is on. Width and height are device pixels. */
  createBloom?: (
    renderer: WebGLRendererLike,
    scene: Scene,
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ) => BloomLike
}

export interface GlobeRendererOptions {
  size: number
  textures: { day: string; night: string }
  dprCap: number
  reducedMotion: boolean
  /** Copper grade on; the ORBIT tracking view turns it off. */
  warm: boolean
  showTerminator?: boolean | undefined
  /** Longitude to open on; defaults to the evening terminator (#62). Tests pin it. */
  startFacing?: number | undefined
  /** High tier: selective bloom. Low tier (phones, weak GPUs): additive sprites (#50). */
  bloom?: boolean | undefined
  onContextLost?: (() => void) | undefined
}

/** Shared with the SVG globe, so the crossfade does not jump (#62). */
const DEGREES_PER_MS = GLOBE_SPIN_DEG_PER_SEC / 1000
const CAMERA_DISTANCE = 4.1
const SUN_REFRESH_MS = 60_000

const defaultDeps: RendererDeps = {
  createRenderer: () => new WebGLRenderer({ antialias: true, alpha: true }),
  loadTexture: (url) => new TextureLoader().loadAsync(url),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => {
    cancelAnimationFrame(id)
  },
  // createRenderer above makes a real WebGLRenderer; only the tests narrow it.
  createBloom: (renderer, scene, camera, width, height) =>
    new SelectiveBloom(renderer as WebGLRenderer, scene, camera, width, height),
}

const vec = (rgb: readonly number[]): Vector3 => new Vector3(rgb[0], rgb[1], rgb[2])

export class GlobeRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 100)
  private readonly globe = new Group()
  private readonly sun = new Vector3()
  private readonly meshes: Mesh[] = []
  private readonly layers: GlobeLayerObjects
  private readonly bloom: BloomLike | null
  /** Aurora shimmer clock; it runs only while the globe turns (spec section 6). */
  private auroraSeconds = 0
  private lastInput: LayerInput | null = null
  private onFrame: ((items: readonly ProjectedItem[]) => void) | null = null
  private onRotate: ((facingLon: number) => void) | null = null
  private focusables: { layer: 'events' | 'quakes'; index: number; local: Vector3 }[] = []
  private projected: ProjectedItem[] = []
  private readonly scratch = new Vector3()
  private earthUniforms: Record<string, { value: unknown }> | null = null
  private rotation: number
  /** Current CSS size in px; starts at options.size and follows resize(). */
  private size: number
  private frameId = 0
  private lastFrame: number | null = null
  private lastSun = 0
  private rotationPaused = false
  /** Static-layer rebuilds so far, mirrored on the canvas for e2e (#60). */
  private builds = 0
  private attached = false
  private disposed = false

  private readonly renderer: WebGLRendererLike
  private readonly textures: readonly Texture[]
  private readonly options: GlobeRendererOptions
  private readonly deps: RendererDeps

  private constructor(
    renderer: WebGLRendererLike,
    textures: readonly Texture[],
    options: GlobeRendererOptions,
    deps: RendererDeps,
  ) {
    this.renderer = renderer
    this.textures = textures
    this.options = options
    this.deps = deps
    this.rotation = rotationForFacing(options.startFacing ?? terminatorFacing(new Date()))
    this.size = options.size
    this.layers = new GlobeLayerObjects({ bloom: options.bloom === true })
    this.canvas = renderer.domElement
    this.canvas.setAttribute('aria-hidden', 'true')
    // Tests and the host find this canvas by name; the SVG globe and starfield have canvases too.
    this.canvas.dataset['globeWebgl'] = ''
    renderer.setPixelRatio(this.pixelRatio())
    renderer.setSize(options.size, options.size, false)
    this.camera.position.set(0, 0, CAMERA_DISTANCE)
    this.camera.lookAt(0, 0, 0)
    this.buildScene()
    const px = options.size * this.pixelRatio()
    this.bloom =
      options.bloom === true && deps.createBloom
        ? deps.createBloom(renderer, this.scene, this.camera, px, px)
        : null
    this.canvas.dataset['globeBloom'] = this.bloom ? 'bloom' : 'sprites'
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost)
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  /** Builds the renderer and resolves once both Earth textures are on the GPU. */
  static async create(
    options: GlobeRendererOptions,
    deps: RendererDeps = defaultDeps,
  ): Promise<GlobeRenderer> {
    const renderer = deps.createRenderer()
    try {
      const [day, night] = await Promise.all([
        deps.loadTexture(options.textures.day),
        deps.loadTexture(options.textures.night),
      ])
      const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
      for (const t of [day, night]) {
        t.colorSpace = SRGBColorSpace
        t.anisotropy = anisotropy
      }
      return new GlobeRenderer(renderer, [day, night], options, deps)
    } catch (error) {
      renderer.dispose()
      renderer.forceContextLoss()
      throw error
    }
  }

  private buildScene(): void {
    const [day, night] = this.textures
    this.sun.fromArray(sunDirection(new Date()))
    const earth = new Mesh(
      new SphereGeometry(1, 128, 96),
      new ShaderMaterial({
        uniforms: {
          dayTex: { value: day },
          nightTex: { value: night },
          sunDir: { value: this.sun },
          gShadow: { value: vec(GLOBE_GRADE.shadow) },
          gDeep: { value: vec(GLOBE_GRADE.deep) },
          gMid: { value: vec(GLOBE_GRADE.mid) },
          gHigh: { value: vec(GLOBE_GRADE.high) },
          gNight: { value: vec(GLOBE_GRADE.night) },
          gMix: { value: this.options.warm ? GLOBE_GRADE.mix : 0 },
          showTerminator: { value: this.options.showTerminator === false ? 0 : 1 },
        },
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
      }),
    )
    const atmosphere = new Mesh(
      new SphereGeometry(1.055, 96, 64),
      new ShaderMaterial({
        uniforms: {
          sunDir: { value: this.sun },
          dayCol: { value: vec(GLOBE_GRADE.high) },
          nightCol: { value: vec(hexToLinear(ISS_HEX)) },
        },
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    )
    // The Earth as the bloom pass sees it (#50): city lights only, sharing the Earth's
    // geometry and uniforms. It writes depth, so far-side glows stay hidden.
    const bloomTwin = new Mesh(
      earth.geometry,
      new ShaderMaterial({
        uniforms: earth.material.uniforms,
        vertexShader: earthVertex,
        fragmentShader: earthBloomFragment,
      }),
    )
    bloomTwin.layers.set(BLOOM_LAYER)
    this.meshes.push(earth, atmosphere, bloomTwin)
    this.globe.add(earth, atmosphere, bloomTwin)
    this.globe.rotation.y = this.rotation
    this.scene.add(this.globe)
    this.globe.add(this.layers.group)
    this.applyPixelScale()
    this.earthUniforms = earth.material.uniforms
  }

  private pixelRatio(): number {
    return Math.min(globalThis.devicePixelRatio || 1, this.options.dprCap)
  }

  /** Point sprites are sized in globe units; convert at the camera's focal length. */
  private applyPixelScale(): void {
    const pixels = this.size * this.pixelRatio()
    this.layers.setPixelScale(pixels / (2 * Math.tan((this.camera.fov * Math.PI) / 360)))
  }

  /**
   * Draw at a new CSS size (#63): the layout gives the globe whatever the lens can hold.
   * Keeps the GPU context; the a11y overlay reads the same size, so positions agree.
   */
  resize(size: number): void {
    if (this.disposed || size === this.size) return
    this.size = size
    this.renderer.setSize(size, size, false)
    this.bloom?.setSize(size * this.pixelRatio(), size * this.pixelRatio())
    this.applyPixelScale()
    if (this.frameId === 0 && this.attached) this.renderOnce()
  }

  /**
   * Data layers (#49). Static layers rebuild only when one of their arrays changes
   * (they poll every few minutes); the ISS and its trail move in place (5 Hz).
   */
  setLayers(input: LayerInput): void {
    if (this.disposed) return
    const plan = planLayers(input)
    const last = this.lastInput
    const staticChanged =
      !last ||
      last.tracking !== input.tracking ||
      STATIC_KEYS.some((key) => !sameItems(last[key], input[key]))
    const satellitesChanged = !last || !sameItems(last.satellites, input.satellites)
    // The satellite feed refreshes every 2 s with new objects; move the plates if the
    // same spacecraft are named, rebuild only when the set changes.
    if (staticChanged || (satellitesChanged && !this.layers.moveSpacecraft(plan))) {
      this.layers.buildStatic(plan)
      this.builds += 1
      this.canvas.dataset['globeBuilds'] = String(this.builds)
    }
    this.layers.updateIss(plan)
    this.lastInput = input
    this.focusables = [
      ...plan.markers.flatMap((m) =>
        m.focusIndex === undefined
          ? []
          : [
              {
                layer: 'events' as const,
                index: m.focusIndex,
                local: new Vector3().fromArray(m.position),
              },
            ],
      ),
      ...plan.spikes.map((s) => ({
        layer: 'quakes' as const,
        index: s.focusIndex,
        local: new Vector3().fromArray(s.base),
      })),
    ]
    this.projected = this.focusables.map((f) => ({
      layer: f.layer,
      index: f.index,
      x: 0,
      y: 0,
      visible: false,
    }))
    // What is drawn, per layer: e2e asserts parity (#44) on this, not on props.
    this.canvas.dataset['globeLayers'] = JSON.stringify(layerCounts(plan))
    if (this.frameId === 0 && this.attached) this.renderOnce()
  }

  /** Copper grade on or off (the ORBIT tracking view is cool). */
  setWarm(warm: boolean): void {
    const mix = this.earthUniforms?.['gMix']
    if (mix) mix.value = warm ? GLOBE_GRADE.mix : 0
    if (this.frameId === 0 && this.attached) this.renderOnce()
  }

  setShowTerminator(show: boolean): void {
    const uniform = this.earthUniforms?.['showTerminator']
    if (uniform) uniform.value = show ? 1 : 0
    if (this.frameId === 0 && this.attached) this.renderOnce()
  }

  /** Longitude currently facing the camera, in degrees. */
  facing(): number {
    return facingLongitude(this.rotation)
  }

  /**
   * Turn to face a longitude. GlobeHost passes the SVG globe's facing just before the
   * crossfade, so the two line up, including after a console switch (#62).
   */
  setFacing(lon: number): void {
    this.rotation = rotationForFacing(lon)
    this.globe.rotation.y = this.rotation
    this.lastFrame = null
    if (this.frameId === 0 && this.attached) this.renderOnce()
  }

  attach(parent: HTMLElement): void {
    if (this.disposed) return
    parent.appendChild(this.canvas)
    this.attached = true
    this.renderOnce()
    this.schedule()
  }

  detach(): void {
    this.stopLoop()
    this.attached = false
    this.canvas.remove()
  }

  /**
   * Called after every render with the screen position of each focusable item, from
   * the same camera and pose that frame was drawn with (#48, Codex finding 1). The
   * array is reused between frames; copy it to keep it.
   */
  setOnFrame(callback: ((items: readonly ProjectedItem[]) => void) | null): void {
    this.onFrame = callback
    if (callback && this.attached) this.emitFrame()
  }

  /** Called after every render with the facing longitude, for the bezel's bearing scale. */
  setOnRotate(callback: ((facingLon: number) => void) | null): void {
    this.onRotate = callback
    callback?.(this.facing())
  }

  setRotationPaused(paused: boolean): void {
    this.rotationPaused = paused
    this.lastFrame = null
  }

  /** For tests: every spacecraft nameplate, the ISS first. */
  debugNameplates(): ReturnType<GlobeLayerObjects['debugNameplates']> {
    return this.layers.debugNameplates()
  }

  /** For lifecycle tests: the meshes whose geometry and material dispose() must free. */
  debugMeshes(): readonly Mesh<BufferGeometry, Material>[] {
    return this.meshes as Mesh<BufferGeometry, Material>[]
  }

  /** For tests: the aurora shimmer clock, in seconds. */
  debugAuroraTime(): number {
    return this.layers.debugAuroraTime()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.detach()
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      ;(mesh.material as Material).dispose()
    }
    for (const t of this.textures) t.dispose()
    this.layers.dispose()
    this.bloom?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }

  private schedule(): void {
    if (!this.attached || this.disposed || this.options.reducedMotion || document.hidden) return
    this.frameId = this.deps.requestFrame(this.frame)
  }

  private stopLoop(): void {
    this.deps.cancelFrame(this.frameId)
    this.frameId = 0
    this.lastFrame = null
  }

  private readonly frame = (now: number): void => {
    if (!this.rotationPaused && this.lastFrame !== null) {
      const elapsed = now - this.lastFrame
      this.rotation += elapsed * DEGREES_PER_MS * (Math.PI / 180)
      this.globe.rotation.y = this.rotation
      // The aurora shimmers only while the globe turns: §6 allows no other motion.
      this.auroraSeconds += elapsed / 1000
      this.layers.setTime(this.auroraSeconds)
    }
    this.lastFrame = now
    if (now - this.lastSun > SUN_REFRESH_MS) {
      this.sun.fromArray(sunDirection(new Date()))
      this.lastSun = now
    }
    this.draw()
    this.schedule()
  }

  private renderOnce(): void {
    this.draw()
  }

  private draw(): void {
    this.syncOcclusion()
    this.renderer.render(this.scene, this.camera)
    this.bloom?.render()
    this.emitFrame()
  }

  /**
   * Hide the nameplates behind the Earth for the pose about to be drawn. It must run
   * before the draw: their sprites skip the depth test, so hiding them after the draw
   * let each frame show the previous pose's mistakes, and a freshly built plate
   * showed through the Earth for one frame (#60).
   */
  private syncOcclusion(): void {
    this.globe.updateMatrixWorld()
    this.camera.updateMatrixWorld()
    this.layers.updateOcclusion(this.globe.matrixWorld, this.camera.position.toArray())
  }

  private emitFrame(): void {
    this.onRotate?.(this.facing())
    // A real render updates these; update them here too so the projection never lags a frame.
    this.globe.updateMatrixWorld()
    this.camera.updateMatrixWorld()
    const cam = this.camera.position.toArray()
    if (!this.onFrame || this.focusables.length === 0) return
    const size = this.size
    this.focusables.forEach((f, i) => {
      const item = this.projected[i]
      if (!item) return
      this.scratch.copy(f.local).applyMatrix4(this.globe.matrixWorld)
      item.visible = isSurfaceVisible(this.scratch.toArray(), cam)
      this.scratch.project(this.camera)
      item.x = ((this.scratch.x + 1) / 2) * size
      item.y = ((1 - this.scratch.y) / 2) * size
    })
    this.onFrame(this.projected)
  }

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.stopLoop()
    else this.schedule()
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.stopLoop()
    this.options.onContextLost?.()
  }
}
