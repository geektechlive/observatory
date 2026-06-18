import { describe, it, expect } from 'vitest'
import { isWaxing, moonLitPath } from '@/lib/moon'

describe('isWaxing', () => {
  it('treats waning phases as not waxing', () => {
    expect(isWaxing('Waning Gibbous')).toBe(false)
    expect(isWaxing('Last Quarter')).toBe(false)
  })
  it('treats waxing/new phases as waxing', () => {
    expect(isWaxing('Waxing Crescent')).toBe(true)
    expect(isWaxing('New Moon')).toBe(true)
    expect(isWaxing('First Quarter')).toBe(true)
  })
})

describe('moonLitPath', () => {
  it('produces a closed path', () => {
    const d = moonLitPath(50, 0.5, true)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('lights the right side when waxing, left when waning (at the equator point)', () => {
    // At y≈0 the limb point is ±R; waxing should be +R, waning −R.
    const waxing = moonLitPath(50, 0.5, true)
    const waning = moonLitPath(50, 0.5, false)
    expect(waxing).toContain('50.00,0.00')
    expect(waning).toContain('-50.00,0.00')
  })

  it('clamps fraction to [0,1] without throwing', () => {
    expect(() => moonLitPath(50, -1, true)).not.toThrow()
    expect(() => moonLitPath(50, 2, true)).not.toThrow()
  })
})
