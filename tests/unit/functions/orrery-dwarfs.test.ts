/**
 * /api/orrery-dwarfs (#99 item 8): passes the refresh job's dwarf planets straight
 * through from KV, without parsing them, and says how old they are from the KV metadata,
 * like /api/orrery-smallbodies. Its own key and URL, so the Tonight panel's comets never
 * carry them. The job rewrites it every run, so past 72 h it is served degraded.
 */
import { describe, expect, it } from 'vitest'

import { KV_ORRERY_DWARFS_KEY, serveOrreryDwarfs } from '../../../functions/api/orrery-dwarfs'

const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const HOUR = 3_600_000

function kv(value: string | null, metadata: unknown) {
  return {
    getWithMetadata: (key: string, opts: { type: string }) => {
      expect(key).toBe(KV_ORRERY_DWARFS_KEY)
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

const call = (store: ReturnType<typeof kv>) => serveOrreryDwarfs(store, NOW)

const meta = (hoursOld: number) => ({
  fetchedAt: new Date(NOW - hoursOld * HOUR).toISOString(),
  dwarfs: 5,
  missing: 0,
})

describe('/api/orrery-dwarfs', () => {
  it('uses its own KV key', () => {
    expect(KV_ORRERY_DWARFS_KEY).toBe('horizons:dwarfs:v1')
  })

  it('passes a fresh body through as is, with its age', async () => {
    const res = await call(kv('{"dwarfs": not-parsed}', meta(6)))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"dwarfs": not-parsed}')
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
