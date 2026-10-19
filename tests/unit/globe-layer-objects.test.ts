/**
 * GlobeLayerObjects nameplates (#49). A nameplate is a billboard at the spacecraft's
 * depth, so the Earth's nearer surface clipped the name where the two overlapped
 * ("Hub", "Tia"). Nameplates skip the depth test and are hidden by the ray-sphere
 * occlusion test instead, so one behind the Earth never shows through it.
 */
import { Matrix4, Sprite } from 'three'
import { describe, expect, it } from 'vitest'

import { GlobeLayerObjects } from '@/components/globe/three/layers'
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

describe('GlobeLayerObjects nameplates', () => {
  it('hides a spacecraft nameplate behind the Earth and shows one in front', () => {
    const objects = new GlobeLayerObjects()
    // Unrotated globe, camera on +Z: 90°W is +Z (in front), 90°E is -Z (behind the Earth).
    objects.buildStatic(
      planLayers({
        ...EMPTY,
        satellites: [
          { name: 'Front', lat: 0, lon: -90, alt: 540 },
          { name: 'Back', lat: 0, lon: 90, alt: 540 },
        ],
      }),
    )
    objects.updateOcclusion(new Matrix4(), [0, 0, 4])
    const plates = objects.debugNameplates()
    expect(plates.map((p) => p.name)).toEqual(['Front', 'Back'])
    expect(plates[0]?.object.visible).toBe(true)
    expect(plates[1]?.object.visible).toBe(false)
  })

  it('does not depth-test nameplates (so the Earth cannot clip the name)', () => {
    const objects = new GlobeLayerObjects()
    objects.buildStatic(
      planLayers({ ...EMPTY, satellites: [{ name: 'Hubble', lat: 0, lon: 0, alt: 540 }] }),
    )
    const [plate] = objects.debugNameplates()
    // Read the real materials, not a field that only claims it.
    const sprites: Sprite[] = []
    plate?.object.traverse((o) => {
      if (o instanceof Sprite) sprites.push(o)
    })
    expect(sprites.length).toBe(2)
    for (const s of sprites) expect(s.material.depthTest).toBe(false)
  })

  it('creates nameplates hidden, so a draw before the occlusion test shows nothing (#60)', () => {
    const objects = new GlobeLayerObjects()
    objects.buildStatic(
      planLayers({ ...EMPTY, satellites: [{ name: 'Back', lat: 0, lon: 90, alt: 540 }] }),
    )
    objects.updateIss(planLayers({ ...EMPTY, iss: { lat: 0, lon: 90, alt: 420 } }))
    for (const p of objects.debugNameplates()) expect(p.object.visible).toBe(false)
  })

  it('tracks the ISS nameplate too, and drops it when the ISS goes away', () => {
    const objects = new GlobeLayerObjects()
    objects.updateIss(planLayers({ ...EMPTY, iss: { lat: 0, lon: 90, alt: 420 } }))
    objects.updateOcclusion(new Matrix4(), [0, 0, 4])
    expect(objects.debugNameplates().map((p) => [p.name, p.object.visible])).toEqual([
      ['ISS', false],
    ])
    objects.updateIss(planLayers(EMPTY))
    expect(objects.debugNameplates()).toEqual([])
  })
})
