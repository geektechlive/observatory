/**
 * The focused spacecraft as a 3D model (#115): NASA's own model where one is published,
 * otherwise a simplified model. Only the focused craft has one, and it is disposed when
 * the focus moves, so the GPU holds at most one. The model is sized in screen px, not to
 * scale, and turned so its `axis` (craftModels.ts) points along its attitude.
 */
import {
  type BufferGeometry,
  Group,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Texture,
  Vector3,
} from 'three'

import { robustCentreRadius } from '@/lib/orrery/craftModelFit'
import { type CraftModel, craftModelFor } from '@/lib/orrery/craftModels'

import { buildStandIn } from './craftStandIns'

/** A focused craft model's radius on screen, px (it is not to scale). */
export const CRAFT_MODEL_PX = 100

export type ModelLoader = (url: string) => Promise<Object3D>

interface Shown {
  key: string
  naifId: string
  model: CraftModel
  /** Positions the model and turns it; holds `inner`, which carries the centring. */
  holder: Group
  radius: number
}

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
function prepare(root: Object3D): void {
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

function positionsOf(root: Object3D): number[] {
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

function disposeTree(root: Object3D): void {
  for (const mesh of meshes(root)) {
    mesh.geometry.dispose()
    for (const m of materialsOf(mesh)) {
      for (const value of Object.values(m) as unknown[]) {
        if (value instanceof Texture) value.dispose()
      }
      m.dispose()
    }
  }
}

export class CraftModelLayer {
  readonly group = new Group()
  private shown: Shown | null = null
  /** The craft whose model is loading, by key; a late model for another is thrown away. */
  private pending: { key: string; naifId: string } | null = null
  private failed: string | null = null
  private readonly load: ModelLoader
  private readonly onChange: () => void
  private readonly quaternion = new Quaternion()
  private readonly axis = new Vector3()

  constructor(load: ModelLoader, onChange: () => void) {
    this.load = load
    this.onChange = onChange
  }

  /** The focus moved to a craft (or away, with null). */
  show(key: string | null, naifId: string | null): void {
    if (key !== null && (this.shown?.key === key || this.pending?.key === key)) return
    this.clear()
    if (key === null || naifId === null) return
    const model = craftModelFor(naifId)
    if (!model) return
    if (model.kind === 'simplified') {
      this.mount(key, naifId, model, buildStandIn(model.standIn))
      return
    }
    this.pending = { key, naifId }
    this.load(model.file).then(
      (root) => {
        if (this.pending?.key !== key) {
          disposeTree(root)
          return
        }
        this.pending = null
        prepare(root)
        this.mount(key, naifId, model, root)
      },
      () => {
        if (this.pending?.key !== key) return
        this.pending = null
        this.failed = naifId
        this.onChange()
      },
    )
  }

  private mount(key: string, naifId: string, model: CraftModel, root: Object3D): void {
    const fit = robustCentreRadius(positionsOf(root))
    const inner = new Group()
    inner.add(root)
    inner.position.set(-fit.centre.x, -fit.centre.y, -fit.centre.z)
    const holder = new Group()
    holder.name = `model:${naifId}`
    holder.add(inner)
    this.group.add(holder)
    this.shown = { key, naifId, model, holder, radius: fit.radius }
    this.onChange()
  }

  private clear(): void {
    this.pending = null
    this.failed = null
    if (!this.shown) return
    this.group.remove(this.shown.holder)
    disposeTree(this.shown.holder)
    this.shown = null
  }

  /** Put the model at `position`, CRAFT_MODEL_PX in radius, its axis along `direction`. */
  place(position: Vector3, unitsPerPx: number, direction: Vector3): void {
    const s = this.shown
    if (!s) return
    s.holder.position.copy(position)
    s.holder.scale.setScalar((CRAFT_MODEL_PX * unitsPerPx) / s.radius)
    this.axis.set(...s.model.axis).normalize()
    this.quaternion.setFromUnitVectors(this.axis, direction.clone().normalize())
    s.holder.quaternion.copy(this.quaternion)
  }

  /** The craft key whose model is drawn now (its silhouette steps aside), or null. */
  shownKey(): string | null {
    return this.shown?.key ?? null
  }

  shownModel(): CraftModel | null {
    return this.shown?.model ?? null
  }

  /** For the canvas data attribute: '', loading:, model:, simplified: or failed:<naif>. */
  state(): string {
    if (this.shown)
      return `${this.shown.model.kind === 'nasa' ? 'model' : 'simplified'}:${this.shown.naifId}`
    if (this.pending) return `loading:${this.pending.naifId}`
    if (this.failed) return `failed:${this.failed}`
    return ''
  }

  dispose(): void {
    this.clear()
  }
}
