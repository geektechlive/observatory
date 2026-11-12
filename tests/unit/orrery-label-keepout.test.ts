/**
 * Keep-out zones for the orrery's rim markers and labels (#160, #132, #127, #131).
 * - #160: the NOT TO SCALE badge covered Voyager 1's rim marker; spreadRim knew only the
 *   time bar and the other markers.
 * - #132: labels sat on rim markers ("2026 VP1" against New Horizons'), and markers sat
 *   under the Controls button and the inspector.
 */
import { describe, expect, it } from 'vitest'

import {
  ASTEROID_LABELS_SMALL_STAGE,
  asteroidLabelKeys,
  farBeyondFocus,
  layoutLabels,
  layoutStage,
  panelInset,
  rimBox,
  type RimMarker,
  spreadRim,
} from '@/components/orrery/labelLayout'

type Box = { l: number; r: number; t: number; b: number }
const overlaps = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

describe('rim markers keep off the stage furniture (#160)', () => {
  // A 1440 px stage: the badge sits in its top-right corner.
  const badge = { l: 1250, r: 1378, t: 12, b: 36 }
  const span = { left: 14, right: 1376, top: 14, bottom: 640 }

  it('slides a top-rim marker off the NOT TO SCALE badge', () => {
    const v1: RimMarker = {
      key: 'v1',
      text: 'Voyager 1 · 172 au',
      x: 1300,
      y: 14,
      alongX: true,
      edge: 'top',
    }
    const out = spreadRim([v1], span, [badge])
    const p = out.get('v1')
    expect(p).toBeDefined()
    expect(overlaps(rimBox(v1, p ?? v1), badge)).toBe(false)
    // Still on the top rim.
    expect(p?.y).toBe(14)
  })

  it('anchors a right-rim marker at its edge: its box runs leftwards', () => {
    const m: RimMarker = {
      key: 'a',
      text: 'Voyager 2 · 144 au',
      x: 376,
      y: 300,
      alongX: false,
      edge: 'right',
    }
    const box = rimBox(m, m)
    expect(box.r).toBe(376)
    expect(box.l).toBeLessThan(376 - 100)
  })

  it('slides a side-rim marker off an obstacle without leaving the rim', () => {
    // The guide chip on a phone, over the right rim near the bottom.
    const chip = { l: 24, r: 300, t: 540, b: 600 }
    const m: RimMarker = {
      key: 'v2',
      text: 'Voyager 2 · 144 au',
      x: 376,
      y: 580,
      alongX: false,
      edge: 'right',
      widthPx: 150,
    }
    const out = spreadRim([m], { left: 14, right: 376, top: 14, bottom: 610 }, [chip])
    const p = out.get('v2')
    expect(p).toBeDefined()
    const box = rimBox(m, p ?? m)
    expect(overlaps(box, chip)).toBe(false)
    expect(box.b).toBeLessThanOrEqual(610)
    expect(box.t).toBeGreaterThanOrEqual(14)
  })

  it('uses a measured width when it is wider than the estimate', () => {
    const m: RimMarker = {
      key: 'a',
      text: 'ab',
      x: 200,
      y: 14,
      alongX: true,
      edge: 'top',
      widthPx: 300,
    }
    const box = rimBox(m, m)
    expect(box.r - box.l).toBe(300)
  })

  it('keeps two side-rim markers apart inside a short rim', () => {
    const a: RimMarker = {
      key: 'a',
      text: 'Voyager 2 · 144 au',
      x: 376,
      y: 600,
      alongX: false,
      edge: 'right',
    }
    const b: RimMarker = {
      key: 'b',
      text: 'New Horizons · 66 au',
      x: 376,
      y: 600,
      alongX: false,
      edge: 'right',
    }
    const out = spreadRim([a, b], { left: 14, right: 376, top: 14, bottom: 610 })
    const pa = out.get('a') ?? a
    const pb = out.get('b') ?? b
    expect(overlaps(rimBox(a, pa), rimBox(b, pb))).toBe(false)
    expect(rimBox(b, pb).b).toBeLessThanOrEqual(610)
  })
})

