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
  type Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  Sprite,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import type { SatGroupId } from '@/lib/orbit/satCatalog'
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
import type { NeoFilter } from '@/lib/orrery/asteroids'
import type { BodyName } from '@/lib/orrery/bodies'
import { threeQuarterView } from '@/lib/orrery/craftModelFit'
import { attitudeDirection, craftModelFor } from '@/lib/orrery/craftModels'
import { earthState } from '@/lib/orrery/craftState'
import type { OrreryEntry } from '@/lib/orrery/dwarfView'
import {
  CAMERA_NEAR,
  cameraMinDistance,
  EARTH_FRAME_OPEN_CAMERA,
  EARTH_FRAME_UNIT,
  earthFrameBlend,
  earthFrameRadius,
  L1_DISTANCE_KM,
} from '@/lib/orrery/earthFrame'
import { modelForKey, sceneModel } from '@/lib/orrery/modelDescriptor'
import type { MoonBody } from '@/lib/orrery/moonState'
import type { SatSource } from '@/lib/orrery/satController'
import { labelBehindEarth, ORBIT_PRESET_RADII } from '@/lib/orrery/satView'
import { lookupTwinKey } from '@/lib/orrery/smallBodyView'
import { SUVI_FRAME } from '@/lib/orrery/suvi'
import { BODY_HEX, HUD_HEX } from '@/lib/palette'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import type { OrreryApproach } from '@/schemas/orreryNeo'

import { L1_KEY } from '../catalog'
import type { CraftFilter } from '../craftFilter'
import { DEFAULT_PRESET } from '../defaultView'
import { bodyMinPx } from './bodyMinPx'
import { BodySkins } from './bodySkins'
import { CRAFT_ICON_PX, craftIconScale, CraftLayer } from './craftLayer'
import { CraftModelLayer } from './craftModelLayer'
import { EarthNeighbourhood } from './earthNeighbourhood'
import { followShift } from './followShift'
import {
  earthPresetView,
  type FocusPreset,
  type FocusRoom,
  FOV,
  frameView,
  lookupFocusView,
  nearFocusView,
  sunlitFocusDirection,
} from './framing'
import { loadGltfScene } from './gltfLoad'
import { type LookupData, LookupLayer, lookupMarkerRadius } from './lookupLayer'
import { MoonLayer } from './moonLayer'
import { cappedPixelRatio, watchPixelRatio } from './pixelRatio'
import {
  clampRadius,
  craftModelPx,
  DWARF_MIN_PX,
  DWARF_MOON_MIN_PX,
  PX_CEILING,
  SMALL_BODY_MIN_PX,
} from './pxClamp'
import { isSatKey, type SatInfo, SatLayer, type SatViewState } from './satLayer'
import { satFacing, satModelPx, satRingPx, SceneModelCache, sunOnScreen } from './satModelFit'
import { type SmallBodyGroups, SmallBodyLayer } from './smallBodyLayer'
import { loadCorsImage, SunImage, type SunImageState } from './sunImage'

export type { CraftFilter } from '../craftFilter'
export type { FocusPreset } from './framing'
export type { LookupData } from './lookupLayer'
export type { SatInfo, SatMode, SatViewState } from './satLayer'
export type { SmallBodyGroups } from './smallBodyLayer'
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
  /**
   * 'ring': the heliopause marker's label anchor (#93), not a body. 'asteroid': a close
   * approach (#92). 'marker': the L1 point on the Sun–Earth line (#92). 'satellite': the
   * chosen satellite (#98); the others have no labels. 'lookup': an object looked up at
   * JPL and shown (#145). 'smallbody': a comet, interstellar object or dwarf planet
   * (#99), its group in `group`.
   */
  kind:
    | 'body'
    | 'craft'
    | 'moon'
    | 'ring'
    | 'asteroid'
    | 'marker'
    | 'satellite'
    | 'lookup'
    | 'smallbody'
  /** Screen position, px; may lie outside the canvas (rim markers use that). */
  x: number
  y: number
  /** In front of the camera and inside the canvas. */
  visible: boolean
  /** Behind the camera: its projected position is mirrored. */
  behind: boolean
  /**
   * Earth, as drawn, stands between the camera and it (#219): its label still sits where
   * it projects, over Earth, so the page draws it faint. Never for Earth itself.
   */
  behindEarth?: boolean
  /** The body's drawn radius on screen, px, so a label can sit beside its disc. */
  radiusPx: number
  /** Its distance from the camera, scene units (#126: a craft far beyond the focus). */
  depth: number
  /** Craft: distance from the Sun now, au (for a rim marker's label). */
  sunAu?: number
  /** Craft: its group and NAIF id. */
  group?: string
  naifId?: string
  /** Moon: the planet it circles (#107). */
  parent?: string
  /** Asteroid: on JPL's potentially hazardous list (#92). */
  pha?: boolean
  /** Asteroid: chosen through a looked-up object it draws (#216). */
  chosen?: boolean
}

export { L1_KEY } from '../catalog'

/** Craft markers: tiny in the scene, a few px on screen. */
const CRAFT_RADIUS = { exaggerated: 0.02, log: 0.012, proportional: 0.0005 } as const
/** Moons never draw smaller than this, px (#107). */
const MOON_MIN_PX = 2.5
/** Close approaches and the L1 marker never draw smaller than these, px (#92). */
const ASTEROID_MIN_PX = 2.5
const L1_MIN_PX = 3.5
/** The chosen satellite's marker never draws smaller than this, px (#98). */
const SAT_MARKER_MIN_PX = 4
/** A looked-up object this close to Earth, au, is framed with Earth as well as the Sun (#145). */
const LOOKUP_WITH_EARTH_AU = 3
/** A re-entry ring around a satellite never draws smaller than this, px (#101). */
const SAT_REENTRY_MIN_PX = 9
/** Asteroid and L1 labels show once the Earth frame is this open (or the object is chosen). */
const NEAR_LABEL_OPEN = 0.5
/** The Earth–Moon/L1 preset holds this many Earth radii (as drawn) around Earth: L2 at 12.8. */
const EARTH_PRESET_RADII = 13.5
/** Geostationary orbit's radius, km: the Earth orbit preset's extent in the proportional mode. */
const GEO_KM = 42_164
/**
 * A close approach, L1 or an L1/L2 craft is focused from at least this many frame units,
 * inside the open frame, and farther when Earth needs it (#133).
 */
const NEAR_FOCUS_UNITS = 40
/** A near-Earth focus's camera stays within this share of the frame's open distance from Earth (#133). */
const NEAR_OPEN_MARGIN = 0.95
/** Craft within this distance of Earth, au, are drawn in the Earth frame (#92). */
const NEAR_FRAME_AU = 0.1
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
/** A focus camera keeps this multiple of the Sun's drawn corona between it and the Sun. */
const SUN_CLEARANCE_MARGIN = 1.25
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
  /**
   * The satellites' data (#98): /api/orrery-sats and the shared worker. Passed in by the
   * page, so the API client is never imported here: when it was, the bundler split it
   * out of the entry into a chunk of its own, a fifth first-load request and +0.6 kB.
   */
  satSource: SatSource
}

