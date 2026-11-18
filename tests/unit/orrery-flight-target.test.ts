/**
 * The fly-in's target marker (#261 follow-up). The owner saw the probe "wink into existence"
 * at the end of the flight: at its true size a craft a few metres across stays under a
 * pixel until about a kilometre out. A camera-ship's target bracket and range readout mark
 * it from the first frame, and fade once the model itself is big enough to see.
 */
import { describe, expect, it } from 'vitest'

import { formatRange, TARGET_FADE_PX, targetLook } from '@/lib/orrery/flightTarget'

describe('formatRange', () => {
  it('reads like a range finder from a million km down to metres', () => {
    expect(formatRange(1_000_000)).toBe('1.00 million km')
    expect(formatRange(2_411_923)).toBe('2.41 million km')
    expect(formatRange(124_019)).toBe('124,019 km')
    expect(formatRange(9.416)).toBe('9.4 km')
    expect(formatRange(0.293)).toBe('293 m')
    expect(formatRange(0.0049)).toBe('5 m')
  })
})

describe('targetLook', () => {
  it('marks a sub-pixel craft with a full-strength bracket of a fixed minimum size', () => {
    const far = targetLook(0.01)
    expect(far.opacity).toBe(1)
    expect(far.sizePx).toBeGreaterThanOrEqual(20)
  })

  it('grows round the model and fades out once the model is plain to see', () => {
    const mid = targetLook(TARGET_FADE_PX / 2)
    expect(mid.sizePx).toBeGreaterThan(TARGET_FADE_PX)
    expect(mid.opacity).toBeGreaterThan(0)
    expect(mid.opacity).toBeLessThan(1)
    expect(targetLook(TARGET_FADE_PX).opacity).toBe(0)
    expect(targetLook(500).opacity).toBe(0)
  })
})
