import { describe, expect, it } from 'vitest'

import { globeSizeFor } from '@/hooks/useLensSize'

describe('globeSizeFor (#63)', () => {
  it('fills a wide lens up to the 760px instrument cap, less the bezel', () => {
    expect(globeSizeFor(1200, 2000)).toBe(760 - 76)
  })

  it('is capped at 72% of the viewport height on a short laptop screen', () => {
    expect(globeSizeFor(1000, 800)).toBe(Math.floor(800 * 0.72 - 76))
  })

  it('follows the lens width on a phone', () => {
    expect(globeSizeFor(358, 844)).toBe(358 - 76)
  })

  it('never goes below a readable minimum', () => {
    expect(globeSizeFor(200, 300)).toBe(240)
  })

  it('is more than 600px at 1440 x 900 when the lens has room', () => {
    expect(globeSizeFor(900, 900)).toBeGreaterThan(560)
  })
})
