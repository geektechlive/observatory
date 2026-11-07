/**
 * /api/orrery-bodies (#93): passes the refresh job's finished body straight through from
 * KV, without parsing it (the Worker's 10 ms CPU), and says how old it is from the KV
 * metadata written with it.
 */
import { describe, expect, it } from 'vitest'

import { KV_ORRERY_BODIES_KEY, serveOrreryBodies } from '../../../functions/api/orrery-bodies'

const NOW = Date.parse('2026-11-06T12:00:00.000Z')
const HOUR = 3_600_000

function kv(value: string | null, metadata: unknown) {
  return {
    getWithMetadata: (key: string, opts: { type: string }) => {
      expect(key).toBe(KV_ORRERY_BODIES_KEY)
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

const call = (store: ReturnType<typeof kv>) => serveOrreryBodies(store, NOW)

const meta = (hoursOld: number) => ({
  fetchedAt: new Date(NOW - hoursOld * HOUR).toISOString(),
  bodies: 17,
  missing: 0,
})

describe('/api/orrery-bodies', () => {
  it('passes a fresh body through as is, with its age', async () => {
    // Not JSON on purpose: the handler must never parse what it serves.
    const res = await call(kv('{"bodies": not-parsed}', meta(6)))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"bodies": not-parsed}')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('X-Data-Age')).toBe(String(6 * 3600))
    expect(res.headers.get('X-Data-Source')).toBe('kv')
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
    expect(res.headers.get('Cache-Control')).toMatch(/max-age=\d+/)
  })

  it('serves a copy older than 72 h marked degraded and upstream-caused (#71)', async () => {
    const res = await call(kv('{}', meta(73)))
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get('X-Data-Source')).toBe('kv-backup')
  })

  it('treats a copy with no readable age as degraded, not fresh', async () => {
    const res = await call(kv('{}', null))
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })

  it('answers our JSON 503 (never 502/504, #61) when KV has nothing yet', async () => {
    const res = await call(kv(null, null))
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect((await res.json<{ error: string }>()).error).toMatch(/not yet/)
  })
})
