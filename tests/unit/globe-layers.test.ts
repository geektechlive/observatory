/**
 * planLayers (#49): the pure half of the WebGL data layers. Every parity-matrix layer
 * (#44) becomes plain positions, colours, sizes and glyphs, tested here; the three.js
 * half only turns the plan into scene objects.
 */
import { describe, expect, it } from 'vitest'

import { altToRadius, latLonToVec3 } from '@/lib/globe3d'
import { AURORA_SHELL, planLayers } from '@/lib/globeLayers'
import { eonetKind, ISS_HEX, LANES, STATUS_HEX } from '@/lib/palette'

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

const radius = (p: readonly number[]) => Math.hypot(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0)

describe('planLayers', () => {
  it('plans nothing for empty data', () => {
    const plan = planLayers(EMPTY)
    expect(plan.iss).toBeNull()
    expect(plan.markers).toEqual([])
    expect(plan.spikes).toEqual([])
    expect(plan.points).toEqual([])
  })

  it('places the ISS at exaggerated LEO altitude in signal cyan, with its trail at the same radius', () => {
    const plan = planLayers({
      ...EMPTY,
      iss: { lat: 10, lon: 20, alt: 420 },
      trail: [
        [20, 10],
        [25, 12],
      ],
    })
    expect(plan.iss?.color).toBe(ISS_HEX)
    expect(radius(plan.iss?.position ?? [])).toBeCloseTo(altToRadius(420), 9)
    expect(plan.trail).toHaveLength(2)
    for (const p of plan.trail) expect(radius(p)).toBeCloseTo(altToRadius(420), 9)
  })

  it('colours EONET events by their lane and labels them with the kind letter', () => {
    const plan = planLayers({ ...EMPTY, events: [{ lat: 1, lon: 2, kind: 'severeStorms' }] })
    const marker = plan.markers.find((m) => m.layer === 'events')
    expect(marker?.color).toBe(LANES[eonetKind('severeStorms').lane].emit)
    expect(marker?.glyph).toEqual({ shape: 'letter', letter: 'S' })
    expect(marker?.focusIndex).toBe(0)
  })

  it('draws quakes as geophysical spikes whose height grows with magnitude, not colour', () => {
    const plan = planLayers({
      ...EMPTY,
      quakes: [
        { lat: 0, lon: 0, mag: 4.5, place: 'a' },
        { lat: 0, lon: 10, mag: 6.5, place: 'b' },
        { lat: 0, lon: 20, mag: null, place: 'c' },
      ],
    })
    const [small, big, unknown] = plan.spikes
    expect(small?.color).toBe(LANES.geo.emit)
    expect(big?.color).toBe(LANES.geo.emit)
    expect(big?.height ?? 0).toBeGreaterThan(small?.height ?? 0)
    expect(unknown?.height ?? 0).toBeLessThan(small?.height ?? 0)
    expect(plan.spikes.map((s) => s.focusIndex)).toEqual([0, 1, 2])
  })

  it('draws satellites as named spacecraft markers at altitude, in the orbital lane', () => {
    // The feed tracks a couple of named spacecraft, not a constellation: a point cloud
    // made Hubble and Tiangong 3px dots nobody could see. They get the ISS treatment.
    const plan = planLayers({
      ...EMPTY,
      satellites: [{ name: 'Hubble', lat: 0, lon: 0, alt: 540 }],
    })
    expect(plan.points).toEqual([])
    const sat = plan.markers.find((m) => m.layer === 'satellites')
    expect(sat?.color).toBe(LANES.orbital.emit)
    expect(sat?.glyph).toEqual({ shape: 'spacecraft', name: 'Hubble' })
    expect(sat?.label).toBe('Hubble, 540 km')
    expect(radius(sat?.position ?? [])).toBeCloseTo(altToRadius(540), 9)
  })

  it('labels the ISS by name, as the SVG globe does', () => {
    const plan = planLayers({ ...EMPTY, iss: { lat: 10, lon: 20, alt: 420 } })
    expect(plan.iss?.name).toBe('ISS')
  })

  it('sizes fires by radiative power and keeps them in the thermal lane', () => {
    const plan = planLayers({
      ...EMPTY,
      fires: [
        { lat: 0, lon: 0, frp: 5 },
        { lat: 0, lon: 1, frp: 400 },
      ],
    })
    const [weak, strong] = plan.points.filter((p) => p.layer === 'fires')
    expect(weak?.color).toBe(LANES.thermal.emit)
    expect(strong?.size ?? 0).toBeGreaterThan(weak?.size ?? 0)
  })

  it('draws GDACS alerts on the status scale with the hazard diamond', () => {
    const plan = planLayers({
      ...EMPTY,
      disasters: [
        { lat: 0, lon: 0, type: 'EQ', alert: 'Red', name: 'x' },
        { lat: 0, lon: 5, type: 'TC', alert: 'Orange', name: 'y' },
      ],
    })
    const [red, orange] = plan.markers.filter((m) => m.layer === 'disasters')
    expect(red?.color).toBe(STATUS_HEX.hazard)
    expect(orange?.color).toBe(STATUS_HEX.watch)
    expect(red?.glyph).toEqual({ shape: 'diamond' })
  })

  it('gives fireballs the space-objects star and launches the orbital chevron', () => {
    const plan = planLayers({
      ...EMPTY,
      fireballs: [{ lat: 0, lon: 0, energy: 2 }],
      launches: [{ lat: 28.5, lon: -80.6, name: 'LC-39A' }],
    })
    expect(plan.markers.find((m) => m.layer === 'fireballs')).toMatchObject({
      color: LANES.space.emit,
      glyph: { shape: 'star' },
    })
    expect(plan.markers.find((m) => m.layer === 'launches')).toMatchObject({
      color: LANES.orbital.emit,
      glyph: { shape: 'chevron' },
    })
  })

  it('shows DSN stations only in tracking mode', () => {
    expect(planLayers(EMPTY).markers.filter((m) => m.layer === 'stations')).toEqual([])
    const stations = planLayers({ ...EMPTY, tracking: true }).markers.filter(
      (m) => m.layer === 'stations',
    )
    expect(stations.length).toBe(3)
    for (const s of stations) expect(s.color).toBe(ISS_HEX)
  })

  it('turns aurora triplets into a single-hue field just above the surface, OVATION intensity as alpha', () => {
    const plan = planLayers({
      ...EMPTY,
      // Real OVATION values run about 4..29; the old clamp to 0..1 made them all equal.
      aurora: [
        [0, 70, 25],
        [10, 70, 5],
      ],
    })
    const field = plan.points.filter((p) => p.layer === 'aurora')
    expect(field).toHaveLength(2)
    expect(new Set(field.map((f) => f.color)).size).toBe(1)
    expect(field[0]?.alpha ?? 0).toBeGreaterThan(field[1]?.alpha ?? 0)
    expect(radius(field[0]?.position ?? [])).toBeGreaterThan(1)
    expect(field[0]?.position).not.toEqual(latLonToVec3(70, 0, 1))
  })
})

