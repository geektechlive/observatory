/**
 * Every panel's retry wait (#218). Infrastructure failures (0, 5xx, 429) are asked again,
 * never contracts, and a retry must outlast what answered it: the Functions' rate limit
 * (60 a minute, `Retry-After: 60`), the zone's 10 s block, and `_cache.ts`'s 60 s negative
 * entry (`X-Cache: NEG`). Inside those, a 1, 2 and 4 s backoff only replays one answer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { defaultRetry, defaultRetryDelay, RATE_LIMIT_RETRY_MS } from '@/hooks/useSourceQuery'
import { getJsonMeta, HttpError } from '@/lib/api/client'

const answer = (status: number, headers: Record<string, string> = {}) =>
  new Response('{"error":"x"}', { status, headers })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HttpError keeps what a retry needs (#218)', () => {
  it("carries a 429's Retry-After and a negative-cache replay's X-Cache", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(429, { 'Retry-After': '60' })))
    const limited = await getJsonMeta('/api/x', z.object({})).catch((e: unknown) => e)
    expect(limited).toBeInstanceOf(HttpError)
    expect((limited as HttpError).retryAfterS).toBe(60)
    expect((limited as HttpError).negCached).toBe(false)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(503, { 'X-Cache': 'NEG' })))
    const neg = await getJsonMeta('/api/x', z.object({})).catch((e: unknown) => e)
    expect((neg as HttpError).negCached).toBe(true)
    expect((neg as HttpError).retryAfterS).toBeNull()
  })

  it('ignores a Retry-After it cannot read', () => {
    expect(new HttpError(429, 'x', answer(429, { 'Retry-After': 'soon' })).retryAfterS).toBeNull()
    // Only delta-seconds: no layer of ours sends an HTTP date; one falls back to the 61 s floor.
    const date = 'Wed, 21 Oct 2099 07:28:00 GMT'
    expect(new HttpError(429, 'x', answer(429, { 'Retry-After': date })).retryAfterS).toBeNull()
    expect(new HttpError(429, 'x').retryAfterS).toBeNull()
  })
})

describe('defaultRetryDelay (#218)', () => {
  it('waits 61 s after a 429 with no Retry-After (the zone rule sends none)', () => {
    expect(RATE_LIMIT_RETRY_MS).toBe(61_000)
    for (const attempt of [0, 1, 2]) {
      expect(defaultRetryDelay(attempt, new HttpError(429, 'x'))).toBe(61_000)
    }
  })

  it('honours a longer Retry-After, never a shorter one, and caps it at 2 minutes', () => {
    const after = (s: string) => new HttpError(429, 'x', answer(429, { 'Retry-After': s }))
    expect(defaultRetryDelay(0, after('60'))).toBe(61_000)
    expect(defaultRetryDelay(0, after('90'))).toBe(90_000)
    expect(defaultRetryDelay(0, after('3600'))).toBe(120_000)
  })

  it('waits out a negative-cache replay of a 5xx', () => {
    const neg = new HttpError(503, 'x', answer(503, { 'X-Cache': 'NEG' }))
    expect(defaultRetryDelay(0, neg)).toBe(61_000)
  })

  it('keeps the quick backoff for a 5xx with no negative entry, or a dropped connection', () => {
    expect(defaultRetryDelay(0, new HttpError(503, 'x'))).toBe(1000)
    expect(defaultRetryDelay(1, new HttpError(500, 'x'))).toBe(2000)
    expect(defaultRetryDelay(2, new HttpError(503, 'x'))).toBe(4000)
    expect(defaultRetryDelay(0, new TypeError('Failed to fetch'))).toBe(1000)
    expect(defaultRetryDelay(10, new TypeError('Failed to fetch'))).toBe(30_000)
  })

  it('still retries a 429 at most three times', () => {
    expect(defaultRetry(2, new HttpError(429, 'x'))).toBe(true)
    expect(defaultRetry(3, new HttpError(429, 'x'))).toBe(false)
  })
})

describe('defaultRetry: infrastructure, never contracts (#218)', () => {
  const kind = (status: number, k: string) =>
    new HttpError(status, 'x', answer(status, { 'X-Error-Kind': k }))

  it('retries a dropped connection, a 502, 503, 504 and a 429', () => {
    expect(defaultRetry(0, new TypeError('Failed to fetch'))).toBe(true)
    for (const status of [502, 503, 504, 429]) {
      expect(defaultRetry(0, new HttpError(status, 'x')), String(status)).toBe(true)
    }
    expect(defaultRetry(0, kind(503, 'upstream'))).toBe(true)
  })

  it("never retries a 500, our contractError's status", () => {
    expect(defaultRetry(0, new HttpError(500, 'x'))).toBe(false)
    expect(defaultRetry(0, kind(500, 'contract'))).toBe(false)
  })

  it('never retries an answer marked X-Error-Kind: contract, whatever its status', () => {
    expect(kind(503, 'contract').contract).toBe(true)
    expect(defaultRetry(0, kind(503, 'contract'))).toBe(false)
  })

  it('never retries a body that fails its schema in the client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"n":"not a number"}', { status: 200 })),
    )
    const err = await getJsonMeta('/api/x', z.object({ n: z.number() })).catch(
      (e: unknown) => e as Error,
    )
    expect(defaultRetry(0, err as Error)).toBe(false)
  })

  it('never retries a 400', () => {
    expect(defaultRetry(0, new HttpError(400, 'x'))).toBe(false)
  })
})
