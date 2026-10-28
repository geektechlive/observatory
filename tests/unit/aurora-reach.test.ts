/**
 * How far the aurora reaches (#77): the equatorward edge of the OVATION oval, per
 * longitude and hemisphere. OVATION cells are [lon 0..359, lat -90..90, chance %].
 */
import { describe, expect, it } from 'vitest'

import { auroraReach, HORIZON_REACH_DEG, reachExtreme, reachSegments } from '@/lib/auroraReach'

type Cell = [number, number, number]

/** A synthetic oval: `chance` at every longitude between `from` and `to` (abs latitude). */
function oval(fromLat: number, toLat: number, chance: number, lons = 360): Cell[] {
  const cells: Cell[] = []
  for (let lon = 0; lon < lons; lon++) {
    for (let lat = -90; lat <= 90; lat++) {
      const inside = Math.abs(lat) >= fromLat && Math.abs(lat) <= toLat
      cells.push([lon, lat, inside ? chance : 1])
    }
  }
  return cells
}

describe('auroraReach', () => {
  it('finds the equatorward edge in each hemisphere at every longitude', () => {
    const reach = auroraReach(oval(60, 70, 20), 10)
    expect(reach.n).toHaveLength(360)
    expect(reach.s).toHaveLength(360)
    expect(reach.n.every(([, lat]) => lat === 60)).toBe(true)
    expect(reach.s.every(([, lat]) => lat === -60)).toBe(true)
  })

  it('reports longitudes in -180..180, sorted', () => {
    const lons = auroraReach(oval(60, 70, 20), 10).n.map(([lon]) => lon)
    expect(lons[0]).toBe(-180)
    expect(lons.at(-1)).toBe(179)
    expect([...lons].sort((a, b) => a - b)).toEqual(lons)
  })

  it('leaves out longitudes where nothing reaches the threshold', () => {
    const cells = oval(60, 70, 20).map(([lon, lat, v]): Cell => [
      lon,
      lat,
      lon >= 100 && lon < 200 ? Math.min(v, 5) : v,
    ])
    expect(auroraReach(cells, 10).n).toHaveLength(260)
  })

  it('is empty when the oval is quiet', () => {
    expect(auroraReach(oval(60, 70, 4), 10)).toEqual({ n: [], s: [] })
  })
})

describe('reachExtreme', () => {
  it('is the point closest to the equator, in each hemisphere', () => {
    const n: [number, number][] = [
      [-100, 55],
      [-95, 52],
      [10, 61],
    ]
    expect(reachExtreme(n)).toEqual({ lon: -95, lat: 52 })
    expect(
      reachExtreme([
        [20, -63],
        [21, -58],
      ]),
    ).toEqual({ lon: 21, lat: -58 })
    expect(reachExtreme([])).toBeNull()
  })

  it('puts the horizon about 9 degrees further: aurora ~110 km up', () => {
    expect(HORIZON_REACH_DEG).toBe(9)
  })
})

describe('reachSegments', () => {
  it('splits the line at gaps, and joins it across the antimeridian', () => {
    const line: [number, number][] = [
      [-180, 60],
      [-179, 60],
      [10, 61],
      [11, 61],
      [179, 60],
    ]
    const segments = reachSegments(line)
    expect(segments).toHaveLength(2)
    // 179 wraps onto -180, so the first run starts at 179.
    expect(segments[0]?.map(([lon]) => lon)).toEqual([179, -180, -179])
    expect(segments[1]?.map(([lon]) => lon)).toEqual([10, 11])
  })

  it('drops runs too short to draw', () => {
    expect(reachSegments([[10, 60]])).toEqual([])
  })
})
