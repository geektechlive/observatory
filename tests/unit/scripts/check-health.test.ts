import { describe, expect, it, vi } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { isTransient, runWithRetry } from '../../../scripts/check-health.mjs'

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
})
