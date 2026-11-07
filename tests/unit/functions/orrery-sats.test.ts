/**
 * /api/orrery-sats?group= (#98): streams one CelesTrak group the refresh job stored in
 * KV, unparsed, the way /api/orrery-bodies does. Only the stored groups are allowed;
 * past 36 h a copy is degraded.
 */
import { describe, expect, it } from 'vitest'

import { FRESH_SECONDS, serveOrrerySats } from '../../../functions/api/orrery-sats'

const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const HOUR = 3_600_000

function kv(value: string | null, metadata: unknown, seen: string[] = []) {
  return {
    getWithMetadata: (key: string, opts: { type: string }) => {
      seen.push(key)
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

const meta = (hoursOld: number) => ({
  fetchedAt: new Date(NOW - hoursOld * HOUR).toISOString(),
  count: 19,
  bytes: 3135,
})
const url = (group: string | null) =>
  `https://observatory.geektechlive.com/api/orrery-sats${group === null ? '' : `?group=${group}`}`

describe('/api/orrery-sats', () => {
  it('reads the group key the refresh job writes', async () => {
    const seen: string[] = []
    const res = await serveOrrerySats(
      url('starlink'),
      kv('{"rows": not-parsed}', meta(2), seen),
      NOW,
    )
    expect(seen).toEqual(['celestrak:gp:starlink:v1'])
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"rows": not-parsed}')
    expect(res.headers.get('X-Data-Age')).toBe(String(2 * 3600))
    expect(res.headers.get('X-Data-Source')).toBe('kv')
  })

  it('is degraded, upstream-caused, past 36 h (#71)', async () => {
    expect(FRESH_SECONDS).toBe(36 * 3600)
    const res = await serveOrrerySats(url('stations'), kv('{}', meta(37)), NOW)
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })

  it('answers our 503 while the group is not in KV yet', async () => {
    const res = await serveOrrerySats(url('weather'), kv(null, null), NOW)
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })

  it('refuses an unknown or missing group without touching KV', async () => {
    for (const group of ['active', 'tle:iss', '../x', '', null]) {
      const seen: string[] = []
      const res = await serveOrrerySats(url(group), kv('{}', meta(1), seen), NOW)
      expect(res.status).toBe(400)
      expect(seen).toEqual([])
      const body: { error: string } = await res.json()
      expect(body.error).toMatch(/group/)
    }
  })
})
