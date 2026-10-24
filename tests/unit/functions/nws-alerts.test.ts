/**
 * NWS phase 2 (#43): the client colours alerts from severity (#38), so the server's
 * old iOS `color` field is gone, and the cache key moved to v2 so no cached body
 * still carries it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest } from '../../../functions/api/nws-alerts'
import { installFakeCache, makeCtx } from './_fakeCache'

const POLY = {
  type: 'Polygon',
  coordinates: [
    [
      [-97, 35],
      [-96, 35],
      [-96, 36],
      [-97, 35],
    ],
  ],
}

const UPSTREAM = {
  features: [
    {
      geometry: POLY,
      properties: { event: 'Flood Warning', severity: 'Severe', headline: 'Flood Warning issued' },
    },
    { geometry: null, properties: { event: 'Heat Advisory', severity: 'Minor', headline: '' } },
  ],
}

type Handler = (ctx: unknown) => Promise<Response>
const call = (tc: ReturnType<typeof makeCtx>) =>
  (onRequest as unknown as Handler)({ ...tc.ctx, env: {} })

describe('/api/nws-alerts', () => {
  let store: ReturnType<typeof installFakeCache>

  beforeEach(() => {
    store = installFakeCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(UPSTREAM), { status: 200 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends polygon alerts with severity and no server colour', async () => {
    const tc = makeCtx('https://observatory.test/api/nws-alerts')
    const res = await call(tc)
    await tc.settle()
    expect(res.status).toBe(200)
    const body = await res.json<{ features: Record<string, unknown>[] }>()
    expect(body.features).toHaveLength(1)
    expect(body.features[0]).toMatchObject({ event: 'Flood Warning', severity: 'Severe' })
    expect(body.features[0]).not.toHaveProperty('color')
  })

  it('caches under the v2 key, so no v1 body with a colour is served', async () => {
    const tc = makeCtx('https://observatory.test/api/nws-alerts')
    await call(tc)
    await tc.settle()
    const keys = [...store.keys()].map(decodeURIComponent)
    expect(keys.some((k) => k.includes('nws:alerts:v2'))).toBe(true)
    expect(keys.some((k) => k.includes('nws:alerts:v1'))).toBe(false)
  })
})
