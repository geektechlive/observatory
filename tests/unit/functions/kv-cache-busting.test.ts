/**
 * A cache-busting query string (`?cb=…`) skipped the CDN cache and cost a Function call and
 * a KV read each on the KV-backed orrery endpoints (#247). Behind the Cache API, keyed by
 * the KV key, a burst of differing query strings reads KV once.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { onRequest as discos } from '../../../functions/api/discos'
import { onRequest as orreryBodies } from '../../../functions/api/orrery-bodies'
import { onRequest as orreryNeo } from '../../../functions/api/orrery-neo'
import { onRequest as orrerySats } from '../../../functions/api/orrery-sats'
import { onRequest as spacetrack } from '../../../functions/api/spacetrack'
import { installFakeCache } from './_fakeCache'

function kv() {
  const reads: string[] = []
  return {
    reads,
    reader: {
      getWithMetadata: (key: string) => {
        reads.push(key)
        const value = new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"ok":1}'))
            c.close()
          },
        })
        return Promise.resolve({ value, metadata: { fetchedAt: new Date().toISOString() } })
      },
    },
  }
}

type Handler = (ctx: never) => Promise<Response> | Response

async function call(handler: Handler, url: string, reader: unknown) {
  const pending: Promise<unknown>[] = []
  const ctx = {
    request: new Request(url),
    env: { OBSERVATORY_CACHE: reader },
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  }
  const res = await handler(ctx as never)
  await Promise.all(pending)
  return res
}

const ENDPOINTS: { name: string; handler: Handler; path: string }[] = [
  { name: 'discos', handler: discos as Handler, path: '/api/discos' },
  { name: 'orrery-bodies', handler: orreryBodies as Handler, path: '/api/orrery-bodies' },
  { name: 'orrery-neo', handler: orreryNeo as Handler, path: '/api/orrery-neo' },
  { name: 'orrery-sats', handler: orrerySats as Handler, path: '/api/orrery-sats?group=stations' },
  { name: 'spacetrack', handler: spacetrack as Handler, path: '/api/spacetrack?part=catalog' },
]

beforeEach(() => {
  installFakeCache()
})

describe('KV-backed orrery endpoints behind the Cache API (#247)', () => {
  it.each(ENDPOINTS)('$name reads KV once whatever the cache-busting query', async (e) => {
    const store = kv()
    const sep = e.path.includes('?') ? '&' : '?'
    const a = await call(e.handler, `https://o.test${e.path}${sep}cb=1`, store.reader)
    const b = await call(e.handler, `https://o.test${e.path}${sep}cb=2`, store.reader)
    expect(a.status).toBe(200)
    expect(await b.text()).toBe('{"ok":1}')
    expect(store.reads).toHaveLength(1)
  })
})
