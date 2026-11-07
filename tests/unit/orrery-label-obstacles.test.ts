/**
 * Label obstacles (#118) and Saturn's ring reach (#119).
 * - On a phone, Ganymede's label collided with the NOT TO SCALE badge and was hidden; a
 *   badge is now an obstacle labels move around.
 * - Saturn's label was placed at its globe's edge and sat on its rings; its reach is now
 *   the rings' outer edge.
 */
import { describe, expect, it } from 'vitest'

import { bodyLabelReach, layoutLabels } from '@/components/orrery/labelLayout'
import { SATURN_RINGS } from '@/lib/orrery/imagery'

describe('obstacles (#118)', () => {
  // A badge in the stage's top-right corner, like NOT TO SCALE.
  const badge = { l: 280, r: 380, t: 8, b: 32 }

  it('moves a label off a badge, and stays on the stage, instead of hiding it', () => {
    const shown = layoutLabels(
      [{ key: 'Ganymede', text: 'Ganymede', x: 270, y: 20, visible: true, avoidDiscs: true }],
      [],
      [badge],
      { width: 390, height: 600 },
    )
    const p = shown.get('Ganymede')
    expect(p).toBeDefined()
    // Its box (x + 8 .. + 56 + 2, y + dy ± 10) no longer meets the badge.
    const top = 20 + (p?.dy ?? 0) - 10
    expect(top).toBeGreaterThanOrEqual(badge.b)
  })

  it('never places a label above the stage (the slot above was off-screen)', () => {
    const shown = layoutLabels([{ key: 'Io', text: 'Io', x: 100, y: 4, visible: true }], [], [], {
      width: 390,
      height: 600,
    })
    expect(4 + (shown.get('Io')?.dy ?? -99) - 10).toBeGreaterThanOrEqual(0)
  })

  it('places labels exactly as before when there is no obstacle', () => {
    const items = [{ key: 'Io', text: 'Io', x: 100, y: 100, visible: true }]
    expect(layoutLabels(items, [], [])).toEqual(layoutLabels(items))
  })
})

describe('bodyLabelReach (#119)', () => {
  it("is Saturn's ring outer radius, not its globe's", () => {
    const ratio = SATURN_RINGS.outerKm / SATURN_RINGS.saturnRadiusKm
    expect(bodyLabelReach('Saturn', 40)).toBeCloseTo(40 * ratio, 9)
  })

  it('is the drawn radius for every other body', () => {
    for (const name of ['Jupiter', 'Earth', 'Sun', 'naif:-31', 'moon:501']) {
      expect(bodyLabelReach(name, 25)).toBe(25)
    }
  })
})
