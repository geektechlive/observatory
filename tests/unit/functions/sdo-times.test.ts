/**
 * /api/sdo-times (#73): SDO's times files send no CORS header, so the browser can't
 * read them; this reads the five the Sun view needs and answers one small JSON.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest } from '../../../functions/api/sdo-times'
import { installFakeCache, makeCtx } from './_fakeCache'

type Handler = (ctx: unknown) => Promise<Response>
const call = () => (onRequest as unknown as Handler)(makeCtx('https://o.test/api/sdo-times').ctx)

const FILES: Record<string, string> = {
  'times0171.txt': '0171: 20261025_164622\n',
  'times0193.txt': '0193: 20261025_164605\n',
  'times0211.txt': '0211: 20261025_164559\n',
  'times0304.txt': '0304: 20261025_164617\n',
  'hmitimes.txt': 'Time     20261025_161500\nIc  http://jsoc.example/x\n',
}

function serve(files: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const name = url.split('/').pop() ?? ''
      const text = files[name]
      return text === undefined
        ? new Response('missing', { status: 404 })
        : new Response(text, { status: 200 })
    }),
  )
}

interface Body {
  times: Record<string, string | null>
}

describe('/api/sdo-times', () => {
  beforeEach(() => {
    installFakeCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers every channel the Sun view shows', async () => {
    serve(FILES)
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json<Body>()).times).toEqual({
      '0171': '2026-10-25T16:46:22Z',
      '0193': '2026-10-25T16:46:05Z',
      '0211': '2026-10-25T16:45:59Z',
      '0304': '2026-10-25T16:46:17Z',
      HMIB: '2026-10-25T16:15:00Z',
    })
  })

  it('answers degraded with a null for a channel that failed', async () => {
    const rest = { ...FILES }
    delete rest['times0304.txt']
    serve(rest)
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect((await res.json<Body>()).times['0304']).toBeNull()
  })

  it('is an upstream error when every file fails', async () => {
    serve({})
    const res = await call()
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })

  it('is a contract error when the files answer but none has a stamp', async () => {
    serve(Object.fromEntries(Object.keys(FILES).map((k) => [k, '<html>moved</html>'])))
    const res = await call()
    expect(res.status).toBe(500)
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
  })
})