export class OrreryRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(FOV, 1, CAMERA_NEAR, 200_000)
  private readonly controls: OrbitControls
  private readonly bodies = new Map<BodyName, Mesh>()
  private readonly orbits = new Map<PlanetName, Line>()
  private readonly orbitGroup = new Group()
  private readonly bodyGroup = new Group()
  /** Spacecraft from JPL Horizons (#93); placed through the same scale as the planets. */
  private readonly craft = new CraftLayer((pos) => this.toScene(pos))
  /** Major moons and Earth's Moon (#107), around their planets as drawn. */
  private readonly moons = new MoonLayer()
  /**
   * The focused craft as a 3D model (#115). GLTFLoader is its own chunk, fetched with the
   * first model, through the loader the detail view shares (gltfLoad.ts).
   */
  private readonly models = new CraftModelLayer(loadGltfScene, () => {
    this.markDirty()
  })
  /**
   * The chosen satellite as a 3D model in place of its marker (#194): its own, or its
   * family's stand-in. A second layer, so a craft focus and a satellite choice never clear
   * each other; only the chosen one is loaded, and it is disposed when the choice moves.
   */
  private readonly satModels = new CraftModelLayer(loadGltfScene, () => {
    this.markDirty()
  })
  /** Earth's neighbourhood (#92): the Earth frame, close approaches, Sun–Earth line, L1. */
  private readonly near = new EarthNeighbourhood()
  /** An object looked up at JPL and shown (#145): its marker and orbit line. */
  private readonly lookup = new LookupLayer()
  /** Comets and the interstellar objects (#99), each group behind its own switch. */
  private readonly small = new SmallBodyLayer()
  /** Satellites in the Earth frame (#98); a pass or a group arriving asks for a frame. */
  private readonly sats: SatLayer
  private onSatState: ((s: SatViewState) => void) | null = null
  private satStateKey = ''
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
  private stopPixelWatch: () => void = () => undefined
  private disposed = false
  private readonly reducedMotion: boolean
  private readonly onContextLost: () => void
  private readonly clock: ClockReader
  private readonly scratch = new Vector3()
  /** The focused craft model's drawn radius, px, this frame (null when none is drawn). */
  private modelPx: number | null = null
  /** The chosen satellite model's drawn radius, px, this frame (null when none is drawn). */
  private satModelPx: number | null = null
  /** Earth's drawn radius, px, and whether the Sun is on screen, as the satellite model saw them (#194). */
  private satEarthPx: number | null = null
  private sunVisible = false
  /** The chosen satellite's scene model, looked up when the choice or the satellite field changes. */
  private readonly satModelCache = new SceneModelCache()
  private preset: FocusPreset | null = DEFAULT_PRESET
  /** The view is still exactly a preset's (the user has not turned or zoomed): refit on resize. */
  private presetPristine = true
  /** Px of the stage covered by the inspector, so the focus sits in what is left (#91). */
  private inset = { right: 0, bottom: 0, top: 0 }
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
    // A pass or a group arriving asks for a frame.
    this.sats = new SatLayer(() => {
      this.markDirty()
    }, options.satSource)
    this.renderer.setPixelRatio(cappedPixelRatio(window))
    this.renderer.setSize(this.width, this.height, false)
    this.camera.aspect = this.width / Math.max(1, this.height)
    this.camera.updateProjectionMatrix()

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = !this.reducedMotion
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = cameraMinDistance(Number.POSITIVE_INFINITY)
    this.controls.maxDistance = 120_000
    this.controls.addEventListener('change', this.markDirty)
    this.controls.addEventListener('start', this.onUserCamera)

    this.buildScene()
    this.applyPreset(DEFAULT_PRESET, true)
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
      this.models.group,
      this.satModels.group,
      this.near.group,
      this.sats.group,
      this.lookup.marker,
      this.small.markers,
    )
    // Its orbit line is an orbit: the Orbits switch hides it with the planets' (#145), and
    // the comets' and interstellar objects' lines with them (#99).
    this.orbitGroup.add(this.heliopause, this.lookup.path, this.lookup.nearPath, this.small.paths)
    // The Planets switch hides the moons with their planets; their loops are orbits, so
    // they sit with the planets' orbit lines under the Orbits switch too.
    this.bodyGroup.add(this.moons.group)
    this.orbitGroup.add(this.moons.orbits)
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
    if (!isBody(name)) return CRAFT_ICON_PX / 2
    return bodyMinPx(name, this.mode)
  }

  /** Scene units that cover one px at a distance from the camera. */
  private unitsPerPx(depth: number): number {
    return (2 * Math.tan(((FOV / 2) * Math.PI) / 180) * depth) / Math.max(1, this.height)
  }

  /** Each frame: grow any body that would draw below its minimum on-screen size. */
  private applyMinPixelSize(): void {
    const t = this.earthOpenness()
    for (const [name, mesh] of this.bodies) {
      const depth = mesh.position.distanceTo(this.camera.position)
      mesh.scale.setScalar(
        Math.max(this.drawnRadius(name, t), this.minPx(name) * this.unitsPerPx(depth)),
      )
    }
    this.placeEarthFrame()
    this.placeSats(t)
    for (const a of this.near.asteroids.visible())
      this.floorPx(a.mesh, ASTEROID_MIN_PX, PX_CEILING.asteroid)
    if (this.near.l1.visible) this.floorPx(this.near.l1, L1_MIN_PX, PX_CEILING.l1)
    if (this.sats.marker.visible)
      this.floorPx(this.sats.marker, SAT_MARKER_MIN_PX, PX_CEILING.satMarker)
    this.sizeSatModel()
    if (this.sats.selectRing.visible) {
      // The ring stands outside a model, still under the Sun.
      const sun = this.bodies.get('Sun')
      const ringPx = satRingPx({
        modelPx: this.satModelPx,
        sunPx: sun ? this.drawnPx(sun) : Number.NaN,
        sunVisible: this.sunVisible,
      })
      this.floorPx(this.sats.selectRing, ringPx, ringPx)
    }
    if (this.lookup.marker.visible) {
      const depth = this.lookup.marker.position.distanceTo(this.camera.position)
      this.lookup.marker.scale.setScalar(lookupMarkerRadius(this.unitsPerPx(depth)))
    }
    for (const s of this.small.visible()) {
      if (s.group === 'dwarfs') this.floorPx(s.mesh, DWARF_MIN_PX, PX_CEILING.dwarf)
      else this.floorPx(s.mesh, SMALL_BODY_MIN_PX, PX_CEILING.smallBody)
    }
    // Charon goes around Pluto's marker as just clamped, then gets its own clamp (#99).
    this.small.placeMoons(this.focusBody)
    for (const m of this.small.moonMeshes())
      this.floorPx(m, DWARF_MOON_MIN_PX, PX_CEILING.dwarfMoon)
    for (const ring of this.sats.flagRings())
      this.floorPx(ring, SAT_REENTRY_MIN_PX, PX_CEILING.satReentry)
    for (const c of this.craft.visible()) {
      const depth = c.mesh.position.distanceTo(this.camera.position)
      c.mesh.scale.setScalar(craftIconScale(this.unitsPerPx(depth)))
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
    this.placeMoons()
    this.placeModel()
    this.placeSatModel()
    this.writePxProbe()
  }

  /** Hold a mesh between `px` and `maxPx` in radius on screen (no ceiling: floor only). */
  private floorPx(mesh: Object3D, px: number, maxPx?: number): void {
    const depth = mesh.position.distanceTo(this.camera.position)
    mesh.scale.setScalar(clampRadius(mesh.scale.x, this.unitsPerPx(depth), px, maxPx))
  }

  /** A mesh's drawn radius, px, from its scale and its distance to the camera. */
  private drawnPx(mesh: Object3D): number {
    return mesh.scale.x / this.unitsPerPx(mesh.position.distanceTo(this.camera.position))
  }

  /**
   * Test probe (#195, #196): the drawn radii, px, as JSON on the canvas. Only runs when
   * a test has put `data-orrery-px` on the canvas, so production pays one attribute check.
   */
  private writePxProbe(): void {
    if (!this.canvas.hasAttribute('data-orrery-px')) return
    const px = (mesh: Object3D): number => Math.round(this.drawnPx(mesh) * 100) / 100
    const maxOf = (meshes: Object3D[]): number | null =>
      meshes.length === 0 ? null : Math.max(...meshes.map(px))
    const sun = this.bodies.get('Sun')
    const craft = this.craft.visible()
    this.canvas.dataset['orreryPx'] = JSON.stringify({
      sun: sun ? px(sun) : null,
      // A sprite's scale is its side, so half of it is the radius the Sun is compared by.
      craft: ((): number | null => {
        const side = maxOf(craft.map((c) => c.mesh))
        return side === null ? null : side / 2
      })(),
      model: this.modelPx === null ? null : Math.round(this.modelPx * 100) / 100,
      satModel: this.satModelPx === null ? null : Math.round(this.satModelPx * 100) / 100,
      // With the chosen satellite's model: Earth's radius and whether the Sun counted as on screen.
      satEarth: this.satEarthPx === null ? null : Math.round(this.satEarthPx * 100) / 100,
      satSunVisible: this.satModelPx === null ? null : this.sunVisible,
      moon: maxOf(this.moons.visible().map((m) => m.mesh)),
      l1: this.near.l1.visible ? px(this.near.l1) : null,
      asteroid: maxOf(this.near.asteroids.visible().map((a) => a.mesh)),
      satMarker: this.sats.marker.visible ? px(this.sats.marker) : null,
      satSelect: this.sats.selectRing.visible ? px(this.sats.selectRing) : null,
      lookup: this.lookup.marker.visible ? px(this.lookup.marker) : null,
      satReentry: maxOf(this.sats.flagRings()),
      smallBody: maxOf(
        this.small
          .visible()
          .filter((s) => s.group !== 'dwarfs')
          .map((s) => s.mesh),
      ),
      dwarf: maxOf(
        this.small
          .visible()
          .filter((s) => s.group === 'dwarfs')
          .map((s) => s.mesh),
      ),
      dwarfMoon: maxOf(this.small.moonMeshes()),
    })
  }

  /**
   * A body's radius before the px floor, as the Earth frame opens by `t` (#92): Earth
   * shrinks to the frame's unit, and the other bodies to dots, so the inset never
   * crowds against an exaggerated Venus or Sun.
   */
  private drawnRadius(name: BodyName, t: number): number {
    const r = this.radiusOf(name)
    if (t <= 0) return r
    return name === 'Earth' ? earthFrameRadius(r, t) : r * (1 - t)
  }

  /**
   * How open the Earth frame is (#92): from the camera's and its target's distances to
   * Earth in frame units. Closed in the proportional mode (true scale) and without
   * Horizons' Earth for the date.
   */
  private earthOpenness(): number {
    const earth = this.bodies.get('Earth')
    if (!earth || this.mode === 'proportional' || !this.near.coversEarth(this.lastJd)) return 0
    return earthFrameBlend(
      earth.position.distanceTo(this.camera.position) / EARTH_FRAME_UNIT,
      earth.position.distanceTo(this.controls.target) / EARTH_FRAME_UNIT,
    )
  }

  /**
   * Earth's neighbourhood for this frame (#92): the L1/L2 craft moved into the Earth
   * frame; the close approaches, the Sun–Earth line and L1 placed in it.
   */
  private placeEarthFrame(forceOpen = false): void {
    const earth = this.bodies.get('Earth')
    if (!earth || Number.isNaN(this.lastJd)) return
    // Forced open: where things will be once a focus flight arrives (it ends inside it), so
    // at the open frame's radius. The px floor is for the camera as it is now, and from
    // far off it scaled the whole frame up (#133: a close approach was fitted about 60
    // times too far from Earth).
    const open = forceOpen && this.near.coversEarth(this.lastJd)
    const t = open ? 1 : this.earthOpenness()
    const radius = open ? this.drawnRadius('Earth', 1) : this.earthFrameRadius(earth, t)
    const frame = this.near.view(this.lastJd, earth.position, radius, t, (p) => this.toScene(p))
    // Any craft near Earth (the L1/L2 ones; Europa Clipper on its Earth flyby) goes into
    // the frame with the Moon and the close approaches, so they share one scale.
    this.craft.placeNear((helio) => this.near.placeNear(helio, frame, NEAR_FRAME_AU))
    // A looked-up object's pass is placed against Earth at each of its dates (#151).
    this.lookup.placeNear({
      t: frame.t,
      earthTrack: this.earthTrack,
      maxAu: NEAR_FRAME_AU,
      earth: frame.earth,
      radius: frame.radius,
      at: (helio, jd) => this.near.placeNearAt(helio, jd, frame, NEAR_FRAME_AU),
    })
    this.small.placeNear((helio) => this.near.placeNear(helio, frame, NEAR_FRAME_AU))
    this.near.place(this.lastJd, frame)
  }

  /** Earth's radius as drawn this frame, the Earth frame's unit, with its px floor. */
  private earthFrameRadius(earth: Mesh, t: number): number {
    return Math.max(
      this.drawnRadius('Earth', t),
      this.minPx('Earth') * this.unitsPerPx(earth.position.distanceTo(this.camera.position)),
    )
  }

  /**
   * The satellites (#98), once per drawn frame: around Earth as drawn, by the camera's
   * distance and the clock's rate. The page hears when their state changes.
   */
  private placeSats(t: number): void {
    const earth = this.bodies.get('Earth')
    if (!earth || Number.isNaN(this.lastJd)) return
    const clock = this.clock.motion()
    const radius = this.earthFrameRadius(earth, t)
    // The labels test against the same Earth the satellite ring dims by (#219).
    this.occluderRadius = radius
    this.sats.place({
      jd: this.lastJd,
      simMs: this.clock.simTime(),
      wallMs: performance.now(),
      rate: clock.playing ? clock.rate : 0,
      earth: earth.position,
      radius,
      earthPx: radius / this.unitsPerPx(earth.position.distanceTo(this.camera.position)),
      openness: this.mode === 'proportional' ? 0 : t,
      camera: this.camera.position,
      pixelRatio: this.renderer.getPixelRatio(),
      aspect: this.width / Math.max(1, this.height),
      stagePx: Math.min(this.width, this.height),
    })
    const state = this.satState()
    const key = `${JSON.stringify(state.groups)}|${String(state.total)}|${String(state.drawn)}|${String(state.outOfWindow)}|${state.mode}`
    if (key !== this.satStateKey) {
      this.satStateKey = key
      this.onSatState?.(state)
    }
  }

  private satState(): SatViewState {
    return { ...this.sats.snapshot(), mode: this.sats.mode() }
  }

  /** The satellite groups switched on (#98); fetched once the Earth frame opens. */
  setSatGroups(groups: ReadonlySet<SatGroupId>): void {
    this.sats.setEnabled(groups)
    this.markDirty()
  }

  /** Objects Space-Track predicts will re-enter soon, by NORAD id (#101): ringed in amber. */
  setReentries(noradIds: readonly string[]): void {
    this.sats.setFlagged(noradIds)
    this.markDirty()
  }

  /** The satellites' state, for the controls and the stage notice. Called now and on change. */
  setOnSatState(cb: ((s: SatViewState) => void) | null): void {
    this.onSatState = cb
    cb?.(this.satState())
  }

  /** A satellite's details for the inspector (#98), or null when it is not loaded. */
  satellite(key: SceneKey): SatInfo | null {
    return this.sats.info(key)
  }

  /** The loaded satellites' names, ids, groups, orbit classes and launches (#158). */
  satField(): SatFieldInfo | null {
    return this.sats.field()
  }

  /** Every loaded object in a satellite group, for search. */
  satellites(group: SatGroupId): { key: string; name: string }[] {
    return this.sats.listGroup(group)
  }

  /** The focused craft's model at its position, its axis along its attitude (#115). */
  private placeModel(): void {
    this.modelPx = null
    const key = this.models.shownKey()
    this.craft.setModelKey(key)
    const model = this.models.shownDescriptor()
    if (!key || !model) return
    const at = this.craft.position(key)
    const facing = this.craftFacing(key)
    if (!at || !facing) return
    // Never bigger than the Sun as drawn, on screen or off it (#204).
    const sun = this.bodies.get('Sun')
    this.modelPx = craftModelPx(sun ? this.drawnPx(sun) : NaN)
    this.models.place(
      at,
      this.unitsPerPx(at.distanceTo(this.camera.position)),
      facing,
      this.modelPx,
    )
  }

  /** Load, swap or drop the chosen satellite's model to match the choice (#194). */
  private syncSatModel(): void {
    const key = this.chosen !== null && isSatKey(this.chosen) ? this.chosen : null
    const model =
      key === null
        ? undefined
        : this.satModelCache.resolve(key, this.sats.fieldRef(), () =>
            sceneModel(modelForKey(key, (k) => this.sats.info(k))),
          )
    if (key === null || !model) {
      this.satModels.show(null, null)
      return
    }
    this.satModels.showDescriptor(key, key, model)
  }

  /**
   * Once the chosen satellite's marker is placed and floored: decide whether its model is
   * drawn and how big, and stop drawing the marker mesh when it is (the marker stays the
   * label's anchor and the floor of the model's size).
   */
  private sizeSatModel(): void {
    this.syncSatModel()
    const marker = this.sats.marker
    const earth = this.bodies.get('Earth')
    const drawn = earth !== undefined && marker.visible && this.satModels.shownKey() !== null
    this.satModels.group.visible = drawn
    this.sats.setMarkerDrawn(!drawn)
    this.satModelPx = null
    this.satEarthPx = null
    if (!drawn) {
      // Nothing to carry over: the next model's first frame starts with the Sun off screen.
      this.sunVisible = false
      return
    }
    const sun = this.bodies.get('Sun')
    const sunPx = sun ? this.drawnPx(sun) : Number.NaN
    this.sunVisible = sun !== undefined && this.sunInView(sun, sunPx)
    this.satEarthPx =
      this.occluderRadius / this.unitsPerPx(earth.position.distanceTo(this.camera.position))
    this.satModelPx = satModelPx({
      earthPx: this.satEarthPx,
      markerPx: this.drawnPx(marker),
      sunPx,
      sunVisible: this.sunVisible,
    })
  }

  /** Whether the Sun is on screen, with a margin that stops it flickering at an edge (#194). */
  private sunInView(sun: Object3D, sunPx: number): boolean {
    this.scratch.copy(sun.position).project(this.camera)
    return sunOnScreen({
      x: this.scratch.x,
      y: this.scratch.y,
      z: this.scratch.z,
      sunPx,
      width: this.width,
      height: this.height,
      wasOn: this.sunVisible,
    })
  }

  /**
   * The chosen satellite's model at its drawn position, Earth-facing ('earth' attitude is
   * nadir) or Sun-facing as its descriptor says (#194).
   */
  private placeSatModel(): void {
    const model = this.satModels.shownDescriptor()
    const earth = this.bodies.get('Earth')
    if (!model || !earth || this.satModelPx === null) return
    const at = this.sats.marker.position
    const sun = this.bodies.get('Sun')?.position ?? earth.position
    this.satModels.place(
      at,
      this.unitsPerPx(at.distanceTo(this.camera.position)),
      satFacing(model.attitude, at, earth.position, sun),
      this.satModelPx,
    )
  }

  /** Scene direction a craft model's axis points along (its attitude), or null. */
  private craftFacing(key: SceneKey): Vector3 | null {
    const naif = this.craft.naifIdOf(key)
    const model = naif ? craftModelFor(naif) : undefined
    const helio = this.craft.helioOf(key)
    if (!model || !helio) return null
    const jd = Number.isNaN(this.lastJd) ? jdFromDate(new Date(this.clock.simTime())) : this.lastJd
    const earth = this.earthTrack
      ? earthState(this.earthTrack, jd).position
      : heliocentric('Earth', jd)
    const d = attitudeDirection(model.attitude, helio, earth)
    // Ecliptic (x, y, z) to scene (x, z, -y), as place3d and the linear mode both map.
    return new Vector3(d.x, d.z, -d.y)
  }

  /**
   * Moons go around their planet as drawn this frame (after its minimum size), so they
   * always clear it; then they get their own px floor.
   */
  private placeMoons(): void {
    this.moons.place(
      this.lastJd,
      (planet) => {
        const mesh = this.bodies.get(planet)
        if (!mesh) return null
        const depth = mesh.position.distanceTo(this.camera.position)
        const radius = mesh.scale.x
        return {
          position: mesh.position,
          radius,
          radiusPx: radius / this.unitsPerPx(depth),
          inView: this.projectOne(mesh).visible,
        }
      },
      this.focusBody,
    )
    for (const m of this.moons.visible()) {
      const depth = m.mesh.position.distanceTo(this.camera.position)
      m.mesh.scale.setScalar(
        clampRadius(m.mesh.scale.x, this.unitsPerPx(depth), MOON_MIN_PX, PX_CEILING.moon),
      )
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
    this.craft.place(jd)
    // The comets first: a looked-up object whose twin they draw hides its own copy (#99).
    this.small.place(jd, (p) => this.toScene(p), this.mode)
    this.lookup.place(jd, (p) => this.toScene(p), this.mode, this.lookupTwin(jd) !== null)
  }

  /**
   * A looked-up object (#145) that another layer draws at `jd`: its key there, else null.
   * The comet data (#99: 1I, 2I, 3I or a bright comet looked up by name) matches it by
   * SPK-ID; the close approaches (#216: 2026 VQ11) by designation. The object is then
   * drawn once, by the other layer, and the lookup key follows it. The approaches are
   * placed after this runs, so they are asked whether they will draw it (drawsAt).
   */
  private lookupTwin(jd: number): SceneKey | null {
    const key = this.lookup.key()
    const comet = key === null ? null : lookupTwinKey(key)
    if (comet !== null && this.small.drawn(comet)) return comet
    const approach = this.lookup.approachKey()
    return approach !== null && this.near.asteroids.drawsAt(approach, jd) ? approach : null
  }

  /** Where a looked-up object is drawn: its own marker, or its twin's (lookupTwin). */
  private lookupPosition(name: SceneKey): Vector3 | null {
    const own = this.lookup.position(name)
    if (own || !this.lookup.has(name)) return own
    const twin = this.lookupTwin(this.lastJd)
    if (twin === null) return null
    return this.small.position(twin) ?? this.near.asteroids.position(twin)
  }

  /**
   * The close approach the chosen key means (#216): a looked-up object that is also an
   * approach chooses that approach, so its pass and label show as the approach's do.
   */
  private chosenApproach(): SceneKey | null {
    const key = this.chosen
    if (key === null || !this.lookup.has(key)) return key
    return this.lookup.approachKey() ?? key
  }

  /** Where a body or craft is drawn now, scene space. */
  bodyPosition(name: SceneKey): Vector3 {
    return this.drawnPosition(name) ?? new Vector3()
  }

  /** Where it is drawn now, or null when it is not drawn (hidden, or outside its data). */
  private drawnPosition(name: SceneKey): Vector3 | null {
    if (isBody(name)) return this.bodies.get(name)?.position.clone() ?? null
    const near = this.nearPosition(name)
    if (near) return near
    const looked = this.lookupPosition(name)
    if (looked) return looked
    if (this.small.has(name)) return this.small.position(name)
    if (this.moons.has(name)) {
      const parent = this.moons.parentOf(name)
      return this.moons.position(name) ?? (parent ? this.drawnPosition(parent) : null)
    }
    return this.craft.position(name)
  }

  /** A close approach or the L1 marker as drawn now (#92), or null. */
  private nearPosition(name: SceneKey): Vector3 | null {
    if (name === L1_KEY) return this.near.l1.visible ? this.near.l1.position.clone() : null
    return this.near.asteroids.position(name)
  }

  /** This fortnight's close approaches from /api/orrery-neo (#92). */
  setApproaches(list: readonly OrreryApproach[]): void {
    this.near.asteroids.setApproaches(list)
    this.near.asteroids.setSelected(this.chosenApproach())
    this.updateBodies(true)
    this.markDirty()
  }

  /** The close-approach filters (#92): window, hazardous only, risk-listed only. */
  setNeoFilter(filter: NeoFilter): void {
    this.near.asteroids.setFilter(filter)
    this.updateBodies(true)
    this.markDirty()
  }

  /** An object looked up at JPL to draw (#145), or null to remove it. */
  setLookup(data: LookupData | null): void {
    const followed = this.focusBody !== null && this.lookup.has(this.focusBody)
    this.lookup.set(data)
    // The camera was on the object that is gone: drop the focus rather than keep it on
    // a removed key (#186). The camera stays where it is.
    if (followed && this.focusBody !== null && !this.lookup.has(this.focusBody)) {
      this.focusBody = null
      this.models.show(null, null)
      delete this.canvas.dataset['orreryFocus']
    }
    // Its designation arrives with JPL's answer, after it may have been chosen (#216).
    this.near.asteroids.setSelected(this.chosenApproach())
    this.updateBodies(true)
    this.markDirty()
  }

  /** Comets and the interstellar objects (/api/orrery-smallbodies) and the dwarf planets (/api/orrery-dwarfs), #99. */
  setSmallBodies(entries: readonly OrreryEntry[]): void {
    const followed = this.focusBody !== null && this.small.has(this.focusBody)
    this.small.set(entries)
    this.afterSmallChange(followed)
  }

  /** The "Comets & interstellar" switches and the "Dwarf planets" switch (#99). */
  setSmallBodyGroups(groups: SmallBodyGroups): void {
    const followed = this.focusBody !== null && this.small.has(this.focusBody)
    this.small.setGroups(groups)
    this.afterSmallChange(followed)
  }

  /**
   * The camera was on a comet or interstellar object whose group is now off, or which is
   * gone from the data: drop the focus rather than keep a key that draws nothing (#186).
   * The camera stays where it is.
   */
  private afterSmallChange(followed: boolean): void {
    const focus = this.focusBody
    if (followed && focus !== null && !this.small.groupOn(focus)) {
      this.focusBody = null
      delete this.canvas.dataset['orreryFocus']
    }
    this.updateBodies(true)
    this.markDirty()
  }

  /** The Space weather switch (#92): the Sun–Earth line and the L1 marker. */
  setSunEarthLine(on: boolean): void {
    this.near.setSunLineVisible(on)
    this.updateBodies(true)
    this.markDirty()
  }

  /** The moons to draw (#107): the payload's planet-centred ones and Earth's Moon. */
  setMoons(bodies: readonly MoonBody[]): void {
    this.moons.setMoons(bodies)
    this.markDirty()
  }

  /** The orrery's craft, Earth and Moon from /api/orrery-bodies (#93). */
  setTracks(tracks: readonly OrreryTrack[]): void {
    this.earthTrack = tracks.find((t) => t.naifId === '399') ?? null
    this.near.setEarthTrack(this.earthTrack)
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

  /** Craft DSN is talking to now, by NAIF id (the "Only those talking to Earth now" filter). */
  setDsnIds(ids: ReadonlySet<string>): void {
    this.craft.setDsnIds(ids)
    this.updateBodies(true)
    this.markDirty()
  }

  /** Draw a craft's whole-mission path (spec Part 14), or none. */
  setTrajectory(key: SceneKey | null): void {
    this.craft.setTrajectory(key && this.craft.has(key) ? key : null)
    // A chosen satellite gets a marker and a label (#98).
    this.sats.setSelected(key)
    this.chosen = key
    this.sunVisible = false
    // A chosen close approach draws its sampled pass (#92), and so does a looked-up
    // object that is one (#216).
    this.near.asteroids.setSelected(this.chosenApproach())
    this.updateBodies(true)
    this.markDirty()
  }

  attach(el: HTMLElement): void {
    if (this.disposed) return
    el.append(this.canvas)
    this.attached = true
    this.sunImage.start()
    // A display change or browser zoom changes the pixel ratio without resizing the stage (#200).
    this.stopPixelWatch()
    this.stopPixelWatch = watchPixelRatio(window, () => {
      this.resize(this.width, this.height)
    })
    this.markDirty()
  }

  detach(): void {
    this.attached = false
    this.stopPixelWatch()
    this.stopPixelWatch = () => undefined
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
    // The satellite layer reads the ratio from the renderer each frame (placeSats).
    this.renderer.setPixelRatio(cappedPixelRatio(window))
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
  setViewInset(right: number, bottom: number, top = 0): void {
    const next = { right: Math.max(0, right), bottom: Math.max(0, bottom), top: Math.max(0, top) }
    const changed =
      next.right !== this.inset.right ||
      next.bottom !== this.inset.bottom ||
      next.top !== this.inset.top
    this.inset = next
    // The inset in force, for the e2e check that the view inset follows the inspector (#203).
    this.canvas.dataset['orreryInset'] =
      `${String(next.right)},${String(next.bottom)},${String(next.top)}`
    this.applyInset()
    // The picture moved by the sheet: a preset is fitted for where it now sits.
    if (changed) this.refitPreset()
    // The inspector opens after a looked-up object, a close approach, L1 or an L1/L2 craft
    // is focused: refit it to the room left (#133), keeping its side unless that fails. Not while it is hidden (past its samples): bodyPosition would
    // answer the Sun's origin and the camera would swing there; it holds instead, as
    // followFocus does (#186).
    const focus = this.focusBody
    if (changed && this.focusFramed && focus && this.drawnPosition(focus) !== null) {
      if (this.lookup.has(focus) || this.small.has(focus)) {
        this.focusLookup(focus, this.reducedMotion)
      } else if (this.mode !== 'proportional' && this.isNearEarthFocus(focus)) {
        this.focusNear(focus, this.reducedMotion, undefined, true)
      }
    }
    this.markDirty()
  }

  private applyInset(): void {
    const { right, bottom, top } = this.inset
    if (right === 0 && bottom === top) this.camera.clearViewOffset()
    else
      this.camera.setViewOffset(
        this.width,
        this.height,
        right / 2,
        (bottom - top) / 2,
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
    // The Earth presets also set focusBody (Earth), so the preset wins; focusOn clears it (#187).
    if (this.preset) this.applyPreset(this.preset, true)
    else if (this.focusBody) this.focusOn(this.focusBody, true)
    else this.applyPreset(DEFAULT_PRESET, true)
  }

  setVisibility(v: Visibility): void {
    this.visibility = v
    this.bodyGroup.visible = v.planets
    this.orbitGroup.visible = v.orbits
    this.moons.setOrbitsVisible(v.planets)
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
    if (preset === 'earth' || preset === 'orbit') {
      this.applyEarthPreset(preset, instant)
      return
    }
    this.preset = preset
    this.presetPristine = true
    this.focusBody = null
    this.models.show(null, null)
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
      ...this.presetReserves(),
    })
    this.flyTo(view.position, view.target, instant)
  }

  /**
   * Earth–Moon/L1 (#92): aimed at Earth from beside the Sun–Earth line, close enough that
   * the Earth frame is open, holding L2. Earth orbit (#98): the same, closer, holding the
   * geostationary ring with the satellites as points. Both follow Earth as the clock runs.
   */
  private applyEarthPreset(preset: 'earth' | 'orbit', instant: boolean): void {
    this.preset = preset
    this.presetPristine = true
    this.focusBody = 'Earth'
    this.models.show(null, null)
    this.canvas.dataset['orreryFocus'] = preset
    this.updateBodies(true)
    const view = this.earthView(preset)
    this.flyTo(view.position, view.target, instant)
  }

  /** The Earth–Moon/L1 framing (#92), also the distance for focusing Earth; or Earth orbit. */
  private earthView(preset: 'earth' | 'orbit' = 'earth') {
    const km = preset === 'orbit' ? GEO_KM : L1_DISTANCE_KM
    const extent =
      this.mode === 'proportional'
        ? (km / AU_KM) * LINEAR_K * 1.1
        : EARTH_FRAME_UNIT * (preset === 'orbit' ? ORBIT_PRESET_RADII : EARTH_PRESET_RADII)
    return earthPresetView(
      this.bodyPosition('Earth'),
      this.bodyPosition('Sun'),
      this.width / Math.max(1, this.height),
      extent,
      (2 * this.reserveBottomPx) / Math.max(1, this.height),
    )
  }

  /** The stage's bottom strip the time bar covers, px: framing keeps craft above it. */
  setFrameReserve(bottomPx: number): void {
    if (Math.abs(bottomPx - this.reserveBottomPx) < 1) return
    this.reserveBottomPx = Math.max(0, bottomPx)
    this.refitPreset()
  }

  /**
   * The strips of the stage presets must keep craft out of, as shares of NDC height. The
   * time bar covers the bottom; a phone's sheet covers more of it and a guide bar covers
   * the top (#159). Those overlays also shift the picture to centre it in what they leave
   * (applyInset), so the shift is counted here: 0.12 is FILL's own margin.
   */
  private presetReserves(): { bottomReserveNdc: number; topReserveNdc: number } {
    const h = Math.max(1, this.height)
    const { bottom, top } = this.inset
    if (bottom === 0 && top === 0) {
      return { bottomReserveNdc: (2 * this.reserveBottomPx) / h, topReserveNdc: 0 }
    }
    const margin = 1 - 0.88
    const shift = (bottom - top) / h
    const blocked = Math.max(this.reserveBottomPx, bottom)
    return {
      bottomReserveNdc: Math.max(0, (2 * blocked) / h - shift - margin),
      topReserveNdc: Math.max(0, shift + (2 * top) / h - margin),
    }
  }

  /** Refit the current preset while the user hasn't moved the camera. */
  private refitPreset(): void {
    if (this.preset && this.presetPristine) this.applyPreset(this.preset, true)
  }

  /** Fly to a body or craft and keep following it as it moves. */
  focusOn(name: SceneKey, instant = this.reducedMotion): void {
    // A satellite (#98): the camera stays where the points are pickable (a tap chose it
    // there); otherwise (search) the Earth orbit view. Its marker shows which one.
    if (isSatKey(name)) {
      if (!this.sats.pickable()) this.applyEarthPreset('orbit', instant)
      return
    }
    this.updateBodies(true)
    // Near Earth, aim where the object sits once the flight is in, with the frame open.
    const nearEarth = this.isNearEarthFocus(name)
    if (nearEarth && this.mode !== 'proportional') this.placeEarthFrame(true)
    // A craft or close approach with no data at this date is hidden: nowhere to fly to.
    if (
      !isBody(name) &&
      !this.craft.position(name) &&
      !this.nearPosition(name) &&
      !this.lookupPosition(name) &&
      !this.small.position(name)
    ) {
      return
    }
    this.focusBody = name
    this.preset = null
    this.canvas.dataset['orreryFocus'] = name
    // A focused craft draws as its 3D model (#115); anything else drops the model.
    const craftNaif = isBody(name) ? null : this.craft.naifIdOf(name)
    this.models.show(craftNaif ? name : null, craftNaif)
    if (this.lookup.has(name) || this.small.has(name)) {
      this.focusLookup(name, instant)
      return
    }
    // A craft with a model is seen three-quarter on, so its shape reads (#115).
    const facing = craftNaif ? this.craftFacing(name) : null
    if (nearEarth && this.mode !== 'proportional') {
      const v = facing ? threeQuarterView(facing) : null
      this.focusNear(name, instant, v ? new Vector3(v.x, v.y, v.z) : undefined)
      return
    }
    const target = this.bodyPosition(name)
    const r = this.radiusOf(name)
    // A craft is a marker, not a body: stand back far enough that it stays a few px and
    // its trajectory reads around it (#93), instead of filling the view.
    // Earth is seen from the Earth–Moon/L1 distance, where the Earth frame is open (#92):
    // its Moon and the L1 craft show apart from it.
    const distance =
      name === 'Earth'
        ? this.earthView().position.distanceTo(target)
        : isBody(name)
          ? Math.max(r * FOCUS_RADII, FOCUS_MIN_DISTANCE)
          : CRAFT_FOCUS_DISTANCE[this.mode]

    let dir = this.camera.position.clone().sub(this.controls.target).normalize()
    if (dir.lengthSq() === 0) dir.set(0, 0.5, 1).normalize()
    if (facing) {
      const v = threeQuarterView(facing)
      dir.set(v.x, v.y, v.z)
    } else if (isBody(name) && name !== 'Sun') {
      // A planet is approached from its sunlit side (#116); the Sun keeps the view.
      // The camera stays outside the Sun's drawn corona: near Mercury, the sunward view
      // otherwise sat inside the Sun and its live image filled the stage.
      const sun = this.bodies.get('Sun')
      const sunClearance =
        (sun?.scale.x ?? this.radiusOf('Sun')) *
        (SUVI_FRAME.crop / SUVI_FRAME.discRadius) *
        SUN_CLEARANCE_MARGIN
      dir = sunlitFocusDirection(target, this.bodyPosition('Sun'), dir, { distance, sunClearance })
    }
    this.flyTo(target.clone().add(dir.multiplyScalar(distance)), target, instant)
  }

  /**
   * A looked-up object (#145), comet or interstellar object (#99) is seen with the Sun,
   * and Earth when within a few au, apart on screen in the part of the stage the
   * inspector and time bar leave free: alone, a far visitor like 3I/ATLAS at 13 au read
   * as nowhere.
   */
  private focusLookup(name: SceneKey, instant: boolean): void {
    const others = [this.bodyPosition('Sun')]
    const helio = this.small.has(name) ? this.small.helio(name) : this.lookup.helioNow()
    if (helio) {
      const e = earthState(this.earthTrack, this.lastJd).position
      if (Math.hypot(helio.x - e.x, helio.y - e.y, helio.z - e.z) <= LOOKUP_WITH_EARTH_AU) {
        others.push(this.bodyPosition('Earth'))
      }
    }
    const aspect = this.width / Math.max(1, this.height)
    const view = lookupFocusView(this.bodyPosition(name), others, aspect, this.focusRoom())
    this.flyTo(view.position, view.target, instant)
    this.focusFramed = true
  }

  /** A close approach, L1 or an L1/L2 craft: drawn in the Earth frame (#92). */
  private isNearEarthFocus(name: SceneKey): boolean {
    return (
      this.near.asteroids.has(name) ||
      name === L1_KEY ||
      this.craft.visible().some((c) => c.key === name && c.group === 'l1')
    )
  }

  /**
   * A close approach, L1 or an L1/L2 craft (#133) is seen with Earth's disc, both in the
   * part of the stage the inspector and time bar leave free, from the camera's own side
   * (a modelled craft's three-quarter view, `prefer`) where that works. At a fixed 40 frame
   * units, Earth (15.6 units from a 0.04 au pass, 12.8 from L2) fell under the inspector
   * or off the stage. It fits the frame as it will be on arrival, forced open. Without
   * `prefer` it is a refit or a fresh focus from where the camera is (or is flying to).
   */
  private focusNear(name: SceneKey, instant: boolean, prefer?: Vector3, refit = false): void {
    // A refit can come mid-flight, with the frame half open: fit where things will be.
    this.placeEarthFrame(true)
    const target = this.bodyPosition(name)
    const from = this.flight ? this.flight.toPos : this.camera.position
    const view = nearFocusView({
      target,
      earth: this.bodyPosition('Earth'),
      earthRadius: EARTH_FRAME_UNIT,
      current:
        prefer ?? from.clone().sub(this.flight ? this.flight.toTarget : this.controls.target),
      refit,
      aspect: this.width / Math.max(1, this.height),
      room: this.focusRoom(),
      minDistance: EARTH_FRAME_UNIT * NEAR_FOCUS_UNITS,
      // A little inside the fully open distance, so the frame stays open on arrival.
      maxEarthDistance: EARTH_FRAME_UNIT * EARTH_FRAME_OPEN_CAMERA.open * NEAR_OPEN_MARGIN,
    })
    this.flyTo(view.position, view.target, instant)
    this.focusFramed = true
  }

  /** The focus view was fitted for the inspector as it was: refit when it changes. */
  private focusFramed = false

  /** How far the free part of the stage reaches from a focus centred in it, NDC (#145). */
  private focusRoom(): FocusRoom {
    const w = Math.max(1, this.width)
    const h = Math.max(1, this.height)
    const { right, bottom, top } = this.inset
    // The time bar, or the phone's sheet over it, whichever reaches higher.
    const blocked = Math.max(bottom, this.reserveBottomPx)
    // applyInset centres the focus in the band between the top and bottom insets (#133:
    // the top one, a phone's guide bar, was left out, so the room above was overstated).
    const band = h - bottom - top
    const floor = 0.2
    return {
      x: Math.max(floor, (w - right) / w),
      up: Math.max(floor, band / h),
      down: Math.max(floor, (band / 2 - (blocked - bottom)) / (h / 2)),
    }
  }

  private flyTo(toPos: Vector3, toTarget: Vector3, instant: boolean): void {
    if (instant) {
      this.flight = null
      this.camera.position.copy(toPos)
      this.controls.target.copy(toTarget)
      this.syncMinDistance()
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

  /** Near Earth the camera may come in close; elsewhere it keeps the general limit (#98). */
  private syncMinDistance(): void {
    const earth = this.bodies.get('Earth')
    this.controls.minDistance = cameraMinDistance(
      earth ? earth.position.distanceTo(this.controls.target) : Number.POSITIVE_INFINITY,
    )
  }

  /** The user turned or zoomed: stop any flight, and stop refitting the preset. */
  private readonly onUserCamera = () => {
    this.flight = null
    this.presetPristine = false
    this.focusFramed = false
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
    // A satellite wins only when it is nearer the tap than any body (#98).
    const sat = this.sats.pick(x, y, bestD, (v) => {
      this.scratch.copy(v).project(this.camera)
      if (this.scratch.z > 1) return null
      return {
        x: ((this.scratch.x + 1) / 2) * this.width,
        y: ((1 - this.scratch.y) / 2) * this.height,
      }
    })
    return sat ?? best
  }

  private projectOne(
    mesh: Object3D,
  ): Pick<ProjectedBody, 'x' | 'y' | 'visible' | 'behind' | 'behindEarth' | 'radiusPx' | 'depth'> {
    const depth = mesh.position.distanceTo(this.camera.position)
    this.scratch.copy(mesh.position).project(this.camera)
    const x = ((this.scratch.x + 1) / 2) * this.width
    const y = ((1 - this.scratch.y) / 2) * this.height
    const behind = this.scratch.z > 1
    const visible = !behind && x >= 0 && x <= this.width && y >= 0 && y <= this.height
    // A sphere's scale is its radius; a sprite's is its full width (#115).
    const radius = mesh instanceof Sprite ? mesh.scale.x / 2 : mesh.scale.x
    const radiusPx = depth > 0 ? radius / this.unitsPerPx(depth) : 0
    return { x, y, visible, behind, behindEarth: this.hiddenByEarth(mesh), radiusPx, depth }
  }

  /**
   * Whether Earth as drawn this frame hides a mesh from the camera (#219), by the test the
   * chosen satellite's ring dims with (#140, behindEarth). Labels draw over the scene, so
   * one on the far side would sit over Earth at full strength. Allocates nothing.
   */
  private hiddenByEarth(mesh: Object3D): boolean {
    const earth = this.bodies.get('Earth')
    if (!earth || mesh === earth || !this.visibility.planets) return false
    const radius = Number.isNaN(this.occluderRadius) ? earth.scale.x : this.occluderRadius
    return labelBehindEarth(mesh.position, earth.position, radius, this.camera.position)
  }

  /** Earth's radius this frame as the satellites were placed with it (earthFrameRadius). */
  private occluderRadius = Number.NaN

  private project(): ProjectedBody[] {
    const out: ProjectedBody[] = []
    if (this.visibility.planets) {
      for (const [name, mesh] of this.bodies) {
        out.push({ name, label: name, kind: 'body', ...this.projectOne(mesh) })
      }
      for (const m of this.moons.visible()) {
        out.push({
          name: m.key,
          label: m.label,
          kind: 'moon',
          parent: m.parent,
          ...this.projectOne(m.mesh),
        })
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
    this.projectNear(out)
    const anchor = this.visibility.orbits ? this.heliopauseAnchor() : null
    if (anchor) {
      out.push({
        name: 'heliopause',
        label: HELIOPAUSE_LABEL,
        kind: 'ring',
        ...anchor,
        visible: true,
        behind: false,
        behindEarth: false,
        radiusPx: 0,
        depth: 0,
      })
    }
    return out
  }

  /** The selected object (setTrajectory), for the close-approach labels. */
  private chosen: SceneKey | null = null

  /**
   * Close approaches and L1 (#92). With the Earth frame mostly closed they sit on Earth's
   * dot, so their labels wait until it opens; a chosen one always shows.
   */
  private projectNear(out: ProjectedBody[]): void {
    const open = this.near.openness() >= NEAR_LABEL_OPEN
    const chosen = this.chosenApproach()
    for (const a of this.near.asteroids.visible()) {
      if (!open && a.key !== chosen) continue
      out.push({
        name: a.key,
        label: a.label,
        kind: 'asteroid',
        pha: a.pha,
        // Chosen through its looked-up twin (#216): the page ranks this label as chosen.
        chosen: a.key === chosen && chosen !== this.chosen,
        ...this.projectOne(a.mesh),
      })
    }
    if (this.near.l1.visible && (open || this.chosen === L1_KEY)) {
      out.push({ name: L1_KEY, label: L1_KEY, kind: 'marker', ...this.projectOne(this.near.l1) })
    }
    const looked = this.lookup.labelled()
    if (looked) {
      out.push({
        name: looked.key,
        label: looked.label,
        kind: 'lookup',
        ...this.projectOne(this.lookup.marker),
      })
    }
    for (const s of this.small.visible()) {
      out.push({
        name: s.key,
        label: s.label,
        kind: 'smallbody',
        group: s.group,
        ...this.projectOne(s.mesh),
      })
    }
    const sat = this.sats.selectedLabel()
    if (sat) {
      out.push({
        name: sat.key,
        label: sat.label,
        kind: 'satellite',
        ...this.projectOne(this.sats.marker),
      })
    }
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
    this.placeEarthFrame()
    if (this.preset === 'heliosphere' && !(Math.abs(jd - this.fitJd) < HELIOSPHERE_REFIT_DAYS)) {
      this.refitPreset()
    }
  }

  /**
   * Keep the camera on the focused body as it moves: with the clock, and near Earth also
   * as the Earth frame opens or closes with the camera's distance (#92).
   */
  private followFocus(): void {
    if (!this.focusBody || this.flight) return
    const target = this.drawnPosition(this.focusBody)
    // Not drawn (hidden, or past its samples): hold the camera, not pull it to the Sun (#186).
    const shift = followShift(target, this.controls.target)
    if (!target || !shift) return
    this.camera.position.add(shift)
    this.controls.target.copy(target)
  }

  /**
   * Where the focus and Earth were drawn, "x,y,radiusPx" in canvas px, for the e2e check
   * that a close approach's framing keeps both clear of the inspector and time bar (#133).
   */
  private reportFramed(projected: readonly ProjectedBody[]): void {
    const at = (name: SceneKey | null) => {
      const p = name ? projected.find((q) => q.name === name) : undefined
      return p && !p.behind
        ? `${p.x.toFixed(0)},${p.y.toFixed(0)},${p.radiusPx.toFixed(1)}`
        : 'none'
    }
    const data = this.canvas.dataset
    const focus = at(this.focusBody)
    const earth = at('Earth')
    if (data['orreryFocusPx'] !== focus) data['orreryFocusPx'] = focus
    if (data['orreryEarthPx'] !== earth) data['orreryEarthPx'] = earth
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
    this.syncMinDistance()
    const damping = this.controls.update()
    if (this.dirty || moving || flying || damping) {
      if (now - this.lastDraw >= MIN_FRAME_MS || this.dirty || flying) {
        this.updateBodies()
        this.applyMinPixelSize()
        this.followFocus()
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
        this.reportFramed(projected)
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
    // Each planet's drawn radius, px, and the moons drawn now, by name (#107 e2e checks).
    d['orrerySizes'] = [...this.bodies]
      .map(([name, mesh]) => {
        const depth = mesh.position.distanceTo(this.camera.position)
        return `${name}:${(mesh.scale.x / this.unitsPerPx(depth)).toFixed(1)}`
      })
      .join(',')
    d['orreryMoonOrbits'] = String(this.visibility.orbits ? this.moons.drawnOrbits() : 0)
    d['orreryMoons'] = this.moons
      .visible()
      .map((m) => m.label)
      .join(',')
    const path = this.craft.trajectoryCounts()
    d['orreryTrajectory'] = path ? `${String(path.past)},${String(path.future)}` : ''
    // The focused craft's 3D model: loading:, model:, simplified: or failed:<naif> (#115).
    d['orreryModel'] = this.models.state()
    // The chosen satellite's model: loading:, model:, simplified: or failed:sat:<norad> (#194).
    d['orrerySatModel'] = this.satModels.state()
    // Earth's neighbourhood (#92): how open the frame is, approaches drawn, the chosen
    // one's path points, and whether L1 is drawn.
    d['orreryEarthFrame'] = this.near.openness().toFixed(2)
    d['orreryAsteroids'] = String(this.near.asteroids.visible().length)
    d['orreryAsteroidPath'] = String(this.near.asteroids.pathPoints())
    d['orreryL1'] = String(this.near.l1.visible)
    // The looked-up object (#145): its key while drawn, and its orbit line's points.
    d['orreryLookup'] = this.lookup.labelled()?.key ?? ''
    d['orreryLookupPath'] = String(this.lookup.pathPoints())
    // Its pass near Earth through the open Earth frame (#151).
    d['orreryLookupNearPath'] = String(this.lookup.nearPathPoints())
    // Comets and interstellar objects (#99): markers drawn, lines drawn, and their keys.
    const small = this.small.counts()
    d['orrerySmallBodies'] = String(small.drawn)
    d['orrerySmallBodyPaths'] = String(small.paths)
    d['orrerySmallBodyKeys'] = this.small
      .visible()
      .map((s) => s.key)
      .join(',')
    // Satellites (#98): how they show, objects loaded, drawn and hidden past their epoch
    // window, the groups loaded, and the last worker pass (the phone target is ≤ 300 ms).
    const sats = this.sats.snapshot()
    d['orrerySatMode'] = this.sats.mode()
    d['orrerySatDistance'] = this.sats.distance().toFixed(1)
    d['orrerySatTotal'] = String(sats.total)
    d['orrerySatDrawn'] = String(sats.drawn)
    d['orrerySatHidden'] = String(sats.outOfWindow)
    d['orrerySatReentries'] = String(this.sats.flagRings().length)
    d['orrerySatGroups'] = Object.entries(sats.groups)
      .filter(([, g]) => g.status === 'loaded')
      .map(([id]) => id)
      .join(',')
    d['satPropagateMs'] = sats.passMs === null ? '' : sats.passMs.toFixed(1)
    d['satEngine'] = sats.engine ?? ''
  }

  private readonly handleContextLost = (e: Event) => {
    e.preventDefault()
    this.onContextLost()
  }

  dispose(): void {
    this.disposed = true
    this.stopPixelWatch()
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
    this.near.dispose()
    this.lookup.dispose()
    this.small.dispose()
    this.sats.dispose()
    this.models.dispose()
    this.satModels.dispose()
    this.moons.dispose()
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
