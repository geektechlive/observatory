/**
 * satellite.js 7's sun and shadow helpers against our own math (#97). Measured when
 * adopted: the Sun's RA/Dec agree to 0.0011° over 2000 dates (2000-2050), and the
 * shadow cone at a 0.5 threshold matched our old cylinder test on all 25,920 ISS
 * samples over 3 days. passes.ts now uses the cone; tonight.ts keeps its own Sun
 * (same Almanac formula, no satellite.js import). These tests hold both claims.
 */
import * as satellite from 'satellite.js'
import { describe, expect, it } from 'vitest'

import { sunEquatorial } from '@/lib/tonight'

const DEG = 180 / Math.PI
const RAD = Math.PI / 180
// The Heavens-Above fixture from iss-passes.test.ts (2026-10-28).
const TLE = {
  line1: '1 25544U 98067A   26300.17675415  .00005704  00000+0  11132-3 0  9993',
  line2: '2 25544  51.6336   6.9404 0006948 314.9066  45.1358 15.49073103592213',
}

const julianDay = (d: Date) => d.getTime() / 86_400_000 + 2440587.5

/** Our pre-#97 test: behind the Earth from the Sun, inside a cylinder of Earth's radius. */
function cylinderShadow(p: { x: number; y: number; z: number }, d: Date): boolean {
  const { ra, dec } = sunEquatorial(d)
  const s = {
    x: Math.cos(dec * RAD) * Math.cos(ra * RAD),
    y: Math.cos(dec * RAD) * Math.sin(ra * RAD),
    z: Math.sin(dec * RAD),
  }
  const along = p.x * s.x + p.y * s.y + p.z * s.z
  if (along >= 0) return false
  return Math.hypot(p.x - along * s.x, p.y - along * s.y, p.z - along * s.z) < 6378.137
}

describe('satellite.js 7 helpers vs our math (#97)', () => {
  it('sunPos agrees with sunEquatorial to 0.01° from 2000 to 2050', () => {
    let worst = 0
    for (let i = 0; i < 2000; i++) {
      const d = new Date(Date.UTC(2000, 0, 1) + i * 9.13 * 86_400_000)
      const ours = sunEquatorial(d)
      const v7 = satellite.sunPos(julianDay(d))
      const dRa = Math.abs(((((ours.ra - v7.rtasc * DEG) % 360) + 540) % 360) - 180)
      worst = Math.max(worst, dRa, Math.abs(ours.dec - v7.decl * DEG))
    }
    expect(worst).toBeLessThan(0.01)
  })

  it('the shadow cone at 0.5 matches the cylinder for the ISS over 3 days', () => {
    const satrec = satellite.twoline2satrec(TLE.line1, TLE.line2)
    const start = Date.UTC(2026, 9, 28)
    let samples = 0
    let disagree = 0
    for (let t = start; t < start + 3 * 86_400_000; t += 10_000) {
      const d = new Date(t)
      const r = satellite.propagate(satrec, d)
      if (!r) continue
      samples++
      const cone = satellite.shadowFraction(satellite.sunPos(julianDay(d)).rsun, r.position) >= 0.5
      if (cone !== cylinderShadow(r.position, d)) disagree++
    }
    expect(samples).toBe(25_920)
    expect(disagree).toBe(0)
  })
})
