/**
 * satellite.js 7's WASM bulk propagation (#97) against its own JS propagate: the bulk
 * path must give the same ISS positions, and mark an unplaceable satellite as NaN.
 */
import * as satellite from 'satellite.js'
import { describe, expect, it } from 'vitest'

import { bulkRuntime, propagateBulk } from '@/lib/orbit/bulk/bulkEci'

// The Heavens-Above fixture from iss-passes.test.ts (2026-10-28).
const ISS = satellite.twoline2satrec(
  '1 25544U 98067A   26300.17675415  .00005704  00000+0  11132-3 0  9993',
  '2 25544  51.6336   6.9404 0006948 314.9066  45.1358 15.49073103592213',
)

describe('propagateBulk (#97)', () => {
  it('matches the JS propagate for the ISS to a metre, at several dates', async () => {
    const dates = [0, 1, 7, 30].map((m) => new Date(Date.UTC(2026, 9, 28) + m * 60_000 * 13))
    const out = propagateBulk(await bulkRuntime(), [ISS, ISS], dates)
    expect(out).toHaveLength(2 * dates.length * 3)
    dates.forEach((date, j) => {
      const js = satellite.propagate(ISS, date)
      expect(js).not.toBeNull()
      for (const sat of [0, 1]) {
        const k = (sat * dates.length + j) * 3
        // Float32 holds ~7 digits: 7,000 km to under a metre.
        expect(Math.abs((out[k] ?? 0) - (js?.position.x ?? 0))).toBeLessThan(0.001)
        expect(Math.abs((out[k + 1] ?? 0) - (js?.position.y ?? 0))).toBeLessThan(0.001)
        expect(Math.abs((out[k + 2] ?? 0) - (js?.position.z ?? 0))).toBeLessThan(0.001)
      }
    })
  })

  it('gives NaN, not a position, for a satellite long decayed', async () => {
    // The ISS elements 40 years past their epoch: SGP4 reports decay.
    const later = new Date(Date.UTC(2066, 0, 1))
    const out = propagateBulk(await bulkRuntime(), [ISS], [later])
    expect(satellite.propagate(ISS, later)).toBeNull()
    expect(Number.isNaN(out[0])).toBe(true)
  })
})
