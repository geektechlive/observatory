/**
 * GlobeRenderer bloom and aurora time (#50). The bloom post-process needs a real GPU,
 * so it comes in through deps.createBloom and these tests check only the wiring:
 * it runs after every draw, follows resize, frees its render targets, and is never
 * built on the low tier. The Earth gets a bloom-only twin (city lights only) so
 * copper never glows; the atmosphere stays out of the bloom pass.
 */
import { Layers, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  type BloomLike,
  GlobeRenderer,
  type RendererDeps,
} from '@/components/globe/three/GlobeRenderer'
import { BLOOM_LAYER } from '@/components/globe/three/layers'

function fakes() {
  const order: string[] = []
  const renderer = {
    domElement: document.createElement('canvas'),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(() => order.push('render')),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    capabilities: { getMaxAnisotropy: () => 8 },
  }
  const setSize = vi.fn()
  const dispose = vi.fn()
  const bloom: BloomLike = {
    render: vi.fn(() => order.push('bloom')),
    setSize,
    dispose,
  }
  let frameCb: ((t: number) => void) | null = null
  const deps: RendererDeps = {
    createRenderer: () => renderer,
    loadTexture: () => Promise.resolve(new Texture()),
    requestFrame: (cb) => {
      frameCb = cb
      return 1
    },
    cancelFrame: vi.fn(),
    createBloom: vi.fn(() => bloom),
  }
  return { deps, renderer, bloom: { setSize, dispose }, order, tick: (t: number) => frameCb?.(t) }
}

const OPTIONS = {
  size: 460,
  textures: { day: '/d.webp', night: '/n.webp' },
  dprCap: 2,
  reducedMotion: false,
  warm: true,
  startFacing: 12,
  bloom: true,
}

const LAYERS = {
  iss: null,
  trail: [],
  events: [],
  quakes: [],
  fires: [],
  fireballs: [],
  launches: [],
  disasters: [],
  satellites: [],
  aurora: [[0, 70, 20] as const],
  tracking: false,
}

const bloomOnly = new Layers()
bloomOnly.set(BLOOM_LAYER)
const mainOnly = new Layers()

describe('GlobeRenderer bloom (#50)', () => {
  it('adds the bloom after every draw, on attach and in the frame loop', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    r.attach(document.createElement('div'))
    f.tick(16)
    expect(f.order).toEqual(['render', 'bloom', 'render', 'bloom'])
    r.dispose()
  })

  it('never builds the bloom on the low tier', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create({ ...OPTIONS, bloom: false }, f.deps)
    r.attach(document.createElement('div'))
    expect(f.deps.createBloom).not.toHaveBeenCalled()
    expect(f.order).toEqual(['render'])
    r.dispose()
  })

  it('resizes the bloom targets with the canvas, in device pixels', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const dpr = Math.min(globalThis.devicePixelRatio || 1, OPTIONS.dprCap)
    r.resize(680)
    expect(f.bloom.setSize).toHaveBeenLastCalledWith(680 * dpr, 680 * dpr)
    r.dispose()
  })

  it('frees the bloom render targets on dispose', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    r.dispose()
    expect(f.bloom.dispose).toHaveBeenCalledOnce()
  })

  it('gives the Earth a bloom-only twin and keeps the copper Earth and atmosphere out of bloom', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const [earth, atmosphere, twin] = r.debugMeshes()
    expect(earth?.layers.test(bloomOnly)).toBe(false)
    expect(atmosphere?.layers.test(bloomOnly)).toBe(false)
    expect(twin?.layers.test(bloomOnly)).toBe(true)
    expect(twin?.layers.test(mainOnly)).toBe(false)
    r.dispose()
  })
})

describe('GlobeRenderer aurora time (#50, spec section 6)', () => {
  it('advances while the globe turns', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    r.setLayers(LAYERS)
    r.attach(document.createElement('div'))
    f.tick(1000)
    f.tick(3000)
    expect(r.debugAuroraTime()).toBeCloseTo(2, 6)
    r.dispose()
  })

  it('freezes while rotation is paused', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    r.setLayers(LAYERS)
    r.attach(document.createElement('div'))
    f.tick(1000)
    f.tick(2000)
    r.setRotationPaused(true)
    const held = r.debugAuroraTime()
    f.tick(5000)
    expect(r.debugAuroraTime()).toBe(held)
    r.dispose()
  })

  it('never moves under reduced motion', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create({ ...OPTIONS, reducedMotion: true }, f.deps)
    r.setLayers(LAYERS)
    r.attach(document.createElement('div'))
    f.tick(1000)
    f.tick(9000)
    expect(r.debugAuroraTime()).toBe(0)
    r.dispose()
  })
})
