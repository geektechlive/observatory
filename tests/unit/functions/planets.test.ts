/**
 * /api/planets (#88): JPL Horizons answers 503 to requests that overlap from one address.
 * Measured 2026-11-06: 9 parallel calls got 2 answers and 7 503s; the same 9 one at a
 * time all answered in ~140 ms each. The fake upstream below refuses overlap the same way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest } from '../../../functions/api/planets'
import { installFakeCache, makeCtx } from './_fakeCache'

const RESULT = `... header ...
$$SOE
 2026-Nov-06 00:00     03 18 14.81 +17 47 39.4    1.333   4.226   34.5789 /L
 2026-Nov-07 00:00     03 21 10.66 +17 59 25.4    1.329   4.224   34.8094 /L
$$EOE
... footer ...`

/** Horizons as seen from Workers: overlapping requests get a 503; `down` ids always fail. */
function serveHorizons(down: string[] = []) {
  let inFlight = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      inFlight += 1
      try {
        await new Promise((r) => setTimeout(r, 5))
        const id = url.searchParams.get('COMMAND') ?? ''
        if (inFlight > 1 || down.includes(id))
          return new Response('<html>busy</html>', { status: 503 })
        return new Response(JSON.stringify({ result: RESULT }), { status: 200 })
      } finally {
        inFlight -= 1
      }
    }),
  )
}

type Handler = (ctx: unknown) => Promise<Response>
const call = () => (onRequest as unknown as Handler)(makeCtx('https://o.test/api/planets').ctx)

interface Body {
  bodies: { name: string }[]
}

describe('/api/planets', () => {
  beforeEach(() => {
    installFakeCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks Horizons one body at a time, so every body answers', async () => {
    serveHorizons()
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
    const { bodies } = await res.json<Body>()
    expect(bodies.map((b) => b.name)).toEqual([
      'Sun',
      'Moon',
      'Mercury',
      'Venus',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ])
  })

  it('says a partial answer is upstream-caused and who served it (#71)', async () => {
    serveHorizons(['599'])
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get('X-Data-Source')).toBe('horizons')
    const { bodies } = await res.json<Body>()
    expect(bodies.map((b) => b.name)).not.toContain('Jupiter')
    expect(bodies).toHaveLength(8)
  })
})
