/**
 * Aurora chance at the user's location (#80). /api/aurora ships the whole OVATION grid
 * compactly, so the location never leaves the browser and one cache entry serves all.
 * OVATION's value is SWPC's chance (%) of visible aurora overhead.
 */
import { describe, expect, it } from 'vitest'

import {
  AURORA_HORIZON_WEIGHT,
  auroraChanceAt,
  decodeCell,
  encodeGrid,
  gridValue,
  kpAt,
} from '@/lib/auroraChance'

type Cell = [number, number, number]

/** A full grid that is `v(lat, lon)` everywhere. */
function cells(v: (lat: number, lon: number) => number): Cell[] {
  const out: Cell[] = []
  for (let lon = 0; lon < 360; lon++)
    for (let lat = -90; lat <= 90; lat++) out.push([lon, lat, v(lat, lon)])
  return out
}

describe('encodeGrid / gridValue', () => {
  it('round-trips every cell, one character each, rows from 90°S', () => {
    const grid = encodeGrid(cells((lat, lon) => (lat === 60 && lon === 265 ? 23 : 0)))
    expect(grid).toHaveLength(181)
    expect(grid[0]).toHaveLength(360)
    expect(gridValue(grid, 60, 265)).toBe(23)
    expect(gridValue(grid, 60, -95)).toBe(23)
    expect(gridValue(grid, 59, 265)).toBe(0)
  })

  it('rounds to the nearest whole-degree cell and wraps longitude', () => {
    const grid = encodeGrid(cells((lat, lon) => (lat === 39 && lon === 0 ? 7 : 0)))
    expect(gridValue(grid, 39.3, 359.6)).toBe(7)
    expect(gridValue(grid, 38.6, -0.4)).toBe(7)
  })

  it('caps very high values instead of corrupting the row', () => {
    const grid = encodeGrid(cells(() => 100))
    expect(decodeCell(grid[100]?.[10] ?? '')).toBe(77)
  })
})

describe('auroraChanceAt', () => {
  it('uses the overhead value when the oval is overhead', () => {
    const grid = encodeGrid(cells((lat) => (lat >= 55 && lat <= 70 ? 20 : 0)))
    expect(auroraChanceAt(grid, 60, -95)).toMatchObject({ overhead: 20, horizon: 20, chance: 20 })
  })

  it('counts an oval up to 9° poleward as on the horizon, at half weight', () => {
    expect(AURORA_HORIZON_WEIGHT).toBe(0.5)
    const grid = encodeGrid(cells((lat) => (lat >= 47 && lat <= 60 ? 20 : 0)))
    expect(auroraChanceAt(grid, 39, -95)).toMatchObject({ overhead: 0, horizon: 20, chance: 10 })
  })

  it('ignores an oval more than 9° poleward', () => {
    const grid = encodeGrid(cells((lat) => (lat >= 51 ? 20 : 0)))
    expect(auroraChanceAt(grid, 39, -95).chance).toBe(0)
  })

  it('looks poleward in the south too', () => {
    const grid = encodeGrid(cells((lat) => (lat <= -45 && lat >= -60 ? 30 : 0)))
    expect(auroraChanceAt(grid, -40, 147).horizon).toBe(30)
    expect(auroraChanceAt(grid, 40, 147).horizon).toBe(0)
  })
})

describe('kpAt', () => {
  const forecast = [
    { time: '2026-10-28T00:00:00', kp: 2.33, kind: 'predicted', scale: null },
    { time: '2026-10-28T03:00:00', kp: 4.67, kind: 'predicted', scale: null },
  ]

  it("gives the Kp of the 3-hour bin a time falls in (NOAA's times are UTC)", () => {
    expect(kpAt(forecast, new Date('2026-10-28T04:30:00Z'))?.kp).toBe(4.67)
    expect(kpAt(forecast, new Date('2026-10-28T00:00:00Z'))?.kp).toBe(2.33)
  })

  it('is null outside the forecast', () => {
    expect(kpAt(forecast, new Date('2026-10-28T09:00:00Z'))).toBeNull()
  })
})