describe('planLayers active-hazard glows (#50)', () => {
  it('glows every open EONET event, GDACS orange and red, and quakes M4.5 and up', () => {
    const plan = planLayers({
      ...EMPTY,
      events: [{ lat: 10, lon: 20, kind: 'wildfires' }],
      disasters: [
        { lat: 1, lon: 1, type: 'FL', alert: 'Green', name: 'quiet' },
        { lat: 2, lon: 2, type: 'TC', alert: 'Orange', name: 'storm' },
        { lat: 3, lon: 3, type: 'EQ', alert: 'Red', name: 'big' },
      ],
      quakes: [
        { lat: 30, lon: 40, mag: 4.4, place: 'small' },
        { lat: 31, lon: 41, mag: 4.5, place: 'watch' },
        { lat: 32, lon: 42, mag: 6.8, place: 'hazard' },
        { lat: 33, lon: 43, mag: null, place: 'unknown' },
      ],
    })
    expect(plan.glows.map((g) => g.layer)).toEqual([
      'events',
      'disasters',
      'disasters',
      'quakes',
      'quakes',
    ])
  })

  it('puts a quake glow at the spike tip, in the spike colour', () => {
    const plan = planLayers({ ...EMPTY, quakes: [{ lat: 0, lon: 0, mag: 6, place: 'x' }] })
    const [glow] = plan.glows
    const [spike] = plan.spikes
    expect(radius(glow?.position ?? [])).toBeCloseTo(1 + (spike?.height ?? 0), 6)
    expect(glow?.color).toBe(spike?.color)
  })

  it('never glows launches, fireballs, fires or spacecraft', () => {
    const plan = planLayers({
      ...EMPTY,
      launches: [{ lat: 28, lon: -80, name: 'pad' }],
      fireballs: [{ lat: 5, lon: 5, energy: 1 }],
      fires: [{ lat: 6, lon: 6, frp: 50 }],
      satellites: [{ name: 'Hubble', lat: 0, lon: 0, alt: 540 }],
    })
    expect(plan.glows).toEqual([])
  })
})

describe('planLayers aurora reach (#77)', () => {
  const line = (lat: number, from: number, to: number): [number, number][] =>
    Array.from({ length: to - from + 1 }, (_, i): [number, number] => [from + i, lat])
  const REACH = {
    likely: { n: line(55, -120, -60), s: line(-62, 100, 140) },
    possible: { n: line(50, -120, -60), s: [] },
  }

  it('draws the likely edge in watch amber, just above the aurora shell, per hemisphere', () => {
    const plan = planLayers({ ...EMPTY, auroraReach: REACH })
    const likely = plan.reach.filter((r) => r.kind === 'likely')
    expect(likely).toHaveLength(2)
    for (const r of plan.reach) {
      expect(r.color).toBe(STATUS_HEX.watch)
      for (const p of r.points) expect(radius(p)).toBeCloseTo(AURORA_SHELL + 0.001, 6)
    }
    expect(likely[0]?.points[0]).toEqual(
      latLonToVec3(55, -120, AURORA_SHELL + 0.001).map((v) => expect.closeTo(v, 9)),
    )
  })

  it('draws the possible edge too, fainter', () => {
    const plan = planLayers({ ...EMPTY, auroraReach: REACH })
    const possible = plan.reach.filter((r) => r.kind === 'possible')
    expect(possible).toHaveLength(1)
    const likelyAlpha = plan.reach.find((r) => r.kind === 'likely')?.alpha ?? 0
    expect(possible[0]?.alpha).toBeLessThan(likelyAlpha)
  })

  it('plans no reach without data', () => {
    expect(planLayers(EMPTY).reach).toEqual([])
  })
})
