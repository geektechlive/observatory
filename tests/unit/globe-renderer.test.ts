/**
 * GlobeRenderer lifecycle (#46, #47). jsdom has no WebGL, so the renderer takes its
 * WebGL factory, texture loader and frame scheduler as dependencies; the scene
 * graph itself is real three.js. The spike leaked its texture, materials and
 * atmosphere on teardown and setState'd every frame; these tests pin the fixes.
 */
import { Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { GlobeRenderer, type RendererDeps } from '@/components/globe/three/GlobeRenderer'
import { altToRadius, GLOBE_SPIN_DEG_PER_SEC, isOccluded, terminatorFacing } from '@/lib/globe3d'

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
  // Fixed so the geometry in these tests doesn't depend on the clock.
  startFacing: 12,
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

  it('rotates westward at the shared spin rate (#62)', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const parent = document.createElement('div')
    r.attach(parent)
    const before = r.facing()
    f.tick(1000)
    f.tick(2000)
    expect(before - r.facing()).toBeCloseTo(GLOBE_SPIN_DEG_PER_SEC, 3)
    r.dispose()
  })

  it('starts facing the evening terminator when no start is given (#62)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T02:19:00Z'))
    const f = fakes()
    const r = await GlobeRenderer.create({ ...OPTIONS, startFacing: undefined }, f.deps)
    expect(r.facing()).toBeCloseTo(terminatorFacing(new Date('2026-10-19T02:19:00Z')), 6)
    r.dispose()
    vi.useRealTimers()
  })

  it('setFacing turns the globe to a longitude, so the SVG crossfade lines up (#62)', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    r.setFacing(-133.5)
    expect(r.facing()).toBeCloseTo(-133.5, 6)
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

describe('GlobeRenderer satellites never flash through the Earth (#60)', () => {
  const BASE = {
    iss: null,
    trail: [],
    events: [],
    quakes: [],
    fires: [],
    fireballs: [],
    launches: [],
    disasters: [],
    aurora: [],
    tracking: false,
  }
  // The globe starts facing 12°E: 12°E is in front, 168°W is behind the Earth.
  const SATS = [
    { name: 'Front', lat: 0, lon: 12, alt: 540 },
    { name: 'Back', lat: 0, lon: -168, alt: 540 },
  ]

  /** Records, at every draw call, which nameplates were visible. */
  function recordDraws(f: ReturnType<typeof fakes>, r: GlobeRenderer): Record<string, boolean>[] {
    const draws: Record<string, boolean>[] = []
    f.renderer.render.mockImplementation(() => {
      draws.push(Object.fromEntries(r.debugNameplates().map((p) => [p.name, p.object.visible])))
    })
    return draws
  }

  it('hides a back-side satellite on the first draw after setLayers (frame loop)', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const draws = recordDraws(f, r)
    r.attach(document.createElement('div'))
    f.tick(16)
    r.setLayers({ ...BASE, satellites: SATS })
    f.tick(32)
    f.tick(48)
    const withPlates = draws.filter((d) => 'Back' in d)
    expect(withPlates.length).toBeGreaterThan(0)
    for (const d of withPlates) {
      expect(d['Back']).toBe(false)
      expect(d['Front']).toBe(true)
    }
    r.dispose()
  })

  it('hides a satellite on the same frame it rotates behind the limb', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    // Record visibility AND the pose at each draw call.
    const draws: { visible: boolean; facing: number }[] = []
    f.renderer.render.mockImplementation(() => {
      const plate = r.debugNameplates().find((p) => p.name === 'Limb')
      if (plate) draws.push({ visible: plate.object.visible, facing: r.facing() })
    })
    r.attach(document.createElement('div'))
    const LON = 12 + 70
    r.setLayers({ ...BASE, satellites: [{ name: 'Limb', lat: 0, lon: LON, alt: 540 }] })
    for (let t = 0; t <= 30_000; t += 100) f.tick(t)

    // Expected for the pose drawn: the satellite sits `delta` degrees from the facing
    // longitude, on the equator, seen from the camera on +Z at distance 4.1.
    const R = altToRadius(540)
    const expected = (facing: number) => {
      const d = ((LON - facing) * Math.PI) / 180
      return !isOccluded([R * Math.sin(d), 0, R * Math.cos(d)], [0, 0, 4.1])
    }
    expect(draws.some((d) => d.visible)).toBe(true)
    expect(draws.some((d) => !d.visible)).toBe(true)
    for (const d of draws) expect(d.visible).toBe(expected(d.facing))
    r.dispose()
  })

  it('hides a back-side satellite on the single draw under reduced motion', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create({ ...OPTIONS, reducedMotion: true }, f.deps)
    const draws = recordDraws(f, r)
    r.attach(document.createElement('div'))
    r.setLayers({ ...BASE, satellites: SATS })
    const last = draws.at(-1)
    expect(last?.['Back']).toBe(false)
    expect(last?.['Front']).toBe(true)
    r.dispose()
  })

  it('does not rebuild static layers when an update has the same contents', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const events = [{ lat: 0, lon: 12, kind: 'wildfires' }]
    r.setLayers({ ...BASE, events, satellites: SATS })
    // What App does at 5 Hz: fresh empty arrays and a fresh array of the same items.
    r.setLayers({ ...BASE, fires: [], aurora: [], events: [...events], satellites: SATS })
    r.setLayers({ ...BASE, fires: [], aurora: [], events: [...events], satellites: SATS })
    expect(r.canvas.dataset['globeBuilds']).toBe('1')
    r.dispose()
  })

  it('moves satellites in place when only their positions change', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    r.setLayers({ ...BASE, satellites: SATS })
    const before = r.debugNameplates().find((p) => p.name === 'Front')
    r.setLayers({
      ...BASE,
      satellites: SATS.map((s) => ({ ...s, lon: s.lon + 1 })),
    })
    const after = r.debugNameplates().find((p) => p.name === 'Front')
    expect(r.canvas.dataset['globeBuilds']).toBe('1')
    expect(after?.object).toBe(before?.object)
    expect(after?.local.x).not.toBeCloseTo(0.0, 6)
    r.dispose()
  })
})

