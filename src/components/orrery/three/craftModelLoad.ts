/**
 * Load-and-fit for one model (#202), shared by the focused-model layer and any separate
 * detail view: a descriptor in, a prepared, centred Object3D out, with cancellation and a
 * dispose. Models are shipped uncompressed (docs/reference/orrery.md), so a plain
 * GLTFLoader is the whole loader.
 */
import {
  type BufferGeometry,
  Group,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  Texture,
  Vector3,
} from 'three'

import { robustCentreRadius } from '@/lib/orrery/craftModelFit'
import type { ModelDescriptor } from '@/lib/orrery/modelDescriptor'

import { buildStandIn } from './craftStandIns'

export type ModelLoader = (url: string) => Promise<Object3D>

type AnyMesh = Mesh<BufferGeometry, Material | Material[]>

/** Each mesh under `root`, typed (GLTFLoader builds plain Meshes). */
function meshes(root: Object3D): AnyMesh[] {
  const out: AnyMesh[] = []
  root.traverse((o) => {
    if ((o as Partial<AnyMesh>).isMesh) out.push(o as AnyMesh)
  })
  return out
}

const materialsOf = (mesh: AnyMesh): Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material]

/** Flat shading (the build drops normals) and a little self-light on every lit material. */
export function prepareMaterials(root: Object3D): void {
  for (const mesh of meshes(root)) {
    for (const m of materialsOf(mesh)) {
      if (m instanceof MeshStandardMaterial) {
        m.flatShading = true
        m.emissive.copy(m.color).multiplyScalar(0.18)
        if (m.map) m.emissiveMap = m.map
      }
      m.needsUpdate = true
    }
  }
}

/** Every vertex under `root` in world space, as a flat x, y, z list. */
export function positionsOf(root: Object3D): number[] {
  const out: number[] = []
  const v = new Vector3()
  root.updateMatrixWorld(true)
  for (const mesh of meshes(root)) {
    const p = mesh.geometry.getAttribute('position')
    for (let i = 0; i < p.count; i += 1) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)
      out.push(v.x, v.y, v.z)
    }
  }
  return out
}

/** Every texture a material under `root` holds (a texture two slots share is listed once). */
export function texturesOf(root: Object3D): Texture[] {
  const found = new Set<Texture>()
  for (const mesh of meshes(root)) {
    for (const m of materialsOf(mesh)) {
      for (const value of Object.values(m) as unknown[]) {
        if (value instanceof Texture) found.add(value as Texture)
      }
    }
  }
  return [...found]
}

/** Free the GPU resources (geometry, materials, textures) of everything under `root`. */
export function disposeTree(root: Object3D): void {
  for (const texture of texturesOf(root)) texture.dispose()
  for (const mesh of meshes(root)) {
    mesh.geometry.dispose()
    for (const m of materialsOf(mesh)) m.dispose()
  }
}

export interface FittedModel {
  /** Holds `root`, moved so the model's robust centre sits at the origin; original size. */
  readonly centred: Group
  /** The model's robust radius in its own units (outliers ignored). */
  readonly radius: number
}

/** Centre `root` on its robust centre and measure its robust radius. */
export function fitModel(root: Object3D): FittedModel {
  const fit = robustCentreRadius(positionsOf(root))
  const centred = new Group()
  centred.add(root)
  centred.position.set(-fit.centre.x, -fit.centre.y, -fit.centre.z)
  return { centred, radius: fit.radius }
}

export interface PreparedModel {
  /** Centred at the origin and scaled so its robust radius is 1. Parent it where needed. */
  readonly object: Group
  /** The robust radius the model had before it was scaled to 1. */
  readonly radius: number
  /** Free the GPU resources. Call once, when the object leaves the scene. */
  dispose(): void
}

function abortError(): Error {
  return new DOMException('The model load was cancelled', 'AbortError')
}

/**
 * Load (or build) the model a descriptor names and fit it. Rejects with an `AbortError`
 * when `signal` aborts, before or during the load; a model that arrives after that is
 * disposed here, never handed back. Any other rejection is the loader's own failure.
 */
export async function loadModel(
  descriptor: ModelDescriptor,
  load: ModelLoader,
  signal?: AbortSignal,
): Promise<PreparedModel> {
  if (signal?.aborted) throw abortError()
  if (descriptor.kind === 'standin') return fitPrepared(buildStandIn(descriptor.standIn), false)
  let root: Object3D
  try {
    root = await load(descriptor.file)
  } catch (e) {
    // A failure that follows a cancel is the cancel, not a broken model.
    if (signal?.aborted) throw abortError()
    throw e
  }
  if (signal?.aborted) {
    disposeTree(root)
    throw abortError()
  }
  return fitPrepared(root, true)
}

/** Prepare (when loaded), centre and unit-fit `root`; if that throws, free it and rethrow. */
function fitPrepared(root: Object3D, prepare: boolean): PreparedModel {
  try {
    if (prepare) prepareMaterials(root)
    const { centred, radius } = fitModel(root)
    const object = new Group()
    object.add(centred)
    object.scale.setScalar(1 / radius)
    return {
      object,
      radius,
      dispose: () => {
        disposeTree(object)
      },
    }
  } catch (e) {
    disposeTree(root)
    throw e
  }
}
