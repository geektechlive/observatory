import { describe, it, expect } from 'vitest'
import {
  formatKm,
  formatLunarDistance,
  formatAu,
  formatVelocity,
  formatDiameter,
  formatKt,
  formatDateUtc,
  formatRelativeTime,
  formatPalermo,
  formatImpactProbability,
} from '@/lib/format'

describe('formatKm', () => {
  it('formats values under 1000 as plain km', () => {
    expect(formatKm(408)).toBe('408 km')
  })
  it('formats thousands with K suffix', () => {
    expect(formatKm(1500)).toBe('1.5K km')
  })
  it('formats millions with M suffix', () => {
    expect(formatKm(2_500_000)).toBe('2.50M km')
  })
})

describe('formatLunarDistance', () => {
  it('formats to 2 decimal places with LD unit', () => {
    expect(formatLunarDistance(1.234)).toBe('1.23 LD')
  })
})

describe('formatAu', () => {
  it('formats to 4 decimal places with AU unit', () => {
    expect(formatAu(1.00001)).toBe('1.0000 AU')
  })
})

describe('formatVelocity', () => {
  it('formats to 1 decimal place with km/s unit', () => {
    expect(formatVelocity(7.123)).toBe('7.1 km/s')
  })
})

describe('formatDiameter', () => {
  it('formats sub-km average as meters', () => {
    expect(formatDiameter(0.001, 0.003)).toBe('~2 m')
  })
  it('formats km-scale average with km unit', () => {
    expect(formatDiameter(0.5, 1.5)).toBe('~1.0 km')
  })
})

describe('formatKt', () => {
  it('returns em dash for null', () => {
    expect(formatKt(null)).toBe('—')
  })
  it('returns em dash for empty string', () => {
    expect(formatKt('')).toBe('—')
  })
  it('formats kilotons', () => {
    expect(formatKt('42.5')).toBe('42.5 kt')
  })
  it('formats megatons for values ≥ 1000', () => {
    expect(formatKt('1500')).toBe('1.5 Mt')
  })
})

describe('formatDateUtc', () => {
  it('formats ISO string to UTC datetime', () => {
    expect(formatDateUtc('2024-05-01T14:32:00Z')).toBe('2024-05-01 14:32 UTC')
  })
  it('returns input unchanged for invalid dates', () => {
    expect(formatDateUtc('not-a-date')).toBe('not-a-date')
  })
})

describe('formatPalermo', () => {
  it('returns em dash for undefined', () => {
    expect(formatPalermo(undefined)).toBe('—')
  })
  it('formats Palermo scale to 2 decimal places', () => {
    expect(formatPalermo('-3.42')).toBe('-3.42')
  })
})

describe('formatImpactProbability', () => {
  it('returns em dash for undefined', () => {
    expect(formatImpactProbability(undefined)).toBe('—')
  })
  it('formats very small probabilities in scientific notation', () => {
    const result = formatImpactProbability('0.000001')
    expect(result).toContain('%')
    expect(result).toContain('e')
  })
  it('formats normal probabilities as percentage', () => {
    expect(formatImpactProbability('0.01')).toBe('1.0000%')
  })
})

describe('formatRelativeTime', () => {
  it('returns "just now" for very recent times', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now)).toBe('just now')
  })
  it('returns hours ago for recent past', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago')
  })
  it('returns days ago for older dates', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString()
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago')
  })
})
