/**
 * /api/orrery-neo (#92): passes the refresh job's close-approach body straight through
 * from KV, without parsing it, and says how old it is from the KV metadata, the same
 * way /api/orrery-bodies does. The approach list changes daily, so 36 h is its limit.
 */
import { describe, expect, it } from 'vitest'

import { KV_ORRERY_NEO_KEY, serveOrreryNeo } from '../../../functions/api/orrery-neo'

const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const HOUR = 3_600_000

function kv(value: string | null, metadata: unknown) {
  return {
    getWithMetadata: (key: string, opts: { type: string }) => {
      expect(key).toBe(KV_ORRERY_NEO_KEY)
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
  }
}

const call = (store: ReturnType<typeof kv>) => serveOrreryNeo(store, NOW)

const meta = (hoursOld: number) => ({
  fetchedAt: new Date(NOW - hoursOld * HOUR).toISOString(),
  approaches: 25,
  placed: 25,
  scout: 80,
  missing: 0,
})

describe('/api/orrery-neo', () => {
  it('uses its own KV key', () => {
    expect(KV_ORRERY_NEO_KEY).toBe('horizons:neo:v1')
  })

  it('passes a fresh body through as is, with its age', async () => {
    const res = await call(kv('{"approaches": not-parsed}', meta(6)))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"approaches": not-parsed}')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('X-Data-Age')).toBe(String(6 * 3600))
    expect(res.headers.get('X-Data-Source')).toBe('kv')
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
  })

  it('serves a copy older than 36 h marked degraded and upstream-caused (#71)', async () => {
    const res = await call(kv('{}', meta(37)))
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get('X-Data-Source')).toBe('kv-backup')
  })

  it('treats a copy with no readable age as degraded, not fresh', async () => {
    const res = await call(kv('{}', null))
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
  })

  it('answers our JSON 503 (never 502/504, #61) when KV has nothing yet', async () => {
    const res = await call(kv(null, null))
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect((await res.json<{ error: string }>()).error).toMatch(/not yet/)
  })
})