describe('labels keep off the rim markers, and the rim off the inspector (#132)', () => {
  const bounds = { width: 390, height: 600 }

  it("moves a label off a rim marker's box instead of sitting on it", () => {
    // New Horizons' marker on the right rim; an asteroid's label would run into it.
    const nh: RimMarker = {
      key: 'nh',
      text: 'New Horizons · 66 au',
      x: 376,
      y: 100,
      alongX: false,
      edge: 'right',
    }
    const out = layoutStage({
      rim: [nh],
      rimSpan: { left: 14, right: 376, top: 14, bottom: 586 },
      labels: [{ key: 'vp1', text: '2026 VP1', x: 280, y: 100, visible: true }],
      discs: [],
      furniture: [],
      bounds,
    })
    const marker = out.rim.get('nh')
    const p = out.labels.get('vp1')
    expect(marker).toBeDefined()
    if (p && marker) {
      // The label's box as layoutLabels sees it (x + dx + 8, width 7 px a character).
      const l = 280 + (p.dx ?? 0) + 8
      const label = { l, r: l + 8 * 7, t: 100 + p.dy - 8, b: 100 + p.dy + 8 }
      expect(overlaps(label, marker.box)).toBe(false)
    }
  })

  it('keeps a rim marker off the Controls button', () => {
    const controls = { l: 8, r: 92, t: 8, b: 40 }
    const v1: RimMarker = {
      key: 'v1',
      text: 'Voyager 1 · 172 au',
      x: 14,
      y: 24,
      alongX: false,
      edge: 'left',
    }
    const out = layoutStage({
      rim: [v1],
      rimSpan: { left: 14, right: 376, top: 14, bottom: 586 },
      labels: [],
      discs: [],
      furniture: [controls],
      bounds,
    })
    expect(overlaps(out.rim.get('v1')?.box ?? rimBox(v1, v1), controls)).toBe(false)
  })

  it('steps in from the rim when furniture fills the whole of it (a phone’s top row)', () => {
    // Controls, Guide and the badge across a 390 px stage's top.
    const row = [
      { l: 12, r: 96, t: 8, b: 40 },
      { l: 108, r: 170, t: 8, b: 40 },
      { l: 228, r: 378, t: 8, b: 36 },
    ]
    const v1: RimMarker = {
      key: 'v1',
      text: 'Voyager 1 · 172 au',
      x: 200,
      y: 14,
      alongX: true,
      edge: 'top',
    }
    const out = layoutStage({
      rim: [v1],
      rimSpan: { left: 14, right: 376, top: 14, bottom: 586 },
      labels: [],
      discs: [],
      furniture: row,
      bounds,
    })
    const box = out.rim.get('v1')?.box ?? rimBox(v1, v1)
    for (const f of row) expect(overlaps(box, f)).toBe(false)
    // Just below the row, not far down the stage.
    expect(box.t).toBeLessThan(80)
  })

  it('lets a label beside its body win over a marker that had to leave its rim', () => {
    // The top row is full, so Voyager 1 must step in; Europa's label sits just below it.
    const row = [{ l: 0, r: 390, t: 0, b: 40 }]
    const v1: RimMarker = {
      key: 'v1',
      text: 'Voyager 1 · 172 au',
      x: 200,
      y: 14,
      alongX: true,
      edge: 'top',
    }
    const europa = { key: 'europa', text: 'Europa', x: 180, y: 58, visible: true }
    const out = layoutStage({
      rim: [v1],
      rimSpan: { left: 14, right: 376, top: 14, bottom: 586 },
      labels: [europa],
      discs: [],
      furniture: row,
      bounds,
    })
    expect(out.labels.get('europa')).toEqual({ dy: 0 })
    const marker = out.rim.get('v1')
    if (marker) {
      const label = { l: 188 - 5, r: 188 + 42 + 5, t: 58 - 10, b: 58 + 10 }
      expect(overlaps(marker.box, label)).toBe(false)
    }
  })

  it('leaves out a marker with no room anywhere near its rim', () => {
    const everything = [{ l: 0, r: 390, t: 0, b: 600 }]
    const v1: RimMarker = { key: 'v1', text: 'V1', x: 200, y: 14, alongX: true, edge: 'top' }
    const out = layoutStage({
      rim: [v1],
      rimSpan: { left: 14, right: 376, top: 14, bottom: 586 },
      labels: [],
      discs: [],
      furniture: everything,
      bounds,
    })
    expect(out.rim.has('v1')).toBe(false)
  })

  it('reads the inspector as a drawer on the right on wide stages', () => {
    expect(panelInset({ width: 1000, height: 700 }, { l: 640, r: 990, t: 10, b: 690 })).toEqual({
      right: 360,
      bottom: 0,
    })
  })

  it('reads the inspector as a sheet along the bottom on a phone', () => {
    expect(panelInset({ width: 390, height: 600 }, { l: 4, r: 386, t: 380, b: 600 })).toEqual({
      right: 0,
      bottom: 220,
    })
  })

  it('reads no inspector as no inset', () => {
    expect(panelInset({ width: 390, height: 600 }, null)).toEqual({ right: 0, bottom: 0 })
  })
})

