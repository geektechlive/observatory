/**
 * The focused craft's model never draws bigger than the Sun (#204): 0.9 x the Sun's drawn
 * radius, held between the craft icon's radius and 100 px.
 */
import { describe, expect, it } from 'vitest'

import { bodyMinPx } from '@/components/orrery/three/bodyMinPx'
import { CRAFT_ICON_PX } from '@/components/orrery/three/craftLayer'
import { craftModelPx } from '@/components/orrery/three/pxClamp'

describe('craftModelPx', () => {
  it('stays under the Sun even at the Sun’s floor, in every mode', () => {
    for (const mode of ['exaggerated', 'log', 'proportional'] as const) {
      const sun = bodyMinPx('Sun', mode)
      expect(craftModelPx(sun)).toBeLessThanOrEqual(sun)
    }
  })

  it('takes 0.9 of the Sun’s radius when that is in range', () => {
    expect(craftModelPx(40)).toBeCloseTo(36, 9)
  })

  it('never goes below the craft icon radius', () => {
    expect(craftModelPx(10)).toBe(CRAFT_ICON_PX / 2)
    expect(craftModelPx(0)).toBe(CRAFT_ICON_PX / 2)
  })

  it('never goes above 100 px', () => {
    expect(craftModelPx(500)).toBe(100)
    expect(craftModelPx(Infinity)).toBe(100)
  })

  it('falls to the floor for input that is not a number', () => {
    expect(craftModelPx(NaN)).toBe(CRAFT_ICON_PX / 2)
    expect(craftModelPx(-Infinity)).toBe(CRAFT_ICON_PX / 2)
  })
})
