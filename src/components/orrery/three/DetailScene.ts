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
  MathUtils,
  PerspectiveCamera,
  Scene,
  Spherical,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { type OutlineFraming, outlineFraming } from '@/lib/orrery/detailFraming'

import { positionsOf, type PreparedModel, texturesOf } from './craftModelLoad'
import { cappedPixelRatio, watchPixelRatio } from './pixelRatio'

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

export const createDetailScene: CreateDetailScene = (host, options) => {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('data-detail-canvas', '')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', 'The model. Drag to turn it, scroll or pinch to zoom.')
  host.append(canvas)

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 100)
  camera.position.copy(START_DIRECTION).multiplyScalar(START_DISTANCE)
  scene.add(new AmbientLight(0xffffff, 1.1))
  const key = new DirectionalLight(0xffffff, 2.6)
  key.position.set(3, 4, 5)
  const fill = new DirectionalLight(0xbfd4ff, 0.7)
  fill.position.set(-4, -1, -3)
  scene.add(key, fill)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = !options.reducedMotion
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = MIN_DISTANCE
  controls.maxDistance = MAX_DISTANCE

  let model: PreparedModel | null = null
  /** Every vertex in scene space (x, y, z flat), or null with no model. */
  let points: Float32Array | null = null
  /** How the model was last framed; null with no model. */
  let framing: OutlineFraming | null = null
  let frameId = 0
  let disposed = false

  const draw = () => {
    frameId = 0
    if (disposed) return
    // update() is true while damping still moves the camera: keep going until it settles.
    const moving = controls.update()
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
  controls.addEventListener('change', request)

  /**
   * Frame the model by its real outline for the canvas as it is now: the zoom limits follow
   * the fitting distance, and the camera keeps its share of that distance, so a resize (a
   * phone turned, the inspector opened) keeps the model in view. `reset` puts the camera at
   * the fitting distance on the start side, for a new model.
   */
  const refit = (reset: boolean) => {
    if (!points) return
    const next = outlineFraming(points, START_DIRECTION, FOV, camera.aspect, FRAME_MARGIN)
    controls.minDistance = next.minDistance
    controls.maxDistance = next.maxDistance
    // The closest approach keeps the whole model at least 0.1 radius in front of the camera, so
    // half of that is a near plane that never clips it, and far / near stays a few hundred.
    camera.near = next.radius * NEAR_SHARE
    camera.far = next.maxDistance + next.radius * 2
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
    scene.remove(model.object)
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
      scene.add(next.object)
      next.object.updateMatrixWorld(true)
      // Centre on the middle of the outline as first seen (the fit centred on the body), so the
      // model sits in the middle of the canvas and the camera turns about the middle of it.
      const all = Float32Array.from(positionsOf(next.object))
      const { centre } = outlineFraming(all, START_DIRECTION, FOV, camera.aspect, FRAME_MARGIN)
      next.object.position.set(-centre.x, -centre.y, -centre.z)
      next.object.updateMatrixWorld(true)
      const shifted = new Float32Array(all.length)
      for (let i = 0; i < all.length; i += 3) {
        shifted[i] = (all[i] ?? 0) - centre.x
        shifted[i + 1] = (all[i + 1] ?? 0) - centre.y
        shifted[i + 2] = (all[i + 2] ?? 0) - centre.z
      }
      points = shifted
      framing = null
      refit(true)
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
      dropModel()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      counts.scenes -= 1
    },
  }
}
