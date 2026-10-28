/**
 * /api/aurora computes the reach line over the full OVATION grid (#77), before its trim
 * to the 3,500 strongest cells: in a big storm the cells the trim drops are the weak
 * equatorward edge, which is exactly the line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest } from '../../../functions/api/aurora'
import { gridValue } from '../../../src/lib/auroraChance'
import { installFakeCache, makeCtx } from './_fakeCache'

type Cell = [number, number, number]

/** A full 360 x 181 grid: `chance` where |lat| is in [from, to], else 0. */
function grid(from: number, to: number, chance: number | ((lat: number) => number)): Cell[] {
  const cells: Cell[] = []
  for (let lon = 0; lon < 360; lon++) {
    for (let lat = -90; lat <= 90; lat++) {
      const inside = Math.abs(lat) >= from && Math.abs(lat) <= to
      const v = typeof chance === 'number' ? chance : chance(Math.abs(lat))
      cells.push([lon, lat, inside ? v : 0])
    }
  }
  return cells
}

function serve(coordinates: Cell[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ 'Observation Time': 'o', 'Forecast Time': 'f', coordinates }),
          { status: 200 },
        ),
    ),
  )
}

type Handler = (ctx: unknown) => Promise<Response>
const call = () => (onRequest as unknown as Handler)(makeCtx('https://o.test/api/aurora').ctx)

interface Body {
  grid: string[]
  points: Cell[]
  reach: {
    likely: { n: [number, number][]; s: [number, number][] }
    possible: { n: [number, number][]; s: [number, number][] }
  }
}

describe('/api/aurora reach (#77)', () => {
  beforeEach(() => {
    installFakeCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the likely and possible edges in both hemispheres', async () => {
    // 20% from 62 to 70, 7% from 58 to 61: likely edge at 62, possible at 58.
    serve(grid(58, 70, (lat) => (lat >= 62 ? 20 : 7)))
    const { reach } = await (await call()).json<Body>()
    expect(reach.likely.n.every(([, lat]) => lat === 62)).toBe(true)
    expect(reach.possible.n.every(([, lat]) => lat === 58)).toBe(true)
    expect(reach.likely.s.every(([, lat]) => lat === -62)).toBe(true)
  })

  it('finds the edge even where the 3,500-cell trim drops it, in a big storm', async () => {
    // Strong from 50 to 75 (well over 3,500 cells), weak-but-likely edge at 45..49.
    serve(grid(45, 75, (lat) => (lat >= 50 ? 30 : 11)))
    const body = await (await call()).json<Body>()
    expect(body.points).toHaveLength(3500)
    expect(Math.min(...body.points.map(([, lat]) => Math.abs(lat)))).toBeGreaterThanOrEqual(50)
    expect(body.reach.likely.n.every(([, lat]) => lat === 45)).toBe(true)
  })

  it('ships the whole grid compactly, so the location never has to leave the browser (#80)', async () => {
    serve(grid(45, 75, (lat) => (lat >= 50 ? 30 : 11)))
    const body = await (await call()).json<Body>()
    expect(body.grid).toHaveLength(181)
    expect(body.grid.every((row) => row.length === 360)).toBe(true)
    expect(gridValue(body.grid, 47, -95)).toBe(11)
    expect(gridValue(body.grid, 60, 10)).toBe(30)
    expect(gridValue(body.grid, 30, 10)).toBe(0)
  })
})
