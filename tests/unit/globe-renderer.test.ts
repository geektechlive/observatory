/**
 * GlobeRenderer lifecycle (#46, #47). jsdom has no WebGL, so the renderer takes its
 * WebGL factory, texture loader and frame scheduler as dependencies; the scene
 * graph itself is real three.js. The spike leaked its texture, materials and
 * atmosphere on teardown and setState'd every frame; these tests pin the fixes.
 */
import { Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { GlobeRenderer, type RendererDeps } from '@/components/globe/three/GlobeRenderer'

function fakes() {
  const canvas = document.createElement('canvas')
  const renderer = {
    domElement: canvas,
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    capabilities: { getMaxAnisotropy: () => 8 },
  }
  const textures: Texture[] = []
  let frameCb: ((t: number) => void) | null = null
  const deps: RendererDeps = {
    createRenderer: () => renderer,
    loadTexture: (url: string) => {
      const t = new Texture()
      t.name = url
      textures.push(t)
      return Promise.resolve(t)
    },
    requestFrame: vi.fn((cb: (t: number) => void) => {
      frameCb = cb
      return 1
    }),
    cancelFrame: vi.fn(),
  }
  return { deps, renderer, canvas, textures, tick: (t: number) => frameCb?.(t) }
}

const OPTIONS = {
  size: 460,
  textures: { day: '/textures/day-2048.webp', night: '/textures/night-2048.webp' },
  dprCap: 1.5,
  reducedMotion: false,
  warm: true,
}

describe('GlobeRenderer', () => {
  it('loads both textures before it resolves, and sizes the canvas', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    expect(f.textures.map((t) => t.name)).toEqual([OPTIONS.textures.day, OPTIONS.textures.night])
    expect(f.renderer.setSize).toHaveBeenCalledWith(460, 460, false)
    expect(r.canvas).toBe(f.canvas)
    r.dispose()
  })

  it('rejects, and leaves nothing behind, when a texture fails', async () => {
    const f = fakes()
    f.deps.loadTexture = () => Promise.reject(new Error('404 /textures/day-2048.webp'))
    await expect(GlobeRenderer.create(OPTIONS, f.deps)).rejects.toThrow(/404/)
    expect(f.renderer.dispose).toHaveBeenCalled()
    expect(f.renderer.forceContextLoss).toHaveBeenCalled()
  })

  it('rotates westward at the SVG globe rate (6 degrees per second)', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const parent = document.createElement('div')
    r.attach(parent)
    const before = r.facing()
    f.tick(1000)
    f.tick(2000)
    expect(before - r.facing()).toBeCloseTo(6, 0)
    r.dispose()
  })

  it('does not rotate under reduced motion, and renders once on attach', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create({ ...OPTIONS, reducedMotion: true }, f.deps)
    r.attach(document.createElement('div'))
    expect(f.renderer.render).toHaveBeenCalledTimes(1)
    expect(f.deps.requestFrame).not.toHaveBeenCalled()
    r.dispose()
  })

  it('pauses rotation on request and resumes', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    r.attach(document.createElement('div'))
    f.tick(1000)
    r.setRotationPaused(true)
    const held = r.facing()
    f.tick(3000)
    expect(r.facing()).toBeCloseTo(held, 9)
    r.dispose()
  })

  it('detach keeps the GPU context for re-attach (no churn on Earth/Sun/Sky switches)', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const parent = document.createElement('div')
    r.attach(parent)
    r.detach()
    expect(parent.contains(f.canvas)).toBe(false)
    expect(f.renderer.dispose).not.toHaveBeenCalled()
    expect(f.deps.cancelFrame).toHaveBeenCalled()
    r.attach(parent)
    expect(parent.contains(f.canvas)).toBe(true)
    r.dispose()
  })

  it('dispose releases the context, textures, geometries, materials, loop and listeners', async () => {
    const f = fakes()
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const parent = document.createElement('div')
    r.attach(parent)
    const disposed = vi.fn()
    for (const t of f.textures) t.addEventListener('dispose', disposed)
    const meshes = r.debugMeshes()
    const geoDisposed = meshes.map((m) => vi.spyOn(m.geometry, 'dispose'))
    const matDisposed = meshes.map((m) =>
      vi.spyOn(m.material as { dispose: () => void }, 'dispose'),
    )

    r.dispose()

    expect(f.renderer.dispose).toHaveBeenCalled()
    expect(f.renderer.forceContextLoss).toHaveBeenCalled()
    expect(disposed).toHaveBeenCalledTimes(2)
    for (const spy of [...geoDisposed, ...matDisposed]) expect(spy).toHaveBeenCalled()
    expect(f.deps.cancelFrame).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(parent.contains(f.canvas)).toBe(false)
    removeSpy.mockRestore()
  })

  it('reports a lost GPU context so the host can fall back to SVG', async () => {
    const f = fakes()
    const onContextLost = vi.fn()
    const r = await GlobeRenderer.create({ ...OPTIONS, onContextLost }, f.deps)
    f.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(onContextLost).toHaveBeenCalledOnce()
    r.dispose()
  })
})
