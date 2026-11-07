/**
 * /api/orrery-smallbodies (#99): passes the refresh job's comets and interstellar
 * objects straight through from KV, without parsing them, and says how old they are
 * from the KV metadata, like /api/orrery-bodies. Spans run 30 days either side, so
 * 72 h is its limit.
 */
import { describe, expect, it } from 'vitest'

import {
  KV_ORRERY_SMALLBODIES_KEY,
  serveOrrerySmallBodies,
} from '../../../functions/api/orrery-smallbodies'

const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const HOUR = 3_600_000

function kv(value: string | null, metadata: unknown) {
  return {
    getWithMetadata: (key: string, opts: { type: string }) => {
      expect(key).toBe(KV_ORRERY_SMALLBODIES_KEY)
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

const call = (store: ReturnType<typeof kv>) => serveOrrerySmallBodies(store, NOW)

const meta = (hoursOld: number) => ({
  fetchedAt: new Date(NOW - hoursOld * HOUR).toISOString(),
  comets: 12,
  interstellar: 3,
  placed: 15,
  missing: 0,
})

describe('/api/orrery-smallbodies', () => {
  it('uses its own KV key', () => {
    expect(KV_ORRERY_SMALLBODIES_KEY).toBe('horizons:smallbodies:v1')
  })

  it('passes a fresh body through as is, with its age', async () => {
    const res = await call(kv('{"comets": not-parsed}', meta(6)))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"comets": not-parsed}')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('X-Data-Age')).toBe(String(6 * 3600))
    expect(res.headers.get('X-Data-Source')).toBe('kv')
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
  })

  it('serves a copy older than 72 h marked degraded and upstream-caused (#71)', async () => {
    const fresh = await call(kv('{}', meta(71)))
    expect(fresh.headers.get('X-Data-Degraded')).toBeNull()
    const res = await call(kv('{}', meta(73)))
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
