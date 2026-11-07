/**
 * The 3D orrery (#91). Its own WebGL context, created once for the page's lifetime like
 * the globe's (GlobeHost): switching tabs detaches the canvas, never rebuilds it. Draws
 * on demand: when the camera moves, the clock plays or the view changes, and not at all
 * while detached or hidden. Positions come from src/lib/orrery; colours from palette.ts.
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
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import {
  AU_KM,
  ELEMENTS,
  heliocentric,
  jdFromDate,
  place3d,
  type PlanetName,
  PLANETS,
} from '@/lib/orrery'
import type { BodyName } from '@/lib/orrery/bodies'
import { BODY_HEX, HUD_HEX } from '@/lib/palette'

import { type FocusPreset, FOV, framePreset } from './framing'

export type { FocusPreset } from './framing'
export type ScaleMode = 'exaggerated' | 'log' | 'proportional'

export interface Visibility {
  planets: boolean
  orbits: boolean
  labels: boolean
}

/** A body's screen position this frame, for the DOM labels and picking. */
export interface ProjectedBody {
  name: BodyName
  x: number
  y: number
  /** In front of the camera and inside the canvas. */
  visible: boolean
  /** The body's drawn radius on screen, px, so a label can sit beside its disc. */
  radiusPx: number
}

/** Scene units per au in the proportional (linear) mode. */
const LINEAR_K = 10
/** Orbit samples per planet. */
const ORBIT_SAMPLES = 256
/** Resample orbits when the sim date has moved this far (their elements drift slowly). */
const ORBIT_RESAMPLE_DAYS = 3650
/**
 * Enlarged radii, scene units, ordered like the real ones. The Sun stays inside
 * Mercury's perihelion (0.42 units under place3d), so it never swallows the orbit.
 */
const EXAGGERATED_RADIUS: Record<BodyName, number> = {
  Sun: 0.22,
  Mercury: 0.03,
  Venus: 0.045,
  Earth: 0.048,
  Mars: 0.038,
  Jupiter: 0.12,
  Saturn: 0.105,
  Uranus: 0.075,
  Neptune: 0.075,
}
/**
 * Bodies never draw smaller than this on screen, px: zoomed out they keep a readable
 * size, zoomed in they grow with the scene. Ordered like the real radii.
 */
const MIN_PX: Record<BodyName, number> = {
  Sun: 10,
  Mercury: 3.5,
  Venus: 4,
  Earth: 4.5,
  Mars: 4,
  Jupiter: 6.5,
  Saturn: 6,
  Uranus: 5,
  Neptune: 5,
}
/** Markers in the proportional mode, where true sizes are far below a pixel. */
const MIN_PX_PROPORTIONAL = 2.5
/** Real radii, km, for the proportional mode. */
const TRUE_RADIUS_KM: Record<BodyName, number> = {
  Sun: 695_700,
  Mercury: 2_440,
  Venus: 6_052,
  Earth: 6_371,
  Mars: 3_390,
  Jupiter: 69_911,
  Saturn: 58_232,
  Uranus: 25_362,
  Neptune: 24_622,
}
/** A focused body: the camera sits this many of its radii away (at least FOCUS_MIN_DISTANCE). */
const FOCUS_RADII = 30
const FOCUS_MIN_DISTANCE = 1.2
const DAYS_PER_YEAR = 365.25
const MIN_FRAME_MS = 30
/** While the clock plays at 1x nothing moves visibly; redraw this often at most. */
const SLOW_CLOCK_REDRAW_MS = 1000

/** The simulation clock as the renderer sees it: read each frame, never subscribed to. */
export interface ClockReader {
  /** Simulated epoch ms now. */
  simTime: () => number
  /** Whether the clock runs, and how fast (sim seconds per wall second). */
  motion: () => { playing: boolean; rate: number }
}

export interface OrreryRendererOptions {
  width: number
  height: number
  reducedMotion: boolean
  onContextLost: () => void
  clock: ClockReader
}

