/**
 * The inspector's "See it in your sky" link (#99 item 5): the sky view opened from the
 * orrery uses the orrery's clock, so a scrubbed clock travels in `t`; a clock that is
 * running at real time carries none, and the view stays live.
 */
import { describe, expect, it } from 'vitest'

import { skyViewHash } from '@/components/orrery/skyViewLink'
import { parseSkyLink } from '@/lib/sky/skyLink'

const WALL = Date.parse('2026-11-13T12:00:00Z')

describe('skyViewHash', () => {
  it('leaves out the time while the orrery clock runs at real time', () => {
    const live = { anchorSim: WALL - 30_000, anchorWall: WALL - 30_000, rate: 1, playing: true }
    expect(skyViewHash('sbc:20000004', live, WALL)).toBe('#sky?target=sbc:20000004')
  })

  it('carries the clock’s time when it has been scrubbed', () => {
    const scrubbed = {
      anchorSim: Date.parse('2026-11-16T03:00:00Z'),
      anchorWall: WALL,
      rate: 1,
      playing: false,
    }
    const hash = skyViewHash('sbc:20000004', scrubbed, WALL)
    expect(hash).toBe('#sky?target=sbc:20000004&t=2026-11-16T03:00:00Z')
    expect(parseSkyLink(hash)).toEqual({
      target: 'sbc:20000004',
      t: Date.parse('2026-11-16T03:00:00Z'),
    })
  })

  it('uses the clock’s time as it is now when it is playing at a faster rate', () => {
    const fast = {
      anchorSim: Date.parse('2026-11-16T03:00:00Z'),
      anchorWall: WALL - 1000,
      rate: 60,
      playing: true,
    }
    expect(skyViewHash('sbc:1004083', fast, WALL)).toBe(
      '#sky?target=sbc:1004083&t=2026-11-16T03:01:00Z',
    )
  })
})
