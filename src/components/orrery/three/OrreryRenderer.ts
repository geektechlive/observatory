/**
 * The 3D orrery (#91). Its own WebGL context, created once for the page's lifetime like
 * the globe's (GlobeHost): switching tabs detaches the canvas, never rebuilds it. Draws
 * on demand: when the camera moves, the clock plays or the view changes, and not at all
 * while detached or hidden. Positions come from src/lib/orrery; colours from palette.ts.
 */
import {
  AmbientLight,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import {
  AU_KM,
  ELEMENTS,
  heliocentric,
  HELIOPAUSE_LABEL,
  HELIOPAUSE_V1_AU,
  jdFromDate,
  place3d,
  type PlanetName,
  PLANETS,
} from '@/lib/orrery'
import type { BodyName } from '@/lib/orrery/bodies'
import { earthState } from '@/lib/orrery/craftState'
import { BODY_HEX, HUD_HEX } from '@/lib/palette'
import type { OrreryTrack } from '@/schemas/orreryBodies'

import type { CraftFilter } from '../craftFilter'
import { BodySkins } from './bodySkins'
import { CraftLayer } from './craftLayer'
import { type FocusPreset, FOV, frameView } from './framing'
import { loadCorsImage, SunImage, type SunImageState } from './sunImage'

export type { CraftFilter } from '../craftFilter'
export type { FocusPreset } from './framing'
export type { SunImageState } from './sunImage'
export type ScaleMode = 'exaggerated' | 'log' | 'proportional'
/** A planet or the Sun by name, or a craft by its namespaced id (`naif:-31`). */
export type SceneKey = string

export interface Visibility {
  planets: boolean
  orbits: boolean
  labels: boolean
}

/** A body's screen position this frame, for the DOM labels and picking. */
export interface ProjectedBody {
  /** Its key: a planet's name, or a craft's id. */
  name: SceneKey
  /** What its label says. */
  label: string
  /** 'ring': the heliopause marker's label anchor (#93), not a body. */
  kind: 'body' | 'craft' | 'ring'
  /** Screen position, px; may lie outside the canvas (rim markers use that). */
  x: number
  y: number
  /** In front of the camera and inside the canvas. */
  visible: boolean
  /** Behind the camera: its projected position is mirrored. */
  behind: boolean
  /** The body's drawn radius on screen, px, so a label can sit beside its disc. */
  radiusPx: number
  /** Craft: distance from the Sun now, au (for a rim marker's label). */
  sunAu?: number
  /** Craft: its group and NAIF id. */
  group?: string
  naifId?: string
}

/** Craft markers: tiny in the scene, a few px on screen. */
const CRAFT_RADIUS = { exaggerated: 0.02, log: 0.012, proportional: 0.0005 } as const
const CRAFT_MIN_PX = 3
const HELIOPAUSE_SAMPLES = 180
/** Heliosphere refits to hold the craft once the sim date has moved this far, days. */
const HELIOSPHERE_REFIT_DAYS = 180
/** Camera distance when focusing a craft, scene units, per scale mode. */
const CRAFT_FOCUS_DISTANCE = { exaggerated: 4, log: 4, proportional: 40 } as const

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
/**
 * Sunlight for the mapped planets (#105): a point light at the Sun with no falloff, since
 * the scene's distances are compressed, plus enough ambient that the night side still
 * reads. Intensities are in three's physical units (pi = full albedo face-on).
 */
const SUNLIGHT_INTENSITY = Math.PI * 1.1
const AMBIENT_INTENSITY = Math.PI * 0.12
/** A body this far past the stage edge (NDC) still counts as in view for its map. */
const SKIN_VIEW_NDC = 1.15
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
  /** Spacecraft from JPL Horizons (#93); placed through the same scale as the planets. */
  private readonly craft = new CraftLayer((pos) => this.toScene(pos))
  /** Faint dashed ring where Voyager 1 crossed the heliopause (#93), approximate. */
  private readonly heliopause = new Line(
    new BufferGeometry(),
    new LineDashedMaterial({
      color: new Color(HUD_HEX),
      transparent: true,
      opacity: 0.35,
      dashSize: 0.4,
      gapSize: 0.3,
    }),
  )
  /** Real imagery on the planets and the live Sun (#105). */
  private readonly skins = new BodySkins(
    (url) => new TextureLoader().loadAsync(url),
    () => {
      this.markDirty()
    },
  )
  private readonly sunImage = new SunImage({
    fetchJson: (url) => fetch(url),
    loadImage: loadCorsImage,
    onChange: (state) => {
      this.onSunImageChange(state)
    },
  })
  private sunState: SunImageState = { kind: 'loading' }
  private onSunState: ((state: SunImageState) => void) | null = null
  /** Earth's Horizons samples, used for Earth where they cover the date (#93). */
  private earthTrack: OrreryTrack | null = null
  private mode: ScaleMode = 'exaggerated'
  private visibility: Visibility = { planets: true, orbits: true, labels: true }
  private focusBody: SceneKey | null = null
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
    this.scene.add(
      this.orbitGroup,
      this.bodyGroup,
      this.craft.paths,
      this.craft.stalks,
      this.craft.markers,
    )
    this.orbitGroup.add(this.heliopause)
    this.scene.add(
      new AmbientLight(new Color(1, 1, 1), AMBIENT_INTENSITY),
      new PointLight(new Color(1, 1, 1), SUNLIGHT_INTENSITY, 0, 0),
    )
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
    this.skins.build(this.bodies)
  }

  private onSunImageChange(state: SunImageState): void {
    const sun = this.bodies.get('Sun')
    if (state.kind === 'live' && sun) this.skins.setSunImage(sun, state.image)
    this.sunState = state
    this.canvas.dataset['orrerySun'] = state.kind
    this.onSunState?.(state)
    this.markDirty()
  }

  /** The live Sun's state, for the inspector (#105). Called now and on every change. */
  setOnSunImage(cb: ((state: SunImageState) => void) | null): void {
    this.onSunState = cb
    cb?.(this.sunState)
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
  private radiusOf(name: SceneKey): number {
    if (!isBody(name)) return CRAFT_RADIUS[this.mode]
    if (this.mode === 'exaggerated') return EXAGGERATED_RADIUS[name]
    if (this.mode === 'log') return EXAGGERATED_RADIUS[name] * 0.45
    return (TRUE_RADIUS_KM[name] / AU_KM) * LINEAR_K
  }

  private minPx(name: SceneKey): number {
    if (!isBody(name)) return CRAFT_MIN_PX
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
    for (const c of this.craft.visible()) {
      const depth = c.mesh.position.distanceTo(this.camera.position)
      c.mesh.scale.setScalar(Math.max(this.radiusOf(c.key), CRAFT_MIN_PX * this.unitsPerPx(depth)))
    }
    // Maps once a planet is big enough on screen; the flat dot below that (#105).
    // A body out of view counts as size 0, so its map is not fetched until it is seen.
    const skinned = this.skins.apply((planet) => {
      const mesh = this.bodies.get(planet)
      if (!mesh) return 0
      this.scratch.copy(mesh.position).project(this.camera)
      const { x, y, z } = this.scratch
      if (z > 1 || Math.abs(x) > SKIN_VIEW_NDC || Math.abs(y) > SKIN_VIEW_NDC) return 0
      return mesh.scale.x / this.unitsPerPx(mesh.position.distanceTo(this.camera.position))
    }, this.bodies)
    this.canvas.dataset['orrerySkins'] = skinned.join(',')
    this.skins.faceCamera(this.camera.position)
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
    // The heliopause marker (#93): a ring in the ecliptic where Voyager 1 crossed. Dashed,
    // because it is approximate: the real boundary is neither a sphere nor fixed.
    const r = this.sceneRadius(HELIOPAUSE_V1_AU)
    const ring: number[] = []
    for (let i = 0; i <= HELIOPAUSE_SAMPLES; i += 1) {
      const a = (i / HELIOPAUSE_SAMPLES) * Math.PI * 2
      ring.push(r * Math.cos(a), 0, r * Math.sin(a))
    }
    this.heliopause.geometry.dispose()
    const ringGeometry = new BufferGeometry()
    ringGeometry.setAttribute('position', new Float32BufferAttribute(ring, 3))
    this.heliopause.geometry = ringGeometry
    this.heliopause.computeLineDistances()
    this.orbitJd = jd
  }

  /**
   * Where the heliopause ring's label goes: its leftmost point in view (the label runs
   * right, into the stage; from the rightmost it ran off the edge), or null.
   */
  private heliopauseAnchor(): Pick<ProjectedBody, 'x' | 'y'> | null {
    const r = this.sceneRadius(HELIOPAUSE_V1_AU)
    let best: { x: number; y: number } | null = null
    for (let i = 0; i < HELIOPAUSE_SAMPLES; i += 1) {
      const a = (i / HELIOPAUSE_SAMPLES) * Math.PI * 2
      this.scratch.set(r * Math.cos(a), 0, r * Math.sin(a)).project(this.camera)
      if (this.scratch.z > 1 || Math.abs(this.scratch.x) > 0.8 || Math.abs(this.scratch.y) > 0.8) {
        continue
      }
      const x = ((this.scratch.x + 1) / 2) * this.width
      const y = ((1 - this.scratch.y) / 2) * this.height
      if (!best || x < best.x) best = { x, y }
    }
    return best
  }

  private placeBodies(jd: number): void {
    for (const [name, mesh] of this.bodies) {
      // Earth from the same Horizons answer as the craft where it covers the date, so a
      // craft at L1 sits where it should relative to Earth (#93); Kepler elsewhere.
      const pos =
        name === 'Sun'
          ? { x: 0, y: 0, z: 0 }
          : name === 'Earth' && this.earthTrack
            ? earthState(this.earthTrack, jd).position
            : heliocentric(name, jd)
      mesh.position.copy(this.toScene(pos))
      mesh.scale.setScalar(this.radiusOf(name))
    }
    this.skins.orient(jd)
    this.craft.place(jd, this.radiusOf('craft'))
  }

  /** Where a body or craft is drawn now, scene space. */
  bodyPosition(name: SceneKey): Vector3 {
    if (isBody(name)) return this.bodies.get(name)?.position.clone() ?? new Vector3()
    return this.craft.position(name) ?? new Vector3()
  }

  /** The orrery's craft, Earth and Moon from /api/orrery-bodies (#93). */
  setTracks(tracks: readonly OrreryTrack[]): void {
    this.earthTrack = tracks.find((t) => t.naifId === '399') ?? null
    this.craft.setTracks(tracks)
    this.updateBodies(true)
    // Craft that arrive after the first frame still get a Heliosphere frame that holds them.
    if (this.preset === 'heliosphere') this.refitPreset()
    this.markDirty()
  }

  setCraftFilter(filter: CraftFilter): void {
    this.craft.setFilter(filter)
    this.updateBodies(true)
    if (this.preset === 'heliosphere') this.refitPreset()
    this.markDirty()
  }

  /** Craft DSN is talking to now, by NAIF id (the "In DSN contact" filter). */
  setDsnIds(ids: ReadonlySet<string>): void {
    this.craft.setDsnIds(ids)
    this.updateBodies(true)
    this.markDirty()
  }

  /** Draw a craft's whole-mission path (spec Part 14), or none. */
  setTrajectory(key: SceneKey | null): void {
    this.craft.setTrajectory(key && this.craft.has(key) ? key : null)
    this.updateBodies(true)
    this.markDirty()
  }

  attach(el: HTMLElement): void {
    if (this.disposed) return
    el.append(this.canvas)
    this.attached = true
    this.sunImage.start()
    this.markDirty()
  }

  detach(): void {
    this.attached = false
    cancelAnimationFrame(this.frameId)
    this.frameId = 0
    this.clearTick()
    this.sunImage.stop()
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
    this.craft.rebuildTrajectory()
    this.updateBodies(true)
    if (this.focusBody) this.focusOn(this.focusBody, true)
    else this.applyPreset(this.preset ?? 'inner', true)
  }

  setVisibility(v: Visibility): void {
    this.visibility = v
    this.bodyGroup.visible = v.planets
    this.orbitGroup.visible = v.orbits
    // Out-of-plane stalks are orbit furniture: the same switch (#93).
    this.craft.setStalksVisible(v.orbits)
    this.markDirty()
  }

  /**
   * Frame a region around the Sun so its edge orbit nearly fills the stage (framing.ts).
   * Heliosphere also holds every deep-space craft drawn, in 3D and above the time bar
   * (#93: Voyager 2, 90 au south of the ecliptic, fell below a ring-only frame).
   */
  applyPreset(preset: FocusPreset, instant = this.reducedMotion): void {
    this.preset = preset
    this.presetPristine = true
    this.focusBody = null
    this.canvas.dataset['orreryFocus'] = preset
    const points =
      preset === 'heliosphere'
        ? this.craft
            .visible()
            .filter((c) => c.group === 'deep-space')
            .map((c) => c.mesh.position.clone())
        : []
    this.fitJd = this.lastJd
    const view = frameView(preset, this.width / Math.max(1, this.height), this.sceneRadius, {
      points,
      bottomReserveNdc: (2 * this.reserveBottomPx) / Math.max(1, this.height),
    })
    this.flyTo(view.position, view.target, instant)
  }

  /** The stage's bottom strip the time bar covers, px: framing keeps craft above it. */
  setFrameReserve(bottomPx: number): void {
    if (Math.abs(bottomPx - this.reserveBottomPx) < 1) return
    this.reserveBottomPx = Math.max(0, bottomPx)
    this.refitPreset()
  }

  /** Refit the current preset while the user hasn't moved the camera. */
  private refitPreset(): void {
    if (this.preset && this.presetPristine) this.applyPreset(this.preset, true)
  }

  /** Fly to a body or craft and keep following it as it moves. */
  focusOn(name: SceneKey, instant = this.reducedMotion): void {
    this.updateBodies(true)
    // A craft with no data at this date is hidden: there is nowhere to fly to.
    if (!isBody(name) && !this.craft.position(name)) return
    this.focusBody = name
    this.preset = null
    this.canvas.dataset['orreryFocus'] = name
    const target = this.bodyPosition(name)
    const r = this.radiusOf(name)
    // A craft is a marker, not a body: stand back far enough that it stays a few px and
    // its trajectory reads around it (#93), instead of filling the view.
    const distance = isBody(name)
      ? Math.max(r * FOCUS_RADII, FOCUS_MIN_DISTANCE)
      : CRAFT_FOCUS_DISTANCE[this.mode]
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

  /** Nearest body or craft to a canvas point within `radius` px, or null. */
  pick(x: number, y: number, radius = 12): SceneKey | null {
    let best: SceneKey | null = null
    let bestD = radius
    for (const item of this.project()) {
      if (!item.visible || item.kind === 'ring') continue
      const d = Math.hypot(item.x - x, item.y - y)
      if (d <= bestD) {
        bestD = d
        best = item.name
      }
    }
    return best
  }

  private projectOne(
    mesh: Mesh,
  ): Pick<ProjectedBody, 'x' | 'y' | 'visible' | 'behind' | 'radiusPx'> {
    const depth = mesh.position.distanceTo(this.camera.position)
    this.scratch.copy(mesh.position).project(this.camera)
    const x = ((this.scratch.x + 1) / 2) * this.width
    const y = ((1 - this.scratch.y) / 2) * this.height
    const behind = this.scratch.z > 1
    const visible = !behind && x >= 0 && x <= this.width && y >= 0 && y <= this.height
    const radiusPx = depth > 0 ? mesh.scale.x / this.unitsPerPx(depth) : 0
    return { x, y, visible, behind, radiusPx }
  }

  private project(): ProjectedBody[] {
    const out: ProjectedBody[] = []
    if (this.visibility.planets) {
      for (const [name, mesh] of this.bodies) {
        out.push({ name, label: name, kind: 'body', ...this.projectOne(mesh) })
      }
    }
    for (const c of this.craft.visible()) {
      out.push({
        name: c.key,
        label: c.label,
        kind: 'craft',
        sunAu: c.sunAu,
        group: c.group,
        naifId: c.naifId,
        ...this.projectOne(c.mesh),
      })
    }
    const anchor = this.visibility.orbits ? this.heliopauseAnchor() : null
    if (anchor) {
      out.push({
        name: 'heliopause',
        label: HELIOPAUSE_LABEL,
        kind: 'ring',
        ...anchor,
        visible: true,
        behind: false,
        radiusPx: 0,
      })
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
  /** The sim date Heliosphere was last fitted at: craft drift, so it refits when far. */
  private fitJd = Number.NaN
  private reserveBottomPx = 0

  private updateBodies(force = false): void {
    const jd = jdFromDate(new Date(this.clock.simTime()))
    if (!force && jd === this.lastJd) return
    this.lastJd = jd
    if (!(Math.abs(jd - this.orbitJd) < ORBIT_RESAMPLE_DAYS)) this.sampleOrbits(jd)
    this.placeBodies(jd)
    if (this.preset === 'heliosphere' && !(Math.abs(jd - this.fitJd) < HELIOSPHERE_REFIT_DAYS)) {
      this.refitPreset()
    }
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
    // Craft drawn now, and the selected craft's path split (#93), for the e2e checks.
    d['orreryCraft'] = String(this.craft.visible().length)
    const path = this.craft.trajectoryCounts()
    d['orreryTrajectory'] = path ? `${String(path.past)},${String(path.future)}` : ''
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
    this.craft.dispose()
    this.sunImage.stop()
    this.skins.dispose()
    this.heliopause.geometry.dispose()
    this.heliopause.material.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }
}

const BODY_NAMES = new Set<string>(['Sun', ...PLANETS])

/** A planet or the Sun (drawn from the elements), as opposed to a craft key. */
function isBody(name: SceneKey): name is BodyName {
  return BODY_NAMES.has(name)
}

/** Orbital period from Kepler's third law, years, using Table 1's semi-major axis. */
function periodYears(planet: PlanetName): number {
  const a = ELEMENTS[planet].a[0]
  return Math.sqrt(a * a * a)
}