export class OrreryRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.01, 200_000)
  private readonly controls: OrbitControls
  private readonly bodies = new Map<BodyName, Mesh>()
  private readonly orbits = new Map<PlanetName, Line>()
  private readonly orbitGroup = new Group()
  private readonly bodyGroup = new Group()
  private mode: ScaleMode = 'exaggerated'
  private visibility: Visibility = { planets: true, orbits: true, labels: true }
  private focusBody: BodyName | null = null
  private orbitJd = Number.NaN
  private onFrame: ((items: readonly ProjectedBody[]) => void) | null = null
  private width: number
  private height: number
  private frameId = 0
  private lastDraw = 0
  private dirty = true
  private attached = false
  private disposed = false
  private readonly reducedMotion: boolean
  private readonly onContextLost: () => void
  private readonly clock: ClockReader
  private readonly scratch = new Vector3()
  private preset: FocusPreset | null = 'inner'
  /** The view is still exactly a preset's (the user has not turned or zoomed): refit on resize. */
  private presetPristine = true
  /** Px of the stage covered by the inspector, so the focus sits in what is left (#91). */
  private inset = { right: 0, bottom: 0 }
  /** A camera fly in progress: from/to positions and targets, wall-clock start. */
  private flight: {
    fromPos: Vector3
    toPos: Vector3
    fromTarget: Vector3
    toTarget: Vector3
    start: number
    ms: number
  } | null = null

  constructor(options: OrreryRendererOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true })
    this.canvas = this.renderer.domElement
    this.canvas.dataset['orreryWebgl'] = ''
    this.canvas.setAttribute('aria-hidden', 'true')
    this.width = options.width
    this.height = options.height
    this.reducedMotion = options.reducedMotion
    this.onContextLost = options.onContextLost
    this.clock = options.clock
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(this.width, this.height, false)
    this.camera.aspect = this.width / Math.max(1, this.height)
    this.camera.updateProjectionMatrix()

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = !this.reducedMotion
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 0.5
    this.controls.maxDistance = 120_000
    this.controls.addEventListener('change', this.markDirty)
    this.controls.addEventListener('start', this.onUserCamera)

    this.buildScene()
    this.applyPreset('inner', true)
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.dataset['orreryScale'] = this.mode
  }

  private buildScene(): void {
    this.scene.add(this.orbitGroup, this.bodyGroup)
    for (const name of ['Sun', ...PLANETS] as BodyName[]) {
      const mesh = new Mesh(
        new SphereGeometry(1, 24, 16),
        new MeshBasicMaterial({ color: new Color(BODY_HEX[name] ?? HUD_HEX) }),
      )
      mesh.name = name
      this.bodies.set(name, mesh)
      this.bodyGroup.add(mesh)
    }
    for (const planet of PLANETS) {
      const line = new Line(
        new BufferGeometry(),
        new LineBasicMaterial({
          color: new Color(BODY_HEX[planet] ?? HUD_HEX),
          transparent: true,
          opacity: 0.32,
        }),
      )
      this.orbits.set(planet, line)
      this.orbitGroup.add(line)
    }
  }

  /** Scene position of a heliocentric ecliptic position under the current mode. */
  private toScene(pos: { x: number; y: number; z: number }): Vector3 {
    if (this.mode === 'proportional') {
      return new Vector3(pos.x * LINEAR_K, pos.z * LINEAR_K, -pos.y * LINEAR_K)
    }
    const p = place3d(pos)
    return new Vector3(p.x, p.y, p.z)
  }

  /** A body's radius in scene units before the minimum on-screen size is applied. */
  private radiusOf(name: BodyName): number {
    if (this.mode === 'exaggerated') return EXAGGERATED_RADIUS[name]
    if (this.mode === 'log') return EXAGGERATED_RADIUS[name] * 0.45
    return (TRUE_RADIUS_KM[name] / AU_KM) * LINEAR_K
  }

  private minPx(name: BodyName): number {
    if (this.mode === 'proportional') return MIN_PX_PROPORTIONAL
    return this.mode === 'log' ? MIN_PX[name] * 0.6 : MIN_PX[name]
  }

  /** Scene units that cover one px at a distance from the camera. */
  private unitsPerPx(depth: number): number {
    return (2 * Math.tan(((FOV / 2) * Math.PI) / 180) * depth) / Math.max(1, this.height)
  }

  /** Each frame: grow any body that would draw below its minimum on-screen size. */
  private applyMinPixelSize(): void {
    for (const [name, mesh] of this.bodies) {
      const depth = mesh.position.distanceTo(this.camera.position)
      mesh.scale.setScalar(Math.max(this.radiusOf(name), this.minPx(name) * this.unitsPerPx(depth)))
    }
  }

  /** Scene radius of a distance from the Sun, under the current mode. */
  private readonly sceneRadius = (au: number) => this.toScene({ x: au, y: 0, z: 0 }).length()

  private sampleOrbits(jd: number): void {
    for (const planet of PLANETS) {
      const years = periodYears(planet)
      const points: number[] = []
      for (let i = 0; i <= ORBIT_SAMPLES; i += 1) {
        const t = jd + (i / ORBIT_SAMPLES) * years * DAYS_PER_YEAR
        const v = this.toScene(heliocentric(planet, t))
        points.push(v.x, v.y, v.z)
      }
      const line = this.orbits.get(planet)
      if (!line) continue
      line.geometry.dispose()
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
      line.geometry = geometry
    }
    this.orbitJd = jd
  }

  private placeBodies(jd: number): void {
    for (const [name, mesh] of this.bodies) {
      const pos = name === 'Sun' ? { x: 0, y: 0, z: 0 } : heliocentric(name, jd)
      mesh.position.copy(this.toScene(pos))
      mesh.scale.setScalar(this.radiusOf(name))
    }
  }

  /** Where a body is drawn now, scene space. */
  bodyPosition(name: BodyName): Vector3 {
    return this.bodies.get(name)?.position.clone() ?? new Vector3()
  }

  attach(el: HTMLElement): void {
    if (this.disposed) return
    el.append(this.canvas)
    this.attached = true
    this.markDirty()
  }

  detach(): void {
    this.attached = false
    cancelAnimationFrame(this.frameId)
    this.frameId = 0
    this.clearTick()
    this.canvas.dataset['orreryAnimating'] = 'false'
    this.canvas.remove()
  }

  resize(width: number, height: number): void {
    if (width < 1 || height < 1) return
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.applyInset()
    // A preset is framed for an aspect; refit it while the user hasn't moved the camera.
    if (this.preset && this.presetPristine) this.applyPreset(this.preset, true)
    this.markDirty()
  }

  /**
   * Keep the focus centred in the part of the stage the inspector leaves free, by
   * shifting the projection window rather than the camera (#91).
   */
  setViewInset(right: number, bottom: number): void {
    this.inset = { right: Math.max(0, right), bottom: Math.max(0, bottom) }
    this.applyInset()
    this.markDirty()
  }

  private applyInset(): void {
    const { right, bottom } = this.inset
    if (right === 0 && bottom === 0) this.camera.clearViewOffset()
    else
      this.camera.setViewOffset(
        this.width,
        this.height,
        right / 2,
        bottom / 2,
        this.width,
        this.height,
      )
    this.camera.updateProjectionMatrix()
  }

  setOnFrame(cb: ((items: readonly ProjectedBody[]) => void) | null): void {
    this.onFrame = cb
    this.markDirty()
  }

  setScaleMode(mode: ScaleMode): void {
    if (mode === this.mode) return
    // Keep the same framing: refit the current preset in the new mode.
    this.mode = mode
    this.canvas.dataset['orreryScale'] = mode
    this.orbitJd = Number.NaN
    this.updateBodies(true)
    if (this.focusBody) this.focusOn(this.focusBody, true)
    else this.applyPreset(this.preset ?? 'inner', true)
  }

  setVisibility(v: Visibility): void {
    this.visibility = v
    this.bodyGroup.visible = v.planets
    this.orbitGroup.visible = v.orbits
    this.markDirty()
  }

  /** Frame a region around the Sun so its edge orbit nearly fills the stage (framing.ts). */
  applyPreset(preset: FocusPreset, instant = this.reducedMotion): void {
    this.preset = preset
    this.presetPristine = true
    this.focusBody = null
    this.canvas.dataset['orreryFocus'] = preset
    const toPos = framePreset(preset, this.width / Math.max(1, this.height), this.sceneRadius)
    this.flyTo(toPos, new Vector3(0, 0, 0), instant)
  }

  /** Fly to a body and keep following it as it moves. */
  focusOn(name: BodyName, instant = this.reducedMotion): void {
    this.focusBody = name
    this.preset = null
    this.canvas.dataset['orreryFocus'] = name
    this.updateBodies(true)
    const target = this.bodyPosition(name)
    const r = this.radiusOf(name)
    const distance = Math.max(r * FOCUS_RADII, FOCUS_MIN_DISTANCE)
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    if (dir.lengthSq() === 0) dir.set(0, 0.5, 1).normalize()
    this.flyTo(target.clone().add(dir.multiplyScalar(distance)), target, instant)
  }

  private flyTo(toPos: Vector3, toTarget: Vector3, instant: boolean): void {
    if (instant) {
      this.flight = null
      this.camera.position.copy(toPos)
      this.controls.target.copy(toTarget)
      this.controls.update()
      this.markDirty()
      return
    }
    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
      start: performance.now(),
      ms: 900,
    }
    this.markDirty()
  }

  /** The user turned or zoomed: stop any flight, and stop refitting the preset. */
  private readonly onUserCamera = () => {
    this.flight = null
    this.presetPristine = false
  }

  /** Nearest body to a canvas point within `radius` px, or null. */
  pick(x: number, y: number, radius = 12): BodyName | null {
    let best: BodyName | null = null
    let bestD = radius
    for (const item of this.project()) {
      if (!item.visible) continue
      const d = Math.hypot(item.x - x, item.y - y)
      if (d <= bestD) {
        bestD = d
        best = item.name
      }
    }
    return best
  }

  private project(): ProjectedBody[] {
    const out: ProjectedBody[] = []
    for (const [name, mesh] of this.bodies) {
      const depth = mesh.position.distanceTo(this.camera.position)
      this.scratch.copy(mesh.position).project(this.camera)
      const x = ((this.scratch.x + 1) / 2) * this.width
      const y = ((1 - this.scratch.y) / 2) * this.height
      const visible = this.scratch.z < 1 && x >= 0 && x <= this.width && y >= 0 && y <= this.height
      const radiusPx = depth > 0 ? mesh.scale.x / this.unitsPerPx(depth) : 0
      out.push({ name, x, y, visible, radiusPx })
    }
    return out
  }

  private readonly markDirty = () => {
    this.dirty = true
    this.schedule()
  }

  /** The clock changed (a scrub, a rate, play or pause): draw the new moment. */
  invalidate(): void {
    this.markDirty()
  }

  /**
   * The only place a frame is requested, so there is never more than one pending (#91).
   * Before this, frame() requested its successor directly while controls.update()'s
   * 'change' event had already scheduled one: each camera move doubled the loop, and
   * a soak of 30 preset/drag cycles left 12,361 loops running.
   */
  private schedule(): void {
    if (!this.attached || this.disposed || this.frameId !== 0) return
    this.clearTick()
    this.frameId = requestAnimationFrame(this.frame)
  }

  /** A 1x clock moves nothing visibly between frames: wake once a second instead of looping. */
  private tickTimer: ReturnType<typeof setTimeout> | null = null

  private clearTick(): void {
    if (this.tickTimer !== null) clearTimeout(this.tickTimer)
    this.tickTimer = null
  }

  private scheduleTick(): void {
    if (!this.attached || this.disposed || this.tickTimer !== null || this.frameId !== 0) return
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null
      this.markDirty()
    }, SLOW_CLOCK_REDRAW_MS)
  }

  private lastJd = Number.NaN

  private updateBodies(force = false): void {
    const jd = jdFromDate(new Date(this.clock.simTime()))
    if (!force && jd === this.lastJd) return
    this.lastJd = jd
    if (!(Math.abs(jd - this.orbitJd) < ORBIT_RESAMPLE_DAYS)) this.sampleOrbits(jd)
    this.placeBodies(jd)
    if (this.focusBody) {
      const target = this.bodyPosition(this.focusBody)
      const shift = target.clone().sub(this.controls.target)
      if (!this.flight && shift.lengthSq() > 0) {
        this.camera.position.add(shift)
        this.controls.target.copy(target)
      }
    }
  }

  private readonly frame = (now: number) => {
    this.frameId = 0
    if (!this.attached || this.disposed) return
    const clock = this.clock.motion()
    const moving = clock.playing && clock.rate > 1
    const flying = this.flight !== null
    if (flying && this.flight) {
      const f = this.flight
      const t = Math.min(1, (now - f.start) / f.ms)
      const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k)
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k)
      if (t >= 1) this.flight = null
    }
    const damping = this.controls.update()
    if (this.dirty || moving || flying || damping) {
      if (now - this.lastDraw >= MIN_FRAME_MS || this.dirty || flying) {
        this.updateBodies()
        this.applyMinPixelSize()
        this.renderer.render(this.scene, this.camera)
        this.lastDraw = now
        this.dirty = false
        this.draws += 1
        this.reportStats()
        const projected = this.project()
        // Which bodies are in view, for e2e checks of what each preset frames.
        this.canvas.dataset['orreryOnscreen'] = projected
          .filter((p) => p.visible)
          .map((p) => p.name)
          .join(',')
        if (this.onFrame) this.onFrame(this.visibility.labels ? projected : [])
      }
    }
    // Loop only while something moves on screen. When it settles, stop; a 1x clock
    // then wakes the renderer once a second, and nothing else runs.
    const animating = moving || flying || damping || this.dirty
    this.canvas.dataset['orreryAnimating'] = String(animating)
    if (animating) this.schedule()
    else if (clock.playing) this.scheduleTick()
  }

  /** Draws so far; with renderer.info, mirrored on the canvas for the soak test (#91). */
  private draws = 0

  private reportStats(): void {
    const { memory, programs, render } = this.renderer.info
    const d = this.canvas.dataset
    d['orreryDraws'] = String(this.draws)
    d['orreryGeometries'] = String(memory.geometries)
    d['orreryTextures'] = String(memory.textures)
    d['orreryPrograms'] = String(programs?.length ?? 0)
    d['orreryCalls'] = String(render.calls)
  }

  private readonly handleContextLost = (e: Event) => {
    e.preventDefault()
    this.onContextLost()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frameId)
    this.clearTick()
    this.controls.dispose()
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    for (const mesh of this.bodies.values()) {
      mesh.geometry.dispose()
      ;(mesh.material as MeshBasicMaterial).dispose()
    }
    for (const line of this.orbits.values()) {
      line.geometry.dispose()
      ;(line.material as LineBasicMaterial).dispose()
    }
    this.renderer.dispose()
    this.canvas.remove()
  }
}

/** Orbital period from Kepler's third law, years, using Table 1's semi-major axis. */
function periodYears(planet: PlanetName): number {
  const a = ELEMENTS[planet].a[0]
  return Math.sqrt(a * a * a)
}