describe('sideways slots for crowded clusters (#127)', () => {
  // Jupiter's view on a 390 px phone, as the real-GPU probe measured it: Callisto sits
  // left of Jupiter's disc, so every slot to its right lands on the disc or a label.
  const jupiter = { key: 'Jupiter', x: 195, y: 375, r: 28 }
  const moon = (key: string, x: number, y: number) => ({
    key,
    text: key,
    x: x + 3,
    y,
    visible: true,
    avoidDiscs: true,
    reach: 3,
  })
  const items = [
    { key: 'Jupiter', text: 'Jupiter', x: 223, y: 375, visible: true, priority: true, reach: 28 },
    moon('Io', 238, 397),
    moon('Europa', 275, 350),
    moon('Ganymede', 250, 399),
    moon('Callisto', 150, 397),
  ]

  it('labels all four moons around one planet on a phone-sized stage', () => {
    const shown = layoutLabels(items, [jupiter], [], { width: 390, height: 600 })
    for (const key of ['Jupiter', 'Io', 'Europa', 'Ganymede', 'Callisto']) {
      expect(shown.has(key), key).toBe(true)
    }
  })

  it('puts a crowded label on the left of its body, and says so for the leader', () => {
    const shown = layoutLabels(items, [jupiter], [], { width: 390, height: 600 })
    const callisto = shown.get('Callisto')
    expect(callisto?.side).toBe('left')
    // It ends short of its own dot.
    const width = 'Callisto'.length * 7
    expect(153 + (callisto?.dx ?? 0) + 8 + width).toBeLessThanOrEqual(150 - 3)
  })

  it('still prefers the right side when it is free', () => {
    const shown = layoutLabels([moon('Callisto', 150, 397)], [], [], { width: 390, height: 600 })
    expect(shown.get('Callisto')).toEqual({ dy: 0 })
  })
})

describe('the planets keep their names in a tight cluster (#131)', () => {
  // The Heliosphere view at 1280 x 720: the inner planets sit within a few px of the Sun,
  // so the near slots on both sides go to the Sun's, Venus's and Earth's labels.
  const bounds = { width: 800, height: 500 }
  const taken = [
    { l: 300, r: 500, t: 182, b: 218 }, // the near slots, both sides: rows -36..+36
    { l: 300, r: 500, t: 158, b: 182 },
    { l: 300, r: 500, t: 218, b: 242 },
  ]
  const mars = { key: 'Mars', text: 'Mars', x: 400, y: 200, visible: true, reach: 2 }

  it('gives a planet the farther rungs, with a leader, before it hides', () => {
    expect(layoutLabels([mars], [], taken, bounds).has('Mars')).toBe(false)
    const p = layoutLabels([{ ...mars, farRungs: true }], [], taken, bounds).get('Mars')
    expect(p).toBeDefined()
    expect(Math.abs(p?.dy ?? 0)).toBeGreaterThanOrEqual(54)
  })

  it('never puts a planet over another body’s dot to make room', () => {
    const dots = [-54, 54, -72, 72].flatMap((dy) => [
      { key: `r${String(dy)}`, x: 420, y: 200 + dy, r: 4 },
      { key: `l${String(dy)}`, x: 380, y: 200 + dy, r: 4 },
    ])
    expect(layoutLabels([{ ...mars, farRungs: true }], dots, taken, bounds).has('Mars')).toBe(false)
  })
})

