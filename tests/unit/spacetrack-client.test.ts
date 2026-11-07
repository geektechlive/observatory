/**
 * The client side of /api/spacetrack and /api/discos (#101): the fetchers check the
 * payloads against their schemas. The fixtures are the bodies the live dry run built on
 * 2026-11-07 (tests/unit/fixtures/spacetrack, /discos).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchDiscosEnvelope,
  fetchSatcatShard,
  fetchSpaceTrackEnvelope,
  satcatEntry,
} from '@/lib/api/spaceTrack'

const fixture = (dir: string, name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', dir, name), 'utf8'))

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchSpaceTrackEnvelope', () => {
  it('reads the catalogue the refresh job built', async () => {
    const fetchMock = mockFetch(200, fixture('spacetrack', 'catalog-payload.json'))
    vi.stubGlobal('fetch', fetchMock)
    const { data } = await fetchSpaceTrackEnvelope()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/spacetrack?part=catalog')
    expect(data.tip?.reentries[0]?.noradId).toBe('45532')
    expect(data.boxscore?.inOrbit.debris).toBe(12545)
    expect(data.names['45700']).toBe('STARLINK-1400')
  })

  it('rejects a payload of the wrong shape', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { tip: 'nope' }))
    await expect(fetchSpaceTrackEnvelope()).rejects.toThrow()
  })
})

describe('the SATCAT entry for a satellite', () => {
  it('asks the shard its NORAD number falls in and finds its row', async () => {
    const rows = [
      ['25544', '1998-067A', 'PAYLOAD', 'CIS', '1998-11-20', 'TTMTR', 'LARGE'],
      ['25560', '1998-067B', 'DEBRIS', 'US', '1998-11-20', 'TTMTR', 'SMALL'],
    ]
    const fetchMock = mockFetch(200, {
      generatedAt: '2026-11-07T22:23:18.626Z',
      citation: 'Space-Track.org (USSPACECOM)',
      shard: 8,
      rows,
    })
    vi.stubGlobal('fetch', fetchMock)
    const shard = await fetchSatcatShard(8)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/spacetrack?part=satcat&shard=8')
    expect(satcatEntry(shard, '25544')).toEqual({
      noradId: '25544',
      intlDes: '1998-067A',
      objectType: 'PAYLOAD',
      country: 'CIS',
      launch: '1998-11-20',
      site: 'TTMTR',
      rcsSize: 'LARGE',
    })
    expect(satcatEntry(shard, '1')).toBeNull()
  })
})

describe('fetchDiscosEnvelope', () => {
  it('reads the DISCOS facts the refresh job built', async () => {
    vi.stubGlobal('fetch', mockFetch(200, fixture('discos', 'discos-payload.json')))
    const { data } = await fetchDiscosEnvelope()
    expect(data.craft['-31']?.massKg).toBe(817.64)
    expect(data.satellites['25544']?.name).toBe('International Space Station')
  })
})
