import { describe, expect, it } from 'vitest'

import { contrastRatio, oklchToHex, parseOklch } from '@/lib/color'

describe('parseOklch', () => {
  it('reads L C H with an optional alpha', () => {
    expect(parseOklch('oklch(0.62 0.13 48)')).toEqual({ l: 0.62, c: 0.13, h: 48, alpha: 1 })
    expect(parseOklch('oklch(0.94 0.01 80 / 0.4)')).toEqual({ l: 0.94, c: 0.01, h: 80, alpha: 0.4 })
  })

  it('returns null for anything that is not a literal oklch()', () => {
    expect(parseOklch('var(--bone)')).toBeNull()
    expect(parseOklch('#fff')).toBeNull()
  })
})

describe('oklchToHex', () => {
  it('maps the OKLab anchors to sRGB white and black', () => {
    expect(oklchToHex({ l: 1, c: 0, h: 0, alpha: 1 })).toBe('#ffffff')
    expect(oklchToHex({ l: 0, c: 0, h: 0, alpha: 1 })).toBe('#000000')
  })

  it('matches a known conversion within one step per channel', () => {
    // oklch(0.62 0.13 48) is #c46b39 (checked against the CSS Color 4 reference math)
    const hex = oklchToHex({ l: 0.62, c: 0.13, h: 48, alpha: 1 })
    const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    channels(hex).forEach((v, i) => {
      expect(Math.abs(v - (channels('#c46b39')[i] ?? 0))).toBeLessThanOrEqual(1)
    })
  })
})

describe('oklchToHex gamut mapping', () => {
  it('reduces chroma rather than clipping, so an out-of-gamut cyan stays cyan', () => {
    // oklch(0.85 0.13 220) is outside sRGB; per-channel clipping gave #55e1ff (hue drift)
    const hex = oklchToHex({ l: 0.85, c: 0.13, h: 220, alpha: 1 })
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    expect(hex).not.toBe('#55e1ff')
    expect(b).toBeGreaterThanOrEqual(g ?? 0)
    expect(r).toBeGreaterThan(80)
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#c46b39', '#c46b39')).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#c46b39', '#030101')).toBeCloseTo(contrastRatio('#030101', '#c46b39'), 10)
  })
})
