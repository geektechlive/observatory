/**
 * /api/planets, /api/sentry and /api/fireball (#146): finished bodies the refresh job
 * wrote to KV, passed through unparsed. JPL is never called from a Function (#88), the
 * Cache API sits in front so a busy minute costs one KV read per data centre, and the
 * "not yet in KV" answer is our JSON 503, never a 502 or 504 (#61).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FRESH_SECONDS as FIREBALL_FRESH,
  KV_FIREBALL_KEY,
  serveFireball,
} from '../../../functions/api/fireball'
import {
  FRESH_SECONDS as PLANETS_FRESH,
  KV_PLANETS_KEY,
  servePlanets,
} from '../../../functions/api/planets'
import {
  FRESH_SECONDS as SENTRY_FRESH,
  KV_SENTRY_KEY,
  serveSentry,
} from '../../../functions/api/sentry'
import { installFakeCache, makeCtx } from './_fakeCache'

const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const HOUR = 3_600_000

function kv(expectedKey: string, value: string | null, metadata: unknown) {
  const reads: string[] = []
  return {
    reads,
    reader: {
      getWithMetadata: (key: string, opts: { type: string }) => {
        reads.push(key)
        expect(key).toBe(expectedKey)
        expect(opts.type).toBe('stream')
        const stream =
          value === null
            ? null
            : new ReadableStream({
                start(c) {
                  c.enqueue(new TextEncoder().encode(value))
                  c.close()
                },
              })
        return Promise.resolve({ value: stream, metadata })
      },
    },
  }
}

const meta = (hoursOld: number) => ({ fetchedAt: new Date(NOW - hoursOld * HOUR).toISOString() })

const FEEDS = [
  {
    name: 'planets',
    url: 'https://o.test/api/planets',
    key: KV_PLANETS_KEY,
    fresh: PLANETS_FRESH,
    serve: servePlanets,
    limitHours: 24,
  },
  {
    name: 'sentry',
    url: 'https://o.test/api/sentry',
    key: KV_SENTRY_KEY,
    fresh: SENTRY_FRESH,
    serve: serveSentry,
    limitHours: 48,
  },
  {
    name: 'fireball',
    url: 'https://o.test/api/fireball',
    key: KV_FIREBALL_KEY,
    fresh: FIREBALL_FRESH,
    serve: serveFireball,
    limitHours: 48,
  },
] as const

describe('the KV-first JPL feeds (#146)', () => {
  beforeEach(() => {
    installFakeCache()
    // JPL must never be reached from a Function.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('a Function called out')
      }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses KV keys the refresh job writes', () => {
    expect([KV_PLANETS_KEY, KV_SENTRY_KEY, KV_FIREBALL_KEY]).toEqual([
      'horizons:planets:v1',
      'jpl:sentry:v1',
      'jpl:fireball:v1',
    ])
  })

  it.each(FEEDS)('$name passes a fresh body through unparsed, with its age', async (feed) => {
    const store = kv(feed.key, '{"not": parsed}', meta(5))
    const { ctx, settle } = makeCtx(feed.url)
    const res = await feed.serve(ctx, store.reader, NOW)
    await settle()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"not": parsed}')
    expect(res.headers.get('X-Data-Age')).toBe(String(5 * 3600))
    expect(res.headers.get('X-Data-Source')).toBe('kv')
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(FEEDS)(
    '$name serves a copy past its limit degraded and upstream-caused',
    async (feed) => {
      expect(feed.fresh).toBe(feed.limitHours * 3600)
      const young = await feed.serve(
        makeCtx(feed.url).ctx,
        kv(feed.key, '{}', meta(feed.limitHours - 1)).reader,
        NOW,
      )
      expect(young.headers.get('X-Data-Degraded')).toBeNull()
      const res = await feed.serve(
        makeCtx(feed.url).ctx,
        kv(feed.key, '{}', meta(feed.limitHours + 1)).reader,
        NOW,
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('X-Data-Degraded')).toBe('1')
      expect(res.headers.get('X-Error-Kind')).toBe('upstream')
      expect(res.headers.get('X-Data-Source')).toBe('kv-backup')
    },
  )

  it.each(FEEDS)(
    '$name answers our JSON 503 until the refresh job has written it',
    async (feed) => {
      const { ctx, settle } = makeCtx(feed.url)
      const res = await feed.serve(ctx, kv(feed.key, null, null).reader, NOW)
      await settle()
      expect(res.status).toBe(503)
      expect(res.headers.get('X-Error-Kind')).toBe('upstream')
      expect(res.headers.get('X-Data-Source')).toBe('kv')
      expect((await res.json<{ error: string }>()).error).toMatch(/not yet in KV/)
    },
  )

  it.each(FEEDS)(
    '$name does not cache the not-yet 503, so the first run is seen at once',
    async (feed) => {
      const empty = kv(feed.key, null, null)
      const first = makeCtx(feed.url)
      await feed.serve(first.ctx, empty.reader, NOW)
      await first.settle()
      const filled = kv(feed.key, '{"ok":1}', meta(1))
      const second = makeCtx(feed.url)
      const res = await feed.serve(second.ctx, filled.reader, NOW)
      expect(res.status).toBe(200)
      expect(filled.reads).toHaveLength(1)
    },
  )

  it.each(FEEDS)(
    '$name reads KV once for a burst, the Cache API answers the rest',
    async (feed) => {
      const store = kv(feed.key, '{"ok":1}', meta(1))
      const first = makeCtx(feed.url)
      const a = await feed.serve(first.ctx, store.reader, NOW)
      await first.settle()
      expect(await a.text()).toBe('{"ok":1}')
      const second = makeCtx(feed.url)
      const b = await feed.serve(second.ctx, store.reader, NOW)
      expect(await b.text()).toBe('{"ok":1}')
      expect(store.reads).toHaveLength(1)
    },
  )
})