describe('asteroid labels on a small stage (#130)', () => {
  // 25 close approaches in the Earth–Moon view; three hazardous.
  const approaches = Array.from({ length: 25 }, (_, i) => ({
    key: `sb:${String(i)}`,
    pha: i === 20 || i === 21 || i === 22,
    distAu: 0.001 * (i + 1),
  }))

  it('keeps every label on a wide stage', () => {
    expect(asteroidLabelKeys(approaches, null, 1440).size).toBe(25)
  })

  it('ranks hazardous first, then the closest, and caps them on a phone', () => {
    const keys = asteroidLabelKeys(approaches, null, 390)
    expect(keys.size).toBe(ASTEROID_LABELS_SMALL_STAGE)
    expect([...keys]).toEqual([
      'sb:20',
      'sb:21',
      'sb:22',
      ...approaches.slice(0, ASTEROID_LABELS_SMALL_STAGE - 3).map((a) => a.key),
    ])
  })

  it('never drops the selected one', () => {
    const keys = asteroidLabelKeys(approaches, 'sb:24', 390)
    expect(keys.has('sb:24')).toBe(true)
  })
})

describe('a craft far beyond the focus says how far (#126)', () => {
  // Camera depths measured in the real orrery (scene units), 2026-11-11.
  it('marks Voyager 2 in Parker’s close-up as far', () => {
    expect(farBeyondFocus(20.43, 4.0)).toBe(true)
  })

  it('leaves Venus, Solar Orbiter and the Jovian moons as near', () => {
    expect(farBeyondFocus(3.05, 4.0)).toBe(false)
    expect(farBeyondFocus(2.58, 4.0)).toBe(false)
    expect(farBeyondFocus(3.89, 3.6)).toBe(false)
  })

  it('marks nothing when there is no focus', () => {
    expect(farBeyondFocus(20, undefined)).toBe(false)
    expect(farBeyondFocus(20, 0)).toBe(false)
  })
})

describe('labels hold their slot while the camera moves (#132 review)', () => {
  const bounds = { width: 800, height: 600 }
  // Mars's label in the default slot meets a neighbour's label box just at its edge.
  const neighbour = (y: number) => [{ l: 400, r: 480, t: y - 10, b: y + 10 }]
  const mars = (dx: number, dy: number) => ({
    key: 'Mars',
    text: 'Mars',
    x: 400 + dx,
    y: 200 + dy,
    visible: true,
  })

  it('keeps last frame’s slot when it is still free, though the default has come free', () => {
    const first = layoutStage({
      rim: [],
      rimSpan: { left: 0, right: 800 },
      labels: [mars(0, 0)],
      discs: [],
      furniture: neighbour(200),
      bounds,
    })
    const was = first.labels.get('Mars')
    expect(was?.dy).not.toBe(0)
    // One frame later the camera has moved a little and the neighbour has slid clear.
    const next = layoutStage({
      rim: [],
      rimSpan: { left: 0, right: 800 },
      labels: [mars(1, 1)],
      discs: [],
      furniture: neighbour(240),
      bounds,
      previous: first.labels,
    })
    expect(next.labels.get('Mars')).toEqual(was)
  })

  it('takes the best free slot again once last frame’s slot is taken', () => {
    const was = { dy: -18 }
    const next = layoutStage({
      rim: [],
      rimSpan: { left: 0, right: 800 },
      labels: [mars(0, 0)],
      discs: [],
      furniture: neighbour(165),
      bounds,
      previous: new Map([['Mars', was]]),
    })
    expect(next.labels.get('Mars')?.dy).toBe(0)
  })
})
