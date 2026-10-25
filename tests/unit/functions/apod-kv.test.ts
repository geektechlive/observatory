/**
 * /api/apod is KV-first (#72). The refresh job reads science.nasa.gov/apod into KV
 * because NASA's APOD API now answers a placeholder (title "NASA Science", the NASA
 * logo as url). Order: a fresh KV copy, NASA's API, the older KV copy degraded.
 */
import { describe, expect, it, vi } from 'vitest'

import type { CacheableResult } from '../../../functions/api/_cache'
import { KV_APOD_FRESH_SECONDS, KV_APOD_KEY, produceApod } from '../../../functions/api/apod'

const NOW = Date.parse('2026-10-25T13:00:00Z')

const SCIENCE = {
  date: '2026-10-25',
  title: 'Dark Matter in a Simulated Universe',
  explanation: 'Is our universe haunted? It might look that way on this dark matter map.',
  url: 'https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2021/october/DarkMatter.jpg',
  hdurl:
    'https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2021/october/DarkMatter.jpg',
  media_type: 'image',
  service_version: 'science.nasa.gov',
}
const PLACEHOLDER = {
  date: '2026-10-25',
  title: 'NASA Science',
  explanation: 'Is our universe haunted?',
  url: 'https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png',
  hdurl: 'https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png',
  media_type: 'image',
  service_version: 'v1',
}
const NASA_OK = {
  ...SCIENCE,
  url: 'https://apod.nasa.gov/apod/image/2610/x.jpg',
  hdurl: undefined,
  service_version: 'v1',
}

const kvWith = (data: unknown, ageSeconds: number) => ({
  get: vi.fn(async (key: string) =>
    key === KV_APOD_KEY
      ? JSON.stringify({
          fetchedAt: new Date(NOW - ageSeconds * 1000).toISOString(),
          source: 'science.nasa.gov',
          data,
        })
      : null,
  ),
})
const nasa = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

type Ok = Exclude<CacheableResult, Response>
const asOk = (r: CacheableResult) => r as Ok

describe('produceApod (#72)', () => {
  it('serves a fresh KV copy without calling NASA', async () => {
    const fetchImpl = nasa(200, NASA_OK)
    const out = asOk(await produceApod(kvWith(SCIENCE, 3600), 'k', fetchImpl, NOW))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.parse(out.body)).toMatchObject({ title: SCIENCE.title, url: SCIENCE.url })
    expect(out.extraHeaders?.['X-Data-Source']).toBe('kv')
    expect(out.degraded).not.toBe(true)
  })

  it('falls through to NASA when the KV copy is older than its fresh window', async () => {
    const out = asOk(
      await produceApod(kvWith(SCIENCE, KV_APOD_FRESH_SECONDS + 60), 'k', nasa(200, NASA_OK), NOW),
    )
    expect(JSON.parse(out.body)).toMatchObject({ url: NASA_OK.url })
    expect(out.extraHeaders?.['X-Data-Source']).toBe('nasa-api')
  })

  it("calls NASA's logo placeholder a contract failure when there is no KV copy", async () => {
    const out = await produceApod(undefined, 'k', nasa(200, PLACEHOLDER), NOW)
    expect(out).toBeInstanceOf(Response)
    expect((out as Response).status).toBe(500)
    expect((out as Response).headers.get('X-Error-Kind')).toBe('contract')
  })

  it('serves the older KV copy degraded, saying why, when NASA answers the placeholder', async () => {
    const out = asOk(
      await produceApod(kvWith(SCIENCE, 30 * 3600), 'k', nasa(200, PLACEHOLDER), NOW),
    )
    expect(JSON.parse(out.body)).toMatchObject({ title: SCIENCE.title })
    expect(out.degraded).toBe(true)
    expect(out.extraHeaders).toMatchObject({
      'X-Data-Source': 'kv-backup',
      'X-Error-Kind': 'contract',
    })
  })

  it('serves the older KV copy degraded as upstream-caused when NASA is down', async () => {
    const out = asOk(await produceApod(kvWith(SCIENCE, 30 * 3600), 'k', nasa(500, 'down'), NOW))
    expect(out.degraded).toBe(true)
    expect(out.extraHeaders?.['X-Error-Kind']).toBe('upstream')
  })

  it('ignores a KV copy that fails the schema', async () => {
    const out = asOk(await produceApod(kvWith({ title: 1 }, 60), 'k', nasa(200, NASA_OK), NOW))
    expect(out.extraHeaders?.['X-Data-Source']).toBe('nasa-api')
  })

  it('never passes an image host outside the allowlist, from either source', async () => {
    const bad = {
      ...SCIENCE,
      url: 'https://evil.example/x.jpg',
      hdurl: 'https://evil.example/x.jpg',
    }
    const out = asOk(await produceApod(kvWith(bad, 60), 'k', nasa(200, NASA_OK), NOW))
    expect(JSON.parse(out.body).url).toBeNull()
  })
})
