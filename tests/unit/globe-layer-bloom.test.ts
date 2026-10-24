/**
 * What may glow (#50, spec section 5): the ISS, aurora, city lights and active hazards.
 * Copper never glows, and neither do glyphs or nameplates: bloom would smear their
 * void halo (Codex finding 13) and the 11px names. High tier marks a small emissive
 * core per hazard on the bloom layer; low tier draws an additive sprite instead.
 */
import { AdditiveBlending, Layers, Mesh, type Object3D, Points, Sprite } from 'three'
import { describe, expect, it } from 'vitest'

import { BLOOM_LAYER, GlobeLayerObjects } from '@/components/globe/three/layers'
import { planLayers } from '@/lib/globeLayers'

const EMPTY = {
  iss: null,
  trail: [],
  events: [],
  quakes: [],
  fires: [],
  fireballs: [],
  launches: [],
  disasters: [],
  satellites: [],
  aurora: [],
  tracking: false,
}

const PLAN = planLayers({
  ...EMPTY,
  iss: { lat: 0, lon: 0, alt: 420 },
  events: [{ lat: 10, lon: 20, kind: 'wildfires' }],
  disasters: [
    { lat: 1, lon: 1, type: 'FL', alert: 'Green', name: 'quiet' },
    { lat: 2, lon: 2, type: 'TC', alert: 'Red', name: 'storm' },
  ],
  quakes: [{ lat: 30, lon: 40, mag: 6.2, place: 'x' }],
  launches: [{ lat: 28, lon: -80, name: 'pad' }],
  satellites: [{ name: 'Hubble', lat: 5, lon: 5, alt: 540 }],
  aurora: [
    [0, 70, 20],
    [1, 70, 12],
  ],
})

const bloomOnly = new Layers()
bloomOnly.set(BLOOM_LAYER)
const mainOnly = new Layers()

function build(bloom: boolean): GlobeLayerObjects {
  const objects = new GlobeLayerObjects({ bloom })
  objects.buildStatic(PLAN)
  objects.updateIss(PLAN)
  return objects
}

function all(objects: GlobeLayerObjects): Object3D[] {
  const out: Object3D[] = []
  objects.group.traverse((o) => out.push(o))
  return out
}

const drawsIn = (o: Object3D, layers: Layers) => o.layers.test(layers)

describe('GlobeLayerObjects bloom set, high tier', () => {
  const objects = build(true)
  const inBloom = all(objects).filter(
    (o) =>
      (o instanceof Mesh || o instanceof Sprite || o instanceof Points) && drawsIn(o, bloomOnly),
  )

  it('never puts a sprite (glyph, nameplate or name glow) on the bloom layer', () => {
    expect(inBloom.filter((o) => o instanceof Sprite)).toEqual([])
  })

  it('blooms one emissive core per active hazard, drawn only in the bloom pass', () => {
    const cores = objects.debugHazardCores()
    // Event + red GDACS + M6.2 quake; the green alert and the launch pad do not glow.
    expect(cores).toHaveLength(3)
    for (const core of cores) {
      expect(drawsIn(core, bloomOnly)).toBe(true)
      expect(drawsIn(core, mainOnly)).toBe(false)
    }
  })

  it('blooms the ISS core but not its name or its sprite glow', () => {
    const iss = objects.debugIss()
    expect(iss?.core && drawsIn(iss.core, bloomOnly)).toBe(true)
    expect(iss?.core && drawsIn(iss.core, mainOnly)).toBe(true)
    for (const s of iss?.sprites ?? []) expect(drawsIn(s, bloomOnly)).toBe(false)
  })

  it('draws the aurora field in both passes, as one shell mesh, not a point cloud', () => {
    const field = objects.debugAuroraField()
    expect(field).toBeInstanceOf(Mesh)
    expect(field && drawsIn(field, mainOnly)).toBe(true)
    expect(field && drawsIn(field, bloomOnly)).toBe(true)
    expect(all(objects).filter((o) => o instanceof Points)).toEqual([])
  })

  it('adds no hazard glow sprites: bloom replaces them', () => {
    expect(objects.debugHazardSprites()).toEqual([])
  })
})

describe('GlobeLayerObjects bloom set, low tier (sprites, owner default for phones)', () => {
  const objects = build(false)

  it('draws an additive glow sprite at each active hazard instead of a core', () => {
    expect(objects.debugHazardCores()).toEqual([])
    const sprites = objects.debugHazardSprites()
    expect(sprites).toHaveLength(3)
    for (const s of sprites) {
      expect(s.material.blending).toBe(AdditiveBlending)
      expect(drawsIn(s, mainOnly)).toBe(true)
    }
  })
})

describe('GlobeLayerObjects aurora time', () => {
  it('passes time to the field shader', () => {
    const objects = build(false)
    objects.setTime(12.5)
    expect(objects.debugAuroraTime()).toBe(12.5)
  })
})
