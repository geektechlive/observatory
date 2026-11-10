import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CraftModelLayer } from '@/components/orrery/three/craftModelLayer'
import { loadModel } from '@/components/orrery/three/craftModelLoad'
import { type FileDescriptor, spacecraftDescriptor } from '@/lib/orrery/modelDescriptor'

/** A stand-in for a loaded GLB: one 2 x 2 x 2 box off-centre, its dispose spied. */
function fakeModel() {
  const geometry = new BoxGeometry(2, 2, 2)
  const dispose = vi.spyOn(geometry, 'dispose')
  const mesh = new Mesh(geometry, new MeshStandardMaterial())
  mesh.position.set(10, 0, 0)
  const root = new Group()
  root.add(mesh)
  return { root, dispose }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

const satellite: FileDescriptor = {
  kind: 'file',
  file: '/models/craft/iss.glb',
  credit: 'Test credit',
  licence: 'CC0',
  sourceUrl: 'https://example.test/iss',
  attitude: 'earth',
  axis: [0, 1, 0],
  attitudeNote: 'Nadir',
  scope: 'own',
}

afterEach(() => vi.restoreAllMocks())

/** A model that cannot be fitted: a mesh with no positions. Its dispose is spied. */
function brokenModel() {
  const geometry = new BufferGeometry()
  const dispose = vi.spyOn(geometry, 'dispose')
  const root = new Group()
  root.add(new Mesh(geometry, new MeshStandardMaterial()))
  return { root, dispose }
}

describe('loadModel (#202)', () => {
  it('disposes the model and rethrows when fitting it fails', async () => {
    const m = brokenModel()
    await expect(loadModel(satellite, () => Promise.resolve(m.root))).rejects.toThrow()
    expect(m.dispose).toHaveBeenCalled()
  })

  it('reports a loader failure after a cancel as an AbortError', async () => {
    const controller = new AbortController()
    const result = loadModel(
      satellite,
      () => {
        controller.abort()
        return Promise.reject(new Error('network down'))
      },
      controller.signal,
    )
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('loads a file descriptor, centres it and fits it to a unit radius', async () => {
    const m = fakeModel()
    const loader = vi.fn(() => Promise.resolve(m.root))
    const prepared = await loadModel(satellite, loader)
    expect(loader).toHaveBeenCalledWith('/models/craft/iss.glb')
    expect(prepared.radius).toBeCloseTo(Math.sqrt(3), 6)
    prepared.object.updateMatrixWorld(true)
    const box = new Box3().setFromObject(prepared.object)
    expect(box.getCenter(new Vector3()).length()).toBeLessThan(1e-6)
    expect(box.max.x - box.min.x).toBeCloseTo(2 / Math.sqrt(3), 6)
  })

  it('builds a stand-in without loading anything', async () => {
    const loader = vi.fn()
    const d = spacecraftDescriptor('-255')
    if (!d) throw new Error('no Psyche descriptor')
    const prepared = await loadModel(d, loader)
    expect(loader).not.toHaveBeenCalled()
    expect(prepared.radius).toBeGreaterThan(0)
  })

  it('disposes the geometry when asked', async () => {
    const m = fakeModel()
    const prepared = await loadModel(satellite, () => Promise.resolve(m.root))
    prepared.dispose()
    expect(m.dispose).toHaveBeenCalled()
  })

  it('rejects without loading when already cancelled', async () => {
    const loader = vi.fn()
    const controller = new AbortController()
    controller.abort()
    await expect(loadModel(satellite, loader, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(loader).not.toHaveBeenCalled()
  })

  it('disposes a model that arrives after cancelling, and rejects', async () => {
    const m = fakeModel()
    let resolve: (o: Object3D) => void = () => undefined
    const loader = () =>
      new Promise<Object3D>((res) => {
        resolve = res
      })
    const controller = new AbortController()
    const result = loadModel(satellite, loader, controller.signal)
    controller.abort()
    resolve(m.root)
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(m.dispose).toHaveBeenCalled()
  })

  it('passes a load failure through', async () => {
    await expect(loadModel(satellite, () => Promise.reject(new Error('404')))).rejects.toThrow(
      '404',
    )
  })
})

describe('CraftModelLayer.showDescriptor (#202)', () => {
  it('shows a satellite descriptor the same way as a spacecraft one', async () => {
    const m = fakeModel()
    const loader = vi.fn(() => Promise.resolve(m.root))
    const layer = new CraftModelLayer(loader, () => undefined)
    layer.showDescriptor('sat:25544', '25544', satellite)
    expect(layer.state()).toBe('loading:25544')
    await flush()
    expect(loader).toHaveBeenCalledWith('/models/craft/iss.glb')
    expect(layer.state()).toBe('model:25544')
    expect(layer.shownDescriptor()).toBe(satellite)
  })

  it('fails cleanly, disposing the model, when a loaded model cannot be fitted', async () => {
    const m = brokenModel()
    const layer = new CraftModelLayer(
      () => Promise.resolve(m.root),
      () => undefined,
    )
    layer.showDescriptor('sat:1', '1', satellite)
    await flush()
    expect(layer.state()).toBe('failed:1')
    expect(layer.shownKey()).toBeNull()
    expect(m.dispose).toHaveBeenCalled()
  })

  it('mounts a stand-in descriptor without loading', () => {
    const loader = vi.fn()
    const layer = new CraftModelLayer(loader, () => undefined)
    const d = spacecraftDescriptor('-49')
    if (!d) throw new Error('no Lucy descriptor')
    layer.showDescriptor('naif:-49', '-49', d)
    expect(loader).not.toHaveBeenCalled()
    expect(layer.state()).toBe('simplified:-49')
  })
})
