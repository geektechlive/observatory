/**
 * Label crowding left over from #93, fixed in #92: in the Heliosphere view "Mars" and
 * "Venus" ran together as one phrase, "Sun" sat on Saturn's dot, and on a phone "Parker
 * Solar Probe" ran off the stage's right edge.
 */
import { describe, expect, it } from 'vitest'

import { layoutLabels } from '@/components/orrery/labelLayout'

const CHAR_PX = 7
const OFFSET_X = 8
/** A placed label's left and right edges, px, as the page draws it. */
function edges(c: { x: number; text: string }, p: { dx?: number } | undefined) {
  const l = c.x + (p?.dx ?? 0) + OFFSET_X
  return { l, r: l + c.text.length * CHAR_PX }
}

describe('label crowding (#92)', () => {
  it('keeps a visible gap between two labels on one line', () => {
    const mars = { key: 'Mars', text: 'Mars', x: 100, y: 200, visible: true }
    // Venus's label would start right where Mars's ends.
    const venus = {
      key: 'Venus',
      text: 'Venus',
      x: 100 + OFFSET_X + 4 * CHAR_PX - OFFSET_X + 5,
      y: 200,
      visible: true,
    }
    const shown = layoutLabels([mars, venus])
    const a = edges(mars, shown.get('Mars'))
    const b = edges(venus, shown.get('Venus'))
    const sameLine = (shown.get('Venus')?.dy ?? 0) === (shown.get('Mars')?.dy ?? 0)
    if (sameLine) expect(b.l - a.r).toBeGreaterThanOrEqual(8)
    else expect(shown.get('Venus')).toBeDefined()
  })

  it("keeps a planet's label off another planet's dot", () => {
    const sun = { key: 'Sun', text: 'Sun', x: 110, y: 200, visible: true }
    const saturnDot = { key: 'Saturn', x: 128, y: 200, r: 6 }
    const shown = layoutLabels([sun], [saturnDot])
    const p = shown.get('Sun')
    expect(p).toBeDefined()
    const { l, r } = edges(sun, p)
    const onDot =
      (p?.dy ?? 0) === 0 && l < saturnDot.x + saturnDot.r && r > saturnDot.x - saturnDot.r
    expect(onDot).toBe(false)
  })

  it('still shows a home label (Earth, the Sun): a farther rung, or over a dot', () => {
    // Dots under every stacked slot to the right.
    const dots = [0, -18, 18, -36, 36].map((dy, i) => ({
      key: `d${String(i)}`,
      x: 130,
      y: 200 + dy,
      r: 5,
    }))
    const earth = { key: 'Earth', text: 'Earth', x: 110, y: 200, visible: true }
    // The left side is taken too (#127 added the left slots for a crowd on the right).
    const leftTaken = [{ l: 0, r: 110, t: 0, b: 400 }]
    expect(layoutLabels([earth], dots, leftTaken).has('Earth')).toBe(false)
    // A free rung farther out first; over a dot only if none.
    expect(layoutLabels([{ ...earth, priority: true }], dots, leftTaken).get('Earth')?.dy).toBe(-54)
    // With the left free, it sits there, beside its body, before a farther rung (#127).
    expect(layoutLabels([{ ...earth, priority: true }], dots).get('Earth')?.side).toBe('left')
  })

  it('never treats a body’s own disc as in the way', () => {
    const shown = layoutLabels(
      [{ key: 'Jupiter', text: 'Jupiter', x: 210, y: 200, visible: true }],
      [{ key: 'Jupiter', x: 200, y: 200, r: 10 }],
    )
    expect(shown.get('Jupiter')).toEqual({ dy: 0 })
  })

  it('moves a label that would run off the right edge to the left of its body', () => {
    const parker = {
      key: 'naif:-96',
      text: 'Parker Solar Probe',
      x: 300,
      y: 200,
      reach: 3,
      visible: true,
    }
    const shown = layoutLabels([parker], [], [], { width: 390, height: 600 })
    const p = shown.get('naif:-96')
    expect(p).toBeDefined()
    const { l, r } = edges(parker, p)
    expect(r).toBeLessThanOrEqual(390)
    expect(l).toBeGreaterThanOrEqual(0)
    // Left of the body, clear of its dot.
    expect(r).toBeLessThanOrEqual(parker.x - 2 * parker.reach)
    expect(p?.side).toBe('left')
  })
})
