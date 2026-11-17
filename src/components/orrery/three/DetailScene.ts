/**
 * The "Look closer" view's own three.js scene (#203, ADR 0021): one model, lit, turned
 * with OrbitControls, on a canvas and a WebGLRenderer of its own. It exists only while the
 * view is open and is wholly disposed on close, context included, so the orrery's renderer
 * never carries a close-up mode. Frames are drawn on demand: a camera move, damping still
 * settling, a resize or a new model asks for one, and nothing else runs.
 */
import {
  AmbientLight,
  DirectionalLight,
  Group,
  MathUtils,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Spherical,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { type OutlineFraming, outlineFraming } from '@/lib/orrery/detailFraming'
import type { Surroundings } from '@/lib/orrery/surroundings'
import {
  type CraftSize,
  flightStart,
  framingApproach,
  type Km3,
  modelMetresPerUnit,
} from '@/lib/orrery/trueScale'

import { positionsOf, type PreparedModel, texturesOf } from './craftModelLoad'
import { type Flight, FLIGHT_START_KM, flightAt } from './flight'
import { cappedPixelRatio, watchPixelRatio } from './pixelRatio'
import { toScene, TrueSky } from './trueSky'

/**
 * The fly-in (#261): the craft at its true size among the true Sun, planets, moons and stars,
 * reached by a flight in. Without it the scene is the plain "Look closer" studio.
 */
export interface TrueScaleOptions {
  /** The craft's real size (ESA DISCOS): the scene scales the loaded model to it. */
  readonly size: CraftSize
  /** The surroundings at the orrery's clock now, or null outside the craft's data. */
  readonly surroundings: () => Surroundings | null
  /** Ecliptic direction from the craft the visitor was looking from: the flight comes in there. */
  readonly approach: Km3
  /** Ecliptic direction the model's `axis` points at (its attitude), or null to leave it. */
  readonly facing: (s: Surroundings) => Km3 | null
  /** The model's own axis that `facing` points (craftModels' `axis`). */
  readonly axis: readonly [number, number, number]
}

/** Which part of the scene the view is drawing, for the leak test. */
export interface DetailStats {
  /** Scenes (canvas + WebGL context) alive now. */
  readonly scenes: number
  /** Models alive now, in a scene. */
  readonly models: number
  /** Scenes ever created. */
  readonly opened: number
  /**
   * Geometries and textures the renderer still held after a model's own dispose, summed over
   * every model dropped so far. (The renderer keeps a texture of its own; this counts only
   * the model's.) Zero means disposeTree freed what the model made.
   */
  readonly leaked: number
  /** The part of `leaked` that were textures. */
  readonly leakedTextures: number
}

const counts = { scenes: 0, models: 0, opened: 0, leaked: 0, leakedTextures: 0 }
export const detailStats = (): DetailStats => ({ ...counts })

export interface DetailSceneOptions {
  readonly reducedMotion: boolean
  /** The WebGL context was lost. Not called for the loss the scene causes on dispose. */
  readonly onContextLost: () => void
  /** The fly-in (#261); without it, the studio view. */
  readonly trueScale?: TrueScaleOptions | undefined
}

export interface DetailSceneHandle {
  /** Show `model`. The scene owns it from here and disposes it. */
  setModel(model: PreparedModel): void
  /** Turn the camera about the model by these angles (radians), as a drag would. */
  rotate(dAzimuth: number, dPolar: number): void
  /** Move the camera to `factor` times its distance (under 1 is closer), within the limits. */
  zoom(factor: number): void
  /** Stop, free every GPU resource and the context, and remove the canvas. Idempotent. */
  dispose(): void
}

/** Makes a scene in `host`. The view takes this as a prop so tests can swap in a fake. */
export type CreateDetailScene = (
  host: HTMLElement,
  options: DetailSceneOptions,
) => DetailSceneHandle

const FOV = 35
/** With no model yet: a body-radius-1 model fits at this distance, within these limits. */
const START_DISTANCE = 3.6
const MIN_DISTANCE = 1.3
const MAX_DISTANCE = 12
/**
 * Once a model is in, it is framed by its real outline (#205), every vertex, not the body
 * radius the orrery uses: the share of the canvas left clear around it at the start view.
 */
const FRAME_MARGIN = 0.08
/** The near plane, in radii of the model's bounding sphere (the camera never comes within 0.1). */
const NEAR_SHARE = 0.05
/** Keep the camera off the poles, where the turn flips. */
const POLE_MARGIN = 0.05
const START_DIRECTION = new Vector3(0.55, 0.32, 0.77).normalize()
/** The fly-in's far plane: past the stars' sphere (trueSky's STAR_SPHERE), units. */
const STAR_FAR = 1e15
/** The fly-in redraws this often while open, ms, so the bodies keep up with the clock. */
const CLOCK_REDRAW_MS = 1_000
const IDENTITY = new Quaternion()

/**
 * The model's turn in the fly-in: its `axis` onto the direction its attitude names (the Sun,
 * Earth), as the orrery turns it. No surroundings or no direction: unturned.
 */
function attitude(truth: TrueScaleOptions): Quaternion {
  const s = truth.surroundings()
  const dir = s ? truth.facing(s) : null
  if (!dir) return IDENTITY.clone()
  const to = toScene(dir, 1).normalize()
  const from = new Vector3(...truth.axis).normalize()
  return new Quaternion().setFromUnitVectors(from, to)
}

export const createDetailScene: CreateDetailScene = (host, options) => {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('data-detail-canvas', '')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', 'The model. Drag to turn it, scroll or pinch to zoom.')
  host.append(canvas)

  const truth = options.trueScale
  // True km from metres to light-hours in one view: a logarithmic depth buffer keeps the
  // depth order right across that range (#261).
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    logarithmicDepthBuffer: Boolean(truth),
  })
  // The fly-in is space itself, black with only the real stars; the studio lets the page show.
  renderer.setClearColor(0x000000, truth ? 1 : 0)
  const scene = new Scene()
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 100)
  camera.position.copy(START_DIRECTION).multiplyScalar(START_DISTANCE)
  /** The fly-in's surroundings, built once the model's size in metres is known (setModel). */
  let sky: TrueSky | null = null
  /** One scene unit in metres, once the model is in (the fly-in only). */
  let metresPerUnit = 1
  if (!truth) {
    scene.add(new AmbientLight(0xffffff, 1.1))
    const key = new DirectionalLight(0xffffff, 2.6)
    key.position.set(3, 4, 5)
    const fill = new DirectionalLight(0xbfd4ff, 0.7)
    fill.position.set(-4, -1, -3)
    scene.add(key, fill)
  }
  /** The flight start's distance, scene units: the farthest the camera may zoom out to. */
  let farthest = MAX_DISTANCE
  let flight: Flight | null = null

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = !options.reducedMotion
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = MIN_DISTANCE
  controls.maxDistance = MAX_DISTANCE
  // A drag or zoom during the flight takes over from it.
  controls.addEventListener('start', () => {
    flight = null
  })

  let model: PreparedModel | null = null
  /** Every vertex in scene space (x, y, z flat), or null with no model. */
  let points: Float32Array | null = null
  /** How the model was last framed; null with no model. */
  let framing: OutlineFraming | null = null
  let frameId = 0
  let disposed = false
  /** Carries the model, turned to its attitude in the fly-in and centred. */
  const holder = new Group()
  // The fly-in's bodies move with the orrery's clock: draw now and then while it is open.
  const clockTimer = truth
    ? setInterval(() => {
        request()
      }, CLOCK_REDRAW_MS)
    : undefined

  const draw = () => {
    frameId = 0
    if (disposed) return
    const flying = stepFlight(performance.now())
    // update() is true while damping still moves the camera: keep going until it settles.
    const moving = controls.update() || flying
    if (sky && truth) {
      const s = truth.surroundings()
      if (s) sky.update(s)
      sky.followCamera(camera)
    }
    renderer.render(scene, camera)
    reportCamera()
    reportFit()
    // Test probe: what the renderer holds now (renderer.info.memory).
    canvas.dataset['detailGeometries'] = String(renderer.info.memory.geometries)
    canvas.dataset['detailTextures'] = String(renderer.info.memory.textures)
    if (moving) request()
  }
  // Test probe: where the camera is, as azimuth, polar angle and distance.
  const spherical = new Spherical()
  const offset = new Vector3()
  function reportCamera(): void {
    offset.copy(camera.position).sub(controls.target)
    spherical.setFromVector3(offset)
    canvas.dataset['detailCamera'] = [spherical.theta, spherical.phi, spherical.radius]
      .map((n) => n.toFixed(3))
      .join(',')
  }
  // Test probe, opt in: the model's real outline as drawn now, in CSS px from the canvas's top
  // left ("minX,minY,maxX,maxY"): every vertex of every mesh, projected (a box's corners would
  // overstate it).
  const corner = new Vector3()
  const view = new Vector3()
  function reportFit(): void {
    // Only when a test has put `data-detail-fit` on the canvas: this walks every vertex, so
    // production pays one attribute check a frame.
    if (!canvas.hasAttribute('data-detail-fit')) return
    if (!points) {
      canvas.dataset['detailFit'] = ''
      return
    }
    const w = host.clientWidth
    const h = host.clientHeight
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let nearest = Infinity
    for (let i = 0; i < points.length; i += 3) {
      view.set(points[i] ?? 0, points[i + 1] ?? 0, points[i + 2] ?? 0)
      view.applyMatrix4(camera.matrixWorldInverse)
      nearest = Math.min(nearest, -view.z)
      corner.copy(view).applyMatrix4(camera.projectionMatrix)
      const px = ((corner.x + 1) / 2) * w
      const py = ((1 - corner.y) / 2) * h
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    }
    canvas.dataset['detailFit'] = [minX, minY, maxX, maxY].map((n) => n.toFixed(1)).join(',')
    // How far in front of the camera the nearest vertex is: negative means one is behind it.
    canvas.dataset['detailNearest'] = nearest.toFixed(3)
  }
  /** Put the camera at `spherical` about the target and draw. */
  const placeCamera = () => {
    offset.setFromSpherical(spherical)
    camera.position.copy(controls.target).add(offset)
    camera.lookAt(controls.target)
    controls.update()
    request()
  }
  function request(): void {
    if (disposed || frameId !== 0) return
    frameId = requestAnimationFrame(draw)
  }

  /** Move the camera along the flight; true while it is still flying. */
  function stepFlight(now: number): boolean {
    if (!flight) return false
    const { distance, done } = flightAt(flight, now)
    const [x, y, z] = flight.direction
    camera.position.set(x * distance, y * distance, z * distance).add(controls.target)
    camera.lookAt(controls.target)
    if (done) flight = null
    return !done
  }

  /**
   * The fly-in's scale (#261): the model's farthest vertex sets how its DISCOS span maps to
   * scene units (modelMetresPerUnit); the surroundings are built at that scale, and the camera
   * may zoom out to the flight's start.
   */
  function placeInTrueSky(vertices: Float32Array): void {
    if (!truth || sky) return
    let full = 0
    for (let i = 0; i < vertices.length; i += 3) {
      full = Math.max(
        full,
        Math.hypot(vertices[i] ?? 0, vertices[i + 1] ?? 0, vertices[i + 2] ?? 0),
      )
    }
    metresPerUnit = modelMetresPerUnit(truth.size, Math.max(full, 1))
    farthest = (FLIGHT_START_KM * 1000) / metresPerUnit
    sky = new TrueSky({
      metresPerUnit,
      loadTexture: (url) => new TextureLoader().loadAsync(url),
      onReady: () => {
        request()
      },
    })
    scene.add(sky.group)
    // Test probe: the model's size as drawn, metres per unit.
    canvas.dataset['detailMetresPerUnit'] = metresPerUnit.toFixed(4)
  }

  /**
   * Fly in to the arrival distance (#261): from FLIGHT_START_KM out, on the side that puts the
   * biggest-looking body (the Sun near Parker, Jupiter near Juno) beside the craft in the frame,
   * moved off any body that would be in the way, straight in. With reduced motion, the camera
   * is put at the arrival at once.
   */
  function startFlight(arrival: number): void {
    if (!truth) return
    const s = truth.surroundings()
    const obstacles = (s?.bodies ?? []).map((b) => ({ center: b.relKm, radiusKm: b.radiusKm }))
    const approach = framingApproach(s?.bodies ?? [], truth.approach)
    const start = flightStart(approach, FLIGHT_START_KM, obstacles)
    const dir = toScene(start, metresPerUnit).normalize()
    const direction = [dir.x, dir.y, dir.z] as const
    if (options.reducedMotion) {
      camera.position.copy(dir.multiplyScalar(arrival)).add(controls.target)
      camera.lookAt(controls.target)
      return
    }
    flight = { direction, from: farthest, to: arrival, startMs: performance.now() }
  }
  controls.addEventListener('change', request)

  /**
   * Frame the model by its real outline for the canvas as it is now: the zoom limits follow
   * the fitting distance, and the camera keeps its share of that distance, so a resize (a
   * phone turned, the inspector opened) keeps the model in view. `reset` puts the camera at
   * the fitting distance on the start side, for a new model.
   */
  const refit = (reset: boolean): OutlineFraming | null => {
    if (!points) return null
    const next = outlineFraming(points, START_DIRECTION, FOV, camera.aspect, FRAME_MARGIN)
    controls.minDistance = next.minDistance
    controls.maxDistance = truth ? farthest : next.maxDistance
    // The closest approach keeps the whole model at least 0.1 radius in front of the camera, so
    // half of that is a near plane that never clips it, and far / near stays a few hundred.
    camera.near = next.radius * NEAR_SHARE
    // The fly-in reaches the stars' sphere; its logarithmic depth buffer covers the range.
    camera.far = truth ? STAR_FAR : next.maxDistance + next.radius * 2
    if (reset) {
      camera.position.copy(START_DIRECTION).multiplyScalar(next.distance).add(controls.target)
    } else if (framing) {
      offset.copy(camera.position).sub(controls.target)
      offset.multiplyScalar(next.distance / framing.distance)
      camera.position.copy(controls.target).add(offset)
    }
    framing = next
    camera.updateProjectionMatrix()
    camera.lookAt(controls.target)
    controls.update()
    return next
  }

  const resize = () => {
    const w = host.clientWidth
    const h = host.clientHeight
    if (w < 1 || h < 1) return
    renderer.setPixelRatio(cappedPixelRatio(window))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    refit(false)
    request()
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
  observer?.observe(host)
  const stopPixelWatch = watchPixelRatio(window, resize)

  const onLost = (event: Event) => {
    event.preventDefault()
    options.onContextLost()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  counts.scenes += 1
  counts.opened += 1
  resize()

  const dropModel = () => {
    if (!model) return
    const textures = texturesOf(model.object)
    model.object.removeFromParent()
    holder.removeFromParent()
    model.dispose()
    model = null
    points = null
    framing = null
    counts.models -= 1
    // What the model's own dispose left on the GPU: its textures still known to the renderer,
    // and any geometry still counted (the scene holds nothing else).
    const leftTextures = textures.filter((t) => renderer.properties.has(t)).length
    counts.leaked += leftTextures + renderer.info.memory.geometries
    counts.leakedTextures += leftTextures
  }

  return {
    setModel(next) {
      if (disposed) {
        next.dispose()
        return
      }
      dropModel()
      model = next
      counts.models += 1
      // The fly-in turns the model to its real attitude (#261): a holder carries that turn.
      holder.add(next.object)
      holder.position.set(0, 0, 0)
      holder.quaternion.copy(truth ? attitude(truth) : IDENTITY)
      scene.add(holder)
      holder.updateMatrixWorld(true)
      // Centre on the middle of the outline as first seen (the fit centred on the body), so the
      // model sits in the middle of the canvas and the camera turns about the middle of it.
      const all = Float32Array.from(positionsOf(next.object))
      const { centre } = outlineFraming(all, START_DIRECTION, FOV, camera.aspect, FRAME_MARGIN)
      holder.position.set(-centre.x, -centre.y, -centre.z)
      holder.updateMatrixWorld(true)
      const shifted = new Float32Array(all.length)
      for (let i = 0; i < all.length; i += 3) {
        shifted[i] = (all[i] ?? 0) - centre.x
        shifted[i + 1] = (all[i + 1] ?? 0) - centre.y
        shifted[i + 2] = (all[i + 2] ?? 0) - centre.z
      }
      points = shifted
      framing = null
      if (truth) placeInTrueSky(shifted)
      const fitted = refit(true)
      if (fitted) startFlight(fitted.distance)
      request()
    },
    rotate(dAzimuth, dPolar) {
      if (disposed) return
      offset.copy(camera.position).sub(controls.target)
      spherical.setFromVector3(offset)
      spherical.theta += dAzimuth
      spherical.phi = MathUtils.clamp(spherical.phi + dPolar, POLE_MARGIN, Math.PI - POLE_MARGIN)
      placeCamera()
    },
    zoom(factor) {
      if (disposed) return
      offset.copy(camera.position).sub(controls.target)
      spherical.setFromVector3(offset)
      spherical.radius = MathUtils.clamp(
        spherical.radius * factor,
        controls.minDistance,
        controls.maxDistance,
      )
      placeCamera()
    },
    dispose() {
      if (disposed) return
      disposed = true
      // The loss forceContextLoss() causes is ours: stop listening before it fires.
      canvas.removeEventListener('webglcontextlost', onLost)
      cancelAnimationFrame(frameId)
      frameId = 0
      observer?.disconnect()
      stopPixelWatch()
      controls.removeEventListener('change', request)
      controls.dispose()
      clearInterval(clockTimer)
      // The sky first: dropModel counts every geometry still registered as the model's leak.
      if (sky) {
        sky.group.removeFromParent()
        sky.dispose()
      }
      dropModel()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      counts.scenes -= 1
    },
  }
}
