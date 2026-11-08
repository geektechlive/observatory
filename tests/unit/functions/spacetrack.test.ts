/**
 * /api/spacetrack and /api/discos (#101): the refresh job's Space-Track and DISCOSweb
 * bodies, streamed through from KV unparsed, with an allow-listed part and shard.
 */
import { describe, expect, it } from 'vitest'

import { serveDiscos } from '../../../functions/api/discos'
import { serveSpaceTrack } from '../../../functions/api/spacetrack'

const NOW = Date.parse('2026-11-08T12:00:00.000Z')
const HOUR = 3_600_000

function kv(seen: string[], hoursOld = 1) {
  return {
    getWithMetadata: (key: string) => {
      seen.push(key)
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(`{"key":"${key}"}`))
          c.close()
        },
      })
      return Promise.resolve({
        value: stream,
        metadata: { fetchedAt: new Date(NOW - hoursOld * HOUR).toISOString() },
      })
    },
  }
}

const url = (q: string) => `https://observatory.geektechlive.com/api/spacetrack${q}`

describe('/api/spacetrack', () => {
  it('serves the catalogue by default and by name', async () => {
    const seen: string[] = []
    expect((await serveSpaceTrack(url(''), kv(seen), NOW)).status).toBe(200)
    expect((await serveSpaceTrack(url('?part=catalog'), kv(seen), NOW)).status).toBe(200)
    expect(seen).toEqual(['spacetrack:catalog:v1', 'spacetrack:catalog:v1'])
  })

  it('serves one SATCAT shard, 0 to 15', async () => {
    const seen: string[] = []
    const res = await serveSpaceTrack(url('?part=satcat&shard=9'), kv(seen), NOW)
    expect(res.status).toBe(200)
    expect(seen).toEqual(['spacetrack:satcat:v1:9'])
  })

  it('refuses an unknown part or a shard out of range, without touching KV', async () => {
    const seen: string[] = []
    for (const q of [
      '?part=keys',
      '?part=satcat',
      '?part=satcat&shard=16',
      '?part=satcat&shard=1x',
    ]) {
      expect((await serveSpaceTrack(url(q), kv(seen), NOW)).status).toBe(400)
    }
    expect(seen).toEqual([])
  })

  it('calls a catalogue older than 36 h degraded, a shard older than 72 h', async () => {
    const old = await serveSpaceTrack(url('?part=catalog'), kv([], 37), NOW)
    expect(old.headers.get('X-Data-Degraded')).toBe('1')
    const shard = await serveSpaceTrack(url('?part=satcat&shard=0'), kv([], 37), NOW)
    expect(shard.headers.get('X-Data-Degraded')).toBeNull()
  })

  it('never calls the history degraded: it is the past, and does not change', async () => {
    const res = await serveSpaceTrack(url('?part=history'), kv([], 24 * 400), NOW)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
  })
})

describe('/api/discos', () => {
  it('serves discos:objects:v1, degraded past 14 days', async () => {
    const seen: string[] = []
    const res = await serveDiscos(kv(seen, 24 * 10), NOW)
    expect(res.status).toBe(200)
    expect(seen).toEqual(['discos:objects:v1'])
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
    expect((await serveDiscos(kv([], 24 * 15), NOW)).headers.get('X-Data-Degraded')).toBe('1')
  })
})