describe('GlobeRenderer onFrame (#48: one pose source for the a11y overlay)', () => {
  const LAYERS = {
    iss: null,
    trail: [],
    events: [
      { lat: 0, lon: 12, kind: 'wildfires' }, // faces the camera at start (12°E)
      { lat: 0, lon: -168, kind: 'floods' }, // the far side
    ],
    quakes: [{ lat: 5, lon: 20, mag: 5.5, place: 'near' }],
    fires: [],
    fireballs: [],
    launches: [],
    disasters: [],
    satellites: [],
    aurora: [],
    tracking: false,
  }

  it('reports every focusable item after each render, in canvas pixels, with limb visibility', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const frames: { layer: string; index: number; x: number; y: number; visible: boolean }[][] = []
    r.setOnFrame((items) => frames.push([...items]))
    r.setLayers(LAYERS)
    r.attach(document.createElement('div'))
    f.tick(16)

    const last = frames.at(-1) ?? []
    expect(last.map((i) => `${i.layer}:${String(i.index)}`)).toEqual([
      'events:0',
      'events:1',
      'quakes:0',
    ])
    const [front, back, quake] = last
    expect(front?.visible).toBe(true)
    expect(back?.visible).toBe(false)
    expect(quake?.visible).toBe(true)
    // The point facing the camera projects to the canvas centre
    expect(front?.x).toBeCloseTo(230, 0)
    expect(front?.y).toBeCloseTo(230, 0)
    r.dispose()
  })

  it('resize() changes the drawing size and the projection, without a new context (#63)', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const frames: { x: number; y: number }[][] = []
    r.setOnFrame((items) => frames.push(items.map((i) => ({ x: i.x, y: i.y }))))
    r.setLayers(LAYERS)
    r.attach(document.createElement('div'))
    r.resize(680)
    f.tick(16)
    expect(f.renderer.setSize).toHaveBeenLastCalledWith(680, 680, false)
    // The point facing the camera now projects to the centre of the larger canvas.
    expect(frames.at(-1)?.[0]?.x).toBeCloseTo(340, 0)
    expect(frames.at(-1)?.[0]?.y).toBeCloseTo(340, 0)
    expect(f.renderer.dispose).not.toHaveBeenCalled()
    r.dispose()
  })

  it('moves the reported positions as the globe rotates, and holds them while paused', async () => {
    const f = fakes()
    const r = await GlobeRenderer.create(OPTIONS, f.deps)
    const xs: number[] = []
    r.setOnFrame((items) => xs.push(items[0]?.x ?? NaN))
    r.setLayers(LAYERS)
    r.attach(document.createElement('div'))
    f.tick(0)
    f.tick(2000)
    expect(xs.at(-1)).not.toBeCloseTo(xs[0] ?? 0, 0)
    r.setRotationPaused(true)
    const held = xs.at(-1)
    f.tick(4000)
    expect(xs.at(-1)).toBeCloseTo(held ?? NaN, 6)
    r.dispose()
  })
})
