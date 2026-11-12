/**
 * Retrying the orrery's fetches after a rate limit or an outage (#141). Infrastructure
 * failures (0, 5xx, 429) are asked again, never contracts; a retry against a cached
 * endpoint must outlast its 60 s negative entry, and the Functions' rate limit answers
 * 429 with `Retry-After: 60`.
 */
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { LOOKUP_MAX_RETRIES, lookupRetryMs } from '@/hooks/useJplLookup'
import { bodiesRetryDelay, RATE_LIMIT_RETRY_MS } from '@/hooks/useOrreryBodies'
import { defaultRetry } from '@/hooks/useSourceQuery'
import { HttpError } from '@/lib/api/client'

describe('the bodies fetch after a 429 (#141)', () => {
  it('asks again after 61 s, past both rate limits', () => {
    expect(RATE_LIMIT_RETRY_MS).toBe(61_000)
    for (const attempt of [0, 1, 2]) {
      expect(bodiesRetryDelay(attempt, new HttpError(429, 'x'))).toBe(61_000)
    }
  })

  it('keeps the quick backoff for a 5xx (KV, no negative cache) or a dropped connection', () => {
    expect(bodiesRetryDelay(0, new HttpError(503, 'x'))).toBe(1000)
    expect(bodiesRetryDelay(2, new HttpError(500, 'x'))).toBe(4000)
    expect(bodiesRetryDelay(0, new TypeError('Failed to fetch'))).toBe(1000)
  })

  it('retries a 429 three times, as any infrastructure error, and never a contract', () => {
    // The app's rule (main.tsx's default), which the bodies query keeps.
    expect(defaultRetry(0, new HttpError(429, 'x'))).toBe(true)
    expect(defaultRetry(2, new HttpError(429, 'x'))).toBe(true)
    expect(defaultRetry(3, new HttpError(429, 'x'))).toBe(false)
    expect(defaultRetry(0, new ZodError([]))).toBe(false)
    expect(defaultRetry(0, new HttpError(400, 'x'))).toBe(false)
  })
})

describe('the lookup track after a busy answer or a 429 (#141)', () => {
  const busy = (retryAfterS?: number) =>
    retryAfterS === undefined
      ? ({ state: 'unavailable', reason: 'busy' } as const)
      : ({ state: 'unavailable', reason: 'busy', retryAfterS } as const)

  it('honours the wait it was given, 61 s for a replayed negative answer', () => {
    expect(lookupRetryMs(busy(61))).toBe(61_000)
    expect(lookupRetryMs(busy(60))).toBe(60_000)
    expect(lookupRetryMs(busy(20))).toBe(20_000)
  })

  it('waits 15 s when none was given, and never more than 2 minutes', () => {
    expect(lookupRetryMs(busy())).toBe(15_000)
    expect(lookupRetryMs(busy(900))).toBe(120_000)
  })

  it('asks again at most five times, then waits for the visitor (#141 review)', () => {
    for (const answers of [1, 2, 3, 4, 5]) expect(lookupRetryMs(busy(20), answers)).toBe(20_000)
    expect(lookupRetryMs(busy(20), 6)).toBe(false)
    expect(LOOKUP_MAX_RETRIES).toBe(5)
  })

  it('never asks again after an answer, or a failure that is not busy', () => {
    expect(lookupRetryMs(undefined)).toBe(false)
    expect(lookupRetryMs({ state: 'unavailable', reason: 'failed' })).toBe(false)
    expect(lookupRetryMs({ state: 'unavailable', reason: 'not-found' })).toBe(false)
  })
})
