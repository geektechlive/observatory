/**
 * Small textures first (#85). The high tier draws as soon as the preloaded 2048 pair
 * is in, then loads the 4096 pair and swaps it in. Every texture is freed exactly once
 * however the swap and dispose interleave (#74).
 */
import { type ShaderMaterial, Texture } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GlobeRenderer, type RendererDeps } from '@/components/globe/three/GlobeRenderer'

interface Pending {
  url: string
  resolve: () => Texture
  reject: (error: Error) => void
}

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
  const pending: Pending[] = []
  const disposed = new Map<string, number>()
  const deps: RendererDeps = {
    createRenderer: () => renderer,
    loadTexture: (url: string) =>
      new Promise<Texture>((res, rej) => {
        pending.push({
          url,
          resolve: () => {
            const t = new Texture()
            t.name = url
            t.addEventListener('dispose', () => {
              disposed.set(url, (disposed.get(url) ?? 0) + 1)
            })
            res(t)
            return t
          },
          reject: rej,
        })
      }),
    requestFrame: vi.fn(() => 1),
    cancelFrame: vi.fn(),
    observeVisibility: () => () => undefined,
  }
  /** Resolves every request for these URLs and lets the promise chain settle. */
  const settle = async (urls: readonly string[]) => {
    for (const p of pending.filter((q) => urls.includes(q.url))) p.resolve()
    await new Promise((r) => setTimeout(r, 0))
  }
  return { deps, renderer, canvas, pending, disposed, settle }
}

const SMALL = {
  day: '/textures/day-2048.webp',
  night: '/textures/night-2048.webp',
  width: 2048 as const,
}
const LARGE = {
  day: '/textures/day-4096.webp',
  night: '/textures/night-4096.webp',
  width: 4096 as const,
}
const OPTIONS = {
  size: 460,
  textures: SMALL,
  dprCap: 2,
  // Reduced motion: no loop, so any draw after the swap is the swap's own.
  reducedMotion: true,
  warm: true,
  startFacing: 12,
}

const earthUniforms = (r: GlobeRenderer) =>
  (r.debugMeshes()[0]?.material as ShaderMaterial).uniforms
const twinUniforms = (r: GlobeRenderer) => (r.debugMeshes()[2]?.material as ShaderMaterial).uniforms

async function created(f: ReturnType<typeof fakes>, upgrade = true) {
  const promise = GlobeRenderer.create({ ...OPTIONS, upgrade: upgrade ? LARGE : undefined }, f.deps)
  await f.settle([SMALL.day, SMALL.night])
  return promise
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GlobeRenderer texture upgrade (#85)', () => {
  it('resolves on the 2048 pair alone and asks for 4096 only after it', async () => {
    const f = fakes()
    const promise = GlobeRenderer.create({ ...OPTIONS, upgrade: LARGE }, f.deps)
    expect(f.pending.map((p) => p.url)).toEqual([SMALL.day, SMALL.night])
    await f.settle([SMALL.day, SMALL.night])
    const r = await promise
    expect(f.pending.map((p) => p.url)).toEqual([SMALL.day, SMALL.night, LARGE.day, LARGE.night])
    expect(r.canvas.dataset['globeTextures']).toBe('2048')
    expect((earthUniforms(r)['dayTex']?.value as Texture).name).toBe(SMALL.day)
    r.dispose()
  })

  it('swaps the 4096 pair in, frees the 2048 pair and draws again', async () => {
    const f = fakes()
    const r = await created(f)
    r.attach(document.createElement('div'))
    const draws = f.renderer.render.mock.calls.length
    await f.settle([LARGE.day, LARGE.night])
    expect(r.canvas.dataset['globeTextures']).toBe('4096')
    expect((earthUniforms(r)['dayTex']?.value as Texture).name).toBe(LARGE.day)
    expect((earthUniforms(r)['nightTex']?.value as Texture).name).toBe(LARGE.night)
    // The bloom twin shares the Earth's uniforms, so it sees the swap too.
    expect((twinUniforms(r)['dayTex']?.value as Texture).name).toBe(LARGE.day)
    expect(f.disposed.get(SMALL.day)).toBe(1)
    expect(f.disposed.get(SMALL.night)).toBe(1)
    expect(f.renderer.render.mock.calls.length).toBeGreaterThan(draws)
    const large = earthUniforms(r)['dayTex']?.value as Texture
    expect(large.colorSpace).toBe('srgb')
    expect(large.anisotropy).toBe(4)
    r.dispose()
  })

  it('frees every texture exactly once across the swap and dispose (#74)', async () => {
    const f = fakes()
    const r = await created(f)
    await f.settle([LARGE.day, LARGE.night])
    r.dispose()
    r.dispose()
    expect(Object.fromEntries(f.disposed)).toEqual({
      [SMALL.day]: 1,
      [SMALL.night]: 1,
      [LARGE.day]: 1,
      [LARGE.night]: 1,
    })
  })

  it('frees a 4096 pair that arrives after dispose, and never swaps it in', async () => {
    const f = fakes()
    const r = await created(f)
    r.dispose()
    await f.settle([LARGE.day, LARGE.night])
    expect(r.canvas.dataset['globeTextures']).toBe('2048')
    expect(f.disposed.get(LARGE.day)).toBe(1)
    expect(f.disposed.get(LARGE.night)).toBe(1)
    expect(f.disposed.get(SMALL.day)).toBe(1)
  })

  it('stays on 2048 with a warning when a 4096 texture fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const f = fakes()
    const r = await created(f)
    f.pending.find((p) => p.url === LARGE.day)?.reject(new Error('404 day-4096'))
    await f.settle([LARGE.night])
    expect(r.canvas.dataset['globeTextures']).toBe('2048')
    expect((earthUniforms(r)['dayTex']?.value as Texture).name).toBe(SMALL.day)
    expect(f.disposed.get(LARGE.night)).toBe(1)
    expect(f.disposed.get(SMALL.day)).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    r.dispose()
  })

  it('never requests another pair without an upgrade (low tier)', async () => {
    const f = fakes()
    const r = await created(f, false)
    await new Promise((res) => setTimeout(res, 0))
    expect(f.pending.map((p) => p.url)).toEqual([SMALL.day, SMALL.night])
    expect(r.canvas.dataset['globeTextures']).toBe('2048')
    r.dispose()
  })
})
