/**
 * The orrery's satellite fetcher (#98): the body goes to the worker undecoded (a
 * Starlink group is 1.7 MB of JSON, too much to parse on the main thread), with the
 * age and degraded flags read from the headers like every other /api fetcher.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HttpError } from '@/lib/api/client'
import { fetchOrrerySatsBody } from '@/lib/api/orrerySats'
import { loadSatWorker } from '@/lib/orbit/bulk/loadSatWorker'

describe('fetchOrrerySatsBody', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the group and returns the raw bytes with age and degraded flags', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response('{"rows":[]}', {
          status: 200,
          headers: { 'X-Data-Age': '7200', 'X-Data-Degraded': '1' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const got = await fetchOrrerySatsBody('starlink')
    expect(fetchMock).toHaveBeenCalledWith('/api/orrery-sats?group=starlink', undefined)
    expect(new TextDecoder().decode(got.body)).toBe('{"rows":[]}')
    expect(got.dataAgeSeconds).toBe(7200)
    expect(got.degraded).toBe(true)
  })

  it('throws an HttpError on a non-2xx answer', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 503 })))
    await expect(fetchOrrerySatsBody('stations')).rejects.toBeInstanceOf(HttpError)
  })
})

describe('loadSatWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('imports the worker client on first use and reuses one worker', async () => {
    class FakeWorker {
      onmessage = null
      postMessage() {
        return undefined
      }
      terminate() {
        return undefined
      }
    }
    vi.stubGlobal('Worker', FakeWorker)
    const a = await loadSatWorker()
    const b = await loadSatWorker()
    expect(a).toBe(b)
  })
})
