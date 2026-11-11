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

import { type PreparedModel, texturesOf } from './craftModelLoad'
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
/** Models are fitted to a robust radius of 1: this frames one with room around it. */
const START_DISTANCE = 3.6
const MIN_DISTANCE = 1.3
const MAX_DISTANCE = 12
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
  let frameId = 0
  let disposed = false

  const draw = () => {
    frameId = 0
    if (disposed) return
    // update() is true while damping still moves the camera: keep going until it settles.
    const moving = controls.update()
    renderer.render(scene, camera)
    reportCamera()
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

  const resize = () => {
    const w = host.clientWidth
    const h = host.clientHeight
    if (w < 1 || h < 1) return
    renderer.setPixelRatio(cappedPixelRatio(window))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
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
      spherical.radius = MathUtils.clamp(spherical.radius * factor, MIN_DISTANCE, MAX_DISTANCE)
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
