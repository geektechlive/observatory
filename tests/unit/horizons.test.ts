import { describe, it, expect } from 'vitest'
import { parseHorizons } from '@/lib/horizons'

const RESULT = `... header ...
$$SOE
 2026-Jun-18 00:00     03 18 14.81 +17 47 39.4    1.333   4.226   34.5789 /L
 2026-Jun-19 00:00     03 21 10.66 +17 59 25.4    1.329   4.224   34.8094 /L
$$EOE
... footer ...`

describe('parseHorizons', () => {
  it('parses RA/Dec/mag/elongation from the first SOE row', () => {
    const o = parseHorizons(RESULT)
    expect(o).not.toBeNull()
    expect(o?.raHours).toBeCloseTo(3 + 18 / 60 + 14.81 / 3600, 4)
    expect(o?.decDeg).toBeCloseTo(17 + 47 / 60 + 39.4 / 3600, 4)
    expect(o?.mag).toBeCloseTo(1.333, 3)
    expect(o?.elongation).toBeCloseTo(34.5789, 3)
  })

  it('handles negative declination', () => {
    const neg = RESULT.replace('+17 47 39.4', '-05 12 30.0')
    const o = parseHorizons(neg)
    expect(o?.decDeg).toBeLessThan(0)
    expect(o?.decDeg).toBeCloseTo(-(5 + 12 / 60 + 30 / 3600), 4)
  })

  it('returns null when no SOE block is present', () => {
    expect(parseHorizons('no data here')).toBeNull()
  })
})
