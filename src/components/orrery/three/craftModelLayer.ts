/**
 * The focused spacecraft as a 3D model (#115): NASA's own model where one is published,
 * otherwise a simplified model. Only the focused craft has one, and it is disposed when
 * the focus moves, so the GPU holds at most one. The model is sized in screen px, not to
 * scale, and turned so its `axis` (craftModels.ts) points along its attitude.
 */
import { Group, type Object3D, Quaternion, Vector3 } from 'three'

import { type ModelDescriptor, spacecraftDescriptor } from '@/lib/orrery/modelDescriptor'

import { disposeTree, fitModel, type ModelLoader, prepareMaterials } from './craftModelLoad'
import { buildStandIn } from './craftStandIns'

export type { ModelLoader }

interface Shown {
  key: string
  naifId: string
  model: ModelDescriptor
  /** Positions the model and turns it; holds the centred model. */
  holder: Group
  radius: number
}

export class CraftModelLayer {
  readonly group = new Group()
  private shown: Shown | null = null
  /** The craft whose model is loading, by key; a late model for another is thrown away. */
  private pending: { key: string; naifId: string; model: ModelDescriptor } | null = null
  private failed: string | null = null
  /** The load that failed, so a caller that asks again each frame does not retry it (#194). */
  private failure: { key: string; model: ModelDescriptor } | null = null
  private readonly load: ModelLoader
  private readonly onChange: () => void
  private readonly quaternion = new Quaternion()
  private readonly axis = new Vector3()

  constructor(load: ModelLoader, onChange: () => void) {
    this.load = load
    this.onChange = onChange
  }

  /** The focus moved to a spacecraft (or away, with null). */
  show(key: string | null, naifId: string | null): void {
    if (key !== null && (this.shown?.key === key || this.pending?.key === key)) return
    // A craft asked for again by focus is tried again, as before.
    this.failure = null
    if (key === null || naifId === null) {
      this.clear()
      return
    }
    const model = spacecraftDescriptor(naifId)
    if (!model) {
      this.clear()
      return
    }
    this.showDescriptor(key, naifId, model)
  }

  /**
   * Show any descriptor (a spacecraft's or a satellite's) under `key`; `id` names it in
   * state(). Asking again for the same key and descriptor does nothing, a failed one included
   * (until the key is cleared); a new descriptor under the same key replaces the model.
   */
  showDescriptor(key: string, id: string, model: ModelDescriptor): void {
    if (this.shown?.key === key && this.shown.model === model) return
    if (this.pending?.key === key && this.pending.model === model) return
    if (this.failure?.key === key && this.failure.model === model) return
    this.failure = null
    this.clear()
    if (model.kind === 'standin') {
      this.mount(key, id, model, buildStandIn(model.standIn))
      return
    }
    this.pending = { key, naifId: id, model }
    this.load(model.file).then(
      (root) => {
        if (this.pending?.key !== key || this.pending.model !== model) {
          disposeTree(root)
          return
        }
        this.pending = null
        try {
          prepareMaterials(root)
          this.mount(key, id, model, root)
        } catch {
          // A model that cannot be fitted is a failed load: free it, fall back to the icon.
          disposeTree(root)
          this.failed = id
          this.failure = { key, model }
          this.onChange()
        }
      },
      () => {
        if (this.pending?.key !== key || this.pending.model !== model) return
        this.pending = null
        this.failed = id
        this.failure = { key, model }
        this.onChange()
      },
    )
  }

  private mount(key: string, naifId: string, model: ModelDescriptor, root: Object3D): void {
    const fit = fitModel(root)
    const holder = new Group()
    holder.name = `model:${naifId}`
    holder.add(fit.centred)
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

  /** Put the model at `position`, `px` in radius on screen, its axis along `direction`. */
  place(position: Vector3, unitsPerPx: number, direction: Vector3, px: number): void {
    const s = this.shown
    if (!s) return
    s.holder.position.copy(position)
    s.holder.scale.setScalar((px * unitsPerPx) / s.radius)
    this.axis.set(...s.model.axis).normalize()
    this.quaternion.setFromUnitVectors(this.axis, direction.clone().normalize())
    s.holder.quaternion.copy(this.quaternion)
  }

  /** The craft key whose model is drawn now (its silhouette steps aside), or null. */
  shownKey(): string | null {
    return this.shown?.key ?? null
  }

  shownDescriptor(): ModelDescriptor | null {
    return this.shown?.model ?? null
  }

  /** For the canvas data attribute: '', loading:, model:, simplified: or failed:<naif>. */
  state(): string {
    if (this.shown)
      return `${this.shown.model.kind === 'file' ? 'model' : 'simplified'}:${this.shown.naifId}`
    if (this.pending) return `loading:${this.pending.naifId}`
    if (this.failed) return `failed:${this.failed}`
    return ''
  }

  dispose(): void {
    this.clear()
  }
}
