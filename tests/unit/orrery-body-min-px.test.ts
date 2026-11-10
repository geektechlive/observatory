/**
 * The Sun's minimum drawn radius (#196): in every scale mode it stays above a spacecraft
 * icon's radius, or the craft beside it look bigger than the star.
 */
import { describe, expect, it } from 'vitest'

import { bodyMinPx } from '@/components/orrery/three/bodyMinPx'
import { CRAFT_ICON_PX } from '@/components/orrery/three/craftLayer'

const MODES = ['exaggerated', 'log', 'proportional'] as const

describe('bodyMinPx', () => {
  it.each(MODES)('draws the Sun above a craft icon in %s', (mode) => {
    expect(bodyMinPx('Sun', mode)).toBeGreaterThan(CRAFT_ICON_PX / 2)
  })

  it.each(MODES)('draws the Sun above every planet in %s', (mode) => {
    for (const planet of ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn'] as const) {
      expect(bodyMinPx('Sun', mode)).toBeGreaterThan(bodyMinPx(planet, mode))
    }
  })
})
