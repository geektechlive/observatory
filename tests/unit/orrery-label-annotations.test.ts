/**
 * The stage's annotations keep off bodies (#253, #254).
 * - #253: in the Sun preset the Sun's label sat on its bright limb. The label was placed at
 *   the sphere's radius, but the live SUVI image draws the disc and its corona wider, and
 *   lifted toward the camera; the Sun's reach is now what is drawn.
 * - #254: an off-screen craft marker that had to step in off a full rim landed on the Sun's
 *   disc (390 px), and the heliopause note ran through Jupiter's and Juno's labels (768 px).
 */
import { describe, expect, it } from 'vitest'

import { layoutStage, rimBox, type RimMarker } from '@/components/orrery/labelLayout'
import { sunDrawnReach, SUVI_FRAME } from '@/lib/orrery/suvi'

const overlaps = (
  a: { l: number; r: number; t: number; b: number },
  b: { l: number; r: number; t: number; b: number },
) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

describe("the Sun's drawn reach (#253)", () => {
  it('is wider than the sphere: the corona, past the disc', () => {
    const reach = sunDrawnReach(1, 100)
    // The disc fills discRadius / crop of the sprite's half-width; the corona reaches past it.
    expect(reach.radius).toBeGreaterThan(1.2)
    expect(reach.radius).toBeLessThan(SUVI_FRAME.crop / SUVI_FRAME.discRadius)
  })

  it('is drawn nearer the camera than the centre, so it projects larger close up', () => {
    const reach = sunDrawnReach(1, 4)
    expect(reach.depth).toBeLessThan(4)
    expect(reach.depth).toBeGreaterThan(2.5)
  })

  it('never puts the drawn image behind the camera', () => {
    expect(sunDrawnReach(1, 0.5).depth).toBeGreaterThan(0)
  })
})

describe('rim markers keep off discs (#254)', () => {
  const stage = { width: 390, height: 600 }
  const rimSpan = { left: 14, right: 376, top: 14, bottom: 560 }
  const voyager: RimMarker = {
    key: 'voyager-2',
    text: 'Voyager 2 · 144 au',
    x: 195,
    y: 560,
    alongX: true,
    edge: 'bottom',
  }
  // The bottom rim is full (the time bar), so the marker steps in, towards the Sun.
  const bar = { l: 0, r: 390, t: 548, b: 600 }

  it('steps in past a disc rather than onto it', () => {
    const sun = { key: 'Sun', x: 195, y: 532, r: 40 }
    const placed = layoutStage({
      rim: [voyager],
      rimSpan,
      labels: [],
      discs: [sun],
      furniture: [bar],
      bounds: stage,
    })
    const p = placed.rim.get('voyager-2')
    expect(p).toBeDefined()
    const disc = { l: sun.x - sun.r, r: sun.x + sun.r, t: sun.y - sun.r, b: sun.y + sun.r }
    expect(overlaps(rimBox(voyager, p ?? { x: 0, y: 0 }), disc)).toBe(false)
  })

  it('stays on its rim when a close-up disc fills the stage (no free spot off it)', () => {
    const jupiter = { key: 'Jupiter', x: 195, y: 300, r: 2000 }
    const placed = layoutStage({
      rim: [voyager],
      rimSpan,
      labels: [],
      discs: [jupiter],
      furniture: [],
      bounds: stage,
    })
    expect(placed.rim.get('voyager-2')?.y).toBe(560)
  })
})

describe('the heliopause note (#254)', () => {
  const stage = { width: 768, height: 900 }
  const rimSpan = { left: 14, right: 754, top: 14, bottom: 860 }
  const note = { key: 'heliopause', text: 'Heliopause ≈ 122 au · approx.', x: 100, y: 400 }

  it('moves off a label it would run through', () => {
    const placed = layoutStage({
      rim: [],
      rimSpan,
      labels: [{ key: 'Jupiter', text: 'Jupiter', x: 180, y: 400, visible: true }],
      discs: [],
      furniture: [],
      bounds: stage,
      note,
    })
    const jupiter = placed.labels.get('Jupiter')
    const p = placed.labels.get('heliopause')
    expect(jupiter).toEqual({ dy: 0 })
    expect(p).toBeDefined()
    expect(p?.dy ?? 0).not.toBe(0)
  })

  it('stays where it is when nothing is in the way', () => {
    const placed = layoutStage({
      rim: [],
      rimSpan,
      labels: [],
      discs: [],
      furniture: [],
      bounds: stage,
      note,
    })
    expect(placed.labels.get('heliopause')).toEqual({ dy: 0 })
  })

  it('hides rather than cover a body', () => {
    const placed = layoutStage({
      rim: [],
      rimSpan,
      labels: [],
      discs: [{ key: 'Sun', x: 250, y: 400, r: 120 }],
      furniture: [],
      bounds: stage,
      note,
    })
    expect(placed.labels.has('heliopause')).toBe(false)
  })
})
