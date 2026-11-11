import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { CraftModelLayer } from '@/components/orrery/three/craftModelLayer'

/** A stand-in for a loaded GLB: one 2 x 2 x 2 box, its dispose spied. */
function fakeModel() {
  const geometry = new BoxGeometry(2, 2, 2)
  const material = new MeshStandardMaterial()
  const dispose = vi.spyOn(geometry, 'dispose')
  const root = new Group()
  root.add(new Mesh(geometry, material))
  return { root, dispose }
}

function deferred() {
  let resolve: (o: Object3D) => void = () => undefined
  let reject: (e: Error) => void = () => undefined
  const promise = new Promise<Object3D>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('CraftModelLayer (#115)', () => {
  it('loads a NASA craft model on focus and reports it on the canvas', async () => {
    const d = deferred()
    const loader = vi.fn(() => d.promise)
    const onChange = vi.fn()
    const layer = new CraftModelLayer(loader, onChange)
    layer.show('naif:-31', '-31')
    expect(loader).toHaveBeenCalledWith('/models/craft/voyager.glb')
    expect(layer.state()).toBe('loading:-31')
    d.resolve(fakeModel().root)
    await flush()
    expect(layer.state()).toBe('model:-31')
    expect(layer.shownKey()).toBe('naif:-31')
    expect(layer.group.children.length).toBe(1)
    expect(onChange).toHaveBeenCalled()
  })

  it('builds a simplified model for a craft with no NASA model, without loading', () => {
    const loader = vi.fn()
    const layer = new CraftModelLayer(loader, () => undefined)
    layer.show('naif:-255', '-255')
    expect(loader).not.toHaveBeenCalled()
    expect(layer.state()).toBe('simplified:-255')
    expect(layer.group.children.length).toBe(1)
  })

  it('disposes the old model when the focus moves, and on unfocus', async () => {
    const first = fakeModel()
    const layer = new CraftModelLayer(
      () => Promise.resolve(first.root),
      () => undefined,
    )
    layer.show('naif:-31', '-31')
    await flush()
    layer.show(null, null)
    expect(first.dispose).toHaveBeenCalled()
    expect(layer.group.children.length).toBe(0)
    expect(layer.state()).toBe('')
  })

  it('throws away a model that arrives after the focus moved on', async () => {
    const late = deferred()
    const model = fakeModel()
    const layer = new CraftModelLayer(
      () => late.promise,
      () => undefined,
    )
    layer.show('naif:-31', '-31')
    layer.show('naif:-255', '-255')
    late.resolve(model.root)
    await flush()
    expect(model.dispose).toHaveBeenCalled()
    expect(layer.state()).toBe('simplified:-255')
  })

  it('falls back to the silhouette when a model fails to load', async () => {
    const d = deferred()
    const layer = new CraftModelLayer(
      () => d.promise,
      () => undefined,
    )
    layer.show('naif:-31', '-31')
    d.reject(new Error('404'))
    await flush()
    expect(layer.state()).toBe('failed:-31')
    expect(layer.shownKey()).toBeNull()
  })

  it('points the model axis along the attitude and sizes it in px, not to scale', async () => {
    const layer = new CraftModelLayer(
      () => Promise.resolve(fakeModel().root),
      () => undefined,
    )
    layer.show('naif:-31', '-31') // Voyager: its +Y (the dish) to Earth
    await flush()
    const dir = new Vector3(1, 0, 0)
    const unitsPerPx = 0.01
    const modelPx = 30
    layer.place(new Vector3(5, 0, 0), unitsPerPx, dir, modelPx)
    const holder = layer.group.children[0] as Object3D
    const axis = new Vector3(0, 1, 0).applyQuaternion(holder.quaternion)
    expect(axis.distanceTo(dir)).toBeLessThan(1e-6)
    expect(holder.position.x).toBeCloseTo(5)
    // The fake box's robust radius is its corner distance, sqrt(3).
    expect(holder.scale.x).toBeCloseTo((modelPx * unitsPerPx) / Math.sqrt(3), 6)
  })
})
