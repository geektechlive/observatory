/**
 * The focused craft's model in the orrery is icon-sized (#260): the craft icon's radius at any
 * zoom, like the Voyagers' icons in Heliosphere, so it never reads as the Sun's twin. Seeing
 * the craft up close is the close-up's job. The satellite models keep the old Sun-share rule
 * (ADR 0030), now `sunShareModelPx`.
 */
import { describe, expect, it } from 'vitest'

import { bodyMinPx } from '@/components/orrery/three/bodyMinPx'
import { CRAFT_ICON_PX } from '@/components/orrery/three/craftLayer'
import { CRAFT_MODEL_PX, sunShareModelPx } from '@/components/orrery/three/pxClamp'

describe('CRAFT_MODEL_PX (#260)', () => {
  it('is the craft icon’s radius', () => {
    expect(CRAFT_MODEL_PX).toBe(CRAFT_ICON_PX / 2)
  })

  it('stays under the Sun at the Sun’s floor, in every mode', () => {
    for (const mode of ['exaggerated', 'log', 'proportional'] as const) {
      expect(CRAFT_MODEL_PX).toBeLessThanOrEqual(bodyMinPx('Sun', mode))
    }
  })
})

describe('sunShareModelPx (satellite models, #204, ADR 0030)', () => {
  it('stays under the Sun even at the Sun’s floor, in every mode', () => {
    for (const mode of ['exaggerated', 'log', 'proportional'] as const) {
      const sun = bodyMinPx('Sun', mode)
      expect(sunShareModelPx(sun)).toBeLessThanOrEqual(sun)
    }
  })

  it('takes 0.9 of the Sun’s radius when that is in range', () => {
    expect(sunShareModelPx(40)).toBeCloseTo(36, 9)
  })

  it('never goes below the craft icon radius, nor above 100 px', () => {
    expect(sunShareModelPx(10)).toBe(CRAFT_ICON_PX / 2)
    expect(sunShareModelPx(500)).toBe(100)
  })

  it('falls to the floor for input that is not a number', () => {
    expect(sunShareModelPx(NaN)).toBe(CRAFT_ICON_PX / 2)
  })
})
