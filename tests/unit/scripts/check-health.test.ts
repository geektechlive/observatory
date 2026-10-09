import { describe, expect, it, vi } from 'vitest'

import {
  isTransient,
  judgeStale,
  NEG_RETRY_DELAY_MS,
  retryDelayMs,
  runWithRetry,
  STALE_GRACE_SECONDS,
  toReport,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/check-health.mjs'

/** Shape of a single check result, as runCheck produces it. */
const result = (over: Record<string, unknown> = {}) => ({
  path: '/api/eonet',
  ok: false,
  status: 503,
  ms: 8222,
  note: 'HTTP 503',
  ...over,
})

describe('isTransient', () => {
  it('treats a timeout or network failure (status 0) as transient', () => {
    expect(isTransient(result({ status: 0, note: 'timeout after 15000 ms' }))).toBe(true)
  })

  it('treats upstream 5xx as transient', () => {
    // Our own handlers normalize upstream failures to 502/503 — the exact
    // shape of the 2026-09-10 EONET blip, which recovered on its own.
    for (const status of [500, 502, 503, 504]) {
      expect(isTransient(result({ status })), `status ${String(status)}`).toBe(true)
    }
  })

  it('treats rate limiting as transient', () => {
    expect(isTransient(result({ status: 429 }))).toBe(true)
  })

  it('does NOT treat a content-contract failure as transient', () => {
    // A 200 that is missing required fields is upstream drift, not a blip.
    // Retrying it would only delay a real alert.
    expect(
      isTransient(result({ status: 200, note: 'missing currentKp and windSpeed present' })),
    ).toBe(false)
  })

  it('does NOT treat a degraded response as transient', () => {
    expect(isTransient(result({ status: 200, note: 'degraded (kv)' }))).toBe(false)
  })

  it('does NOT treat a 404 as transient', () => {
    expect(isTransient(result({ status: 404, note: 'HTTP 404' }))).toBe(false)
  })

  it('does NOT treat a 502 the handler marked as a contract failure as transient', () => {
    // A schema failure inside the handler is shape drift wearing a 5xx.
    expect(isTransient(result({ status: 502, errorKind: 'contract' }))).toBe(false)
  })

  it('never reports a passing check as transient', () => {
    expect(isTransient(result({ ok: true, status: 200, note: 'ok' }))).toBe(false)
  })
})

describe('runWithRetry', () => {
  const noDelay = () => 0

  it('returns immediately when the first attempt passes', async () => {
    const runOnce = vi.fn().mockResolvedValue(result({ ok: true, status: 200, note: 'ok' }))

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(1)
    expect(out.ok).toBe(true)
    expect(out.attempts).toBe(1)
  })

  it('retries a transient failure and passes when the retry succeeds', async () => {
    const runOnce = vi
      .fn()
      .mockResolvedValueOnce(result({ status: 503 }))
      .mockResolvedValueOnce(result({ ok: true, status: 200, note: 'ok' }))

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(2)
    expect(out.ok).toBe(true)
    // The recovery is recorded so a flaky endpoint stays visible in the table
    // instead of silently passing as if nothing happened.
    expect(out.attempts).toBe(2)
  })

  it('does not retry a contract failure', async () => {
    const runOnce = vi
      .fn()
      .mockResolvedValue(result({ status: 200, note: 'missing line1 and line2 present' }))

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(1)
    expect(out.ok).toBe(false)
  })

  it('gives up after the attempt budget and reports the failure', async () => {
    const runOnce = vi.fn().mockResolvedValue(result({ status: 503 }))

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(3)
    expect(out.ok).toBe(false)
    expect(out.attempts).toBe(3)
  })

  it('passes the failed result to the delay so a NEG replay can wait it out', async () => {
    const neg = result({ status: 502, cache: 'NEG' })
    const runOnce = vi
      .fn()
      .mockResolvedValueOnce(neg)
      .mockResolvedValueOnce(result({ ok: true, status: 200, note: 'ok' }))
    const delayMs = vi.fn(() => 0)

    await runWithRetry(runOnce, { attempts: 3, delayMs })

    expect(delayMs).toHaveBeenCalledWith(2, neg)
  })
})

describe('retryDelayMs', () => {
  it('waits out the 60 s negative cache when the failure was a NEG replay', () => {
    // 2026-10-06: '/api/eonet 502 69ms (after 3 attempts)': all three attempts
    // replayed one cached error because the backoff (2 s, 5 s) sat inside its TTL.
    expect(NEG_RETRY_DELAY_MS).toBeGreaterThan(60_000)
    expect(retryDelayMs(2, result({ cache: 'NEG' }))).toBe(NEG_RETRY_DELAY_MS)
    expect(retryDelayMs(3, result({ cache: 'NEG' }))).toBe(NEG_RETRY_DELAY_MS)
  })

  it('keeps the short backoff for a live failure', () => {
    expect(retryDelayMs(2, result({ cache: 'MISS' }))).toBe(2_000)
    expect(retryDelayMs(3, result({ cache: null }))).toBe(5_000)
  })
})

describe('judgeStale', () => {
  it('passes a fresh (non-STALE) response untouched', () => {
    expect(judgeStale({ cache: 'HIT', errorKind: null, dataAge: 10 })).toEqual({ ok: true })
  })

  it('passes a recent upstream-caused STALE response with a warning', () => {
    const out = judgeStale({
      cache: 'STALE',
      errorKind: 'upstream',
      dataAge: 600,
      staleStatus: '503',
    })
    expect(out.ok).toBe(true)
    expect(out.warning).toMatch(/stale/)
  })

  it('fails a STALE response older than the grace window', () => {
    const out = judgeStale({
      cache: 'STALE',
      errorKind: 'upstream',
      dataAge: (STALE_GRACE_SECONDS as number) + 1,
      staleStatus: '503',
    })
    expect(out.ok).toBe(false)
  })

  it('fails a STALE response caused by a contract failure at any age', () => {
    const out = judgeStale({
      cache: 'STALE',
      errorKind: 'contract',
      dataAge: 5,
      staleStatus: '502',
    })
    expect(out.ok).toBe(false)
    expect(out.note).toMatch(/contract/)
  })
})

describe('toReport', () => {
  it('emits one signature per endpoint with pass/fail and the table detail', () => {
    const out = toReport([
      { path: '/api/eonet', ok: false, status: 502, ms: 69, note: 'HTTP 502', attempts: 3 },
      { path: '/api/neo', ok: true, status: 200, ms: 300, note: 'MISS', attempts: 1 },
    ])
    expect(out).toEqual([
      { signature: 'health:/api/eonet', ok: false, detail: expect.stringContaining('HTTP 502') },
      { signature: 'health:/api/neo', ok: true, detail: expect.any(String) },
    ])
  })

  it('flags a pass that rode on a STALE fallback as a warning, not a recovery', () => {
    const [entry] = toReport([
      {
        path: '/api/eonet',
        ok: true,
        status: 200,
        ms: 40,
        note: 'STALE / stale 600s (upstream: HTTP 503)',
        warning: 'stale 600s (upstream: HTTP 503)',
        attempts: 1,
      },
    ])
    expect(entry).toMatchObject({ ok: true, warning: true })
  })
})
