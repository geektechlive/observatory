/**
 * GlobeRenderer bloom and aurora time (#50). The bloom post-process needs a real GPU,
 * so it comes in through deps.createBloom and these tests check only the wiring:
 * it runs after every draw, follows resize, frees its render targets, and is never
 * built on the low tier. The Earth gets a bloom-only twin (city lights only) so
 * copper never glows; the atmosphere stays out of the bloom pass.
 */
import { Layers, type PerspectiveCamera, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  type BloomLike,
  GlobeRenderer,
  type RendererDeps,
} from '@/components/globe/three/GlobeRenderer'
import { BLOOM_LAYER, OVERLAY_LAYER } from '@/components/globe/three/layers'

function fakes() {
  const order: string[] = []
  const renderer = {
    domElement: document.createElement('canvas'),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    // Records which layers each draw saw: main (0), overlay (2), or both.
    render: vi.fn((_scene: unknown, camera: PerspectiveCamera) =>
      order.push(`render:${String(camera.layers.mask)}`),
    ),
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
const MAIN = 1
const OVERLAY = 1 << OVERLAY_LAYER

describe('GlobeRenderer bloom (#50)', () => {
  it('draws the scene, adds the bloom, then draws glyphs on top: on attach and every frame', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    r.attach(document.createElement('div'))
    f.tick(16)
    const frame = [`render:${String(MAIN)}`, 'bloom', `render:${String(OVERLAY)}`]
    expect(f.order).toEqual([...frame, ...frame])
    r.dispose()
  })

  it('never builds the bloom on the low tier, and draws glyphs in the one pass', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create({ ...OPTIONS, bloom: false }, f.deps)
    r.attach(document.createElement('div'))
    expect(f.deps.createBloom).not.toHaveBeenCalled()
    expect(f.order).toEqual([`render:${String(MAIN | OVERLAY)}`])
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

  it('frees the Earth geometry it shares with the bloom twin exactly once (#74)', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const [earth, , twin] = r.debugMeshes()
    if (!earth || !twin) throw new Error('expected the Earth and its bloom twin')
    expect(twin.geometry).toBe(earth.geometry)
    const dispose = vi.spyOn(earth.geometry, 'dispose')
    r.dispose()
    expect(dispose).toHaveBeenCalledOnce()
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

describe('GlobeRenderer aurora reach (#77)', () => {
  const reach = (lat: number) => ({
    likely: {
      n: [
        [-100, lat],
        [-99, lat],
      ] as [number, number][],
      s: [],
    },
    possible: { n: [], s: [] },
  })

  it('rebuilds the static layers when a new reach arrives, not when the same one does', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const builds = () => Number(f.renderer.domElement.dataset['globeBuilds'])
    const first = reach(55)
    r.setLayers({ ...LAYERS, auroraReach: first })
    const after = builds()
    r.setLayers({ ...LAYERS, auroraReach: first })
    expect(builds()).toBe(after)
    r.setLayers({ ...LAYERS, auroraReach: reach(52) })
    expect(builds()).toBe(after + 1)
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
    const requestFrame = vi.fn(f.deps.requestFrame)
    f.deps.requestFrame = requestFrame
    const r = await GlobeRenderer.create({ ...OPTIONS, reducedMotion: true }, f.deps)
    r.setLayers(LAYERS)
    r.attach(document.createElement('div'))
    // No frame loop at all, so nothing can advance the clock: one still draw, at t = 0.
    expect(requestFrame).not.toHaveBeenCalled()
    expect(f.order.filter((s) => s.startsWith('render')).length).toBeGreaterThan(0)
    expect(r.debugAuroraTime()).toBe(0)
    r.dispose()
  })
})
