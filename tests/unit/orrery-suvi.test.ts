import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SunImage, type SunImageState } from '@/components/orrery/three/sunImage'
import { latestSuviFrame, SUVI_LIST_URL, SUVI_REFRESH_MS } from '@/lib/orrery/suvi'

const FRAME = (s: string, e: string) => ({
  url: `/images/animations/suvi/primary/171/or_suvi-l2-ci171_g19_s${s}Z_e${e}Z_v1-0-2.png`,
})

describe('SUVI frame list (#105)', () => {
  it('takes the newest frame and its observation window from the file name', () => {
    const frame = latestSuviFrame([
      FRAME('20261107T021600', '20261107T022000'),
      FRAME('20261107T022000', '20261107T022400'),
    ])
    expect(frame?.url).toBe(
      'https://services.swpc.noaa.gov/images/animations/suvi/primary/171/or_suvi-l2-ci171_g19_s20261107T022000Z_e20261107T022400Z_v1-0-2.png',
    )
    expect(frame?.start.toISOString()).toBe('2026-11-07T02:20:00.000Z')
    expect(frame?.end.toISOString()).toBe('2026-11-07T02:24:00.000Z')
    expect(frame?.satellite).toBe('GOES-19')
  })

  it('returns null for a list it cannot read, so the Sun stays a flat disc', () => {
    expect(latestSuviFrame([])).toBeNull()
    expect(latestSuviFrame({ nope: 1 })).toBeNull()
    expect(latestSuviFrame([{ url: '/images/animations/suvi/primary/171/latest.png' }])).toBeNull()
    expect(
      latestSuviFrame([{ url: 'https://evil.example/x_s20261107T022000Z_e20261107T022400Z.png' }]),
    ).toBeNull()
  })

  it('reads the list from NOAA and refreshes every 10 minutes', () => {
    expect(SUVI_LIST_URL).toBe(
      'https://services.swpc.noaa.gov/products/animations/suvi-primary-171.json',
    )
    expect(SUVI_REFRESH_MS).toBe(600_000)
  })

  // Dev ignores _headers, so only production would break.
  it('lets the browser fetch the list and load the image under the CSP', () => {
    const headers = readFileSync(resolve(__dirname, '../../public/_headers'), 'utf8')
    const directive = (name: string) =>
      (new RegExp(`${name} ([^;]+);`).exec(headers)?.[1] ?? '').split(/\s+/)
    expect(directive('img-src')).toContain('https://services.swpc.noaa.gov')
    expect(directive('connect-src')).toContain('https://services.swpc.noaa.gov')
  })
})

describe('SunImage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const list = [FRAME('20261107T022000', '20261107T022400')]
  const okFetch = () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(list) } as unknown as Response)

  it('falls back to the flat disc when the image fails to load', async () => {
    const states: SunImageState[] = []
    const sun = new SunImage({
      fetchJson: okFetch,
      loadImage: () => Promise.reject(new Error('network')),
      onChange: (s) => states.push(s),
    })
    await sun.refresh()
    expect(states.at(-1)).toEqual({ kind: 'fallback', reason: 'The live image did not load.' })
    sun.stop()
  })

  it('falls back when the list fails', async () => {
    const states: SunImageState[] = []
    const sun = new SunImage({
      fetchJson: () => Promise.resolve({ ok: false, status: 503 } as Response),
      loadImage: () => Promise.reject(new Error('unused')),
      onChange: (s) => states.push(s),
    })
    await sun.refresh()
    expect(states.at(-1)?.kind).toBe('fallback')
    sun.stop()
  })

  it('reports the frame it loaded with its observation time', async () => {
    const states: SunImageState[] = []
    const image = { width: 1280, height: 1280 } as unknown as HTMLImageElement
    const sun = new SunImage({
      fetchJson: okFetch,
      loadImage: () => Promise.resolve(image),
      onChange: (s) => states.push(s),
    })
    await sun.refresh()
    const last = states.at(-1)
    expect(last?.kind).toBe('live')
    if (last?.kind === 'live') {
      expect(last.image).toBe(image)
      expect(last.frame.end.toISOString()).toBe('2026-11-07T02:24:00.000Z')
    }
    sun.stop()
  })

  it('refreshes on a 10-minute timer only while started', async () => {
    vi.useFakeTimers()
    const fetchJson = vi.fn(okFetch)
    const sun = new SunImage({
      fetchJson,
      loadImage: () => Promise.reject(new Error('x')),
      onChange: () => undefined,
    })
    sun.start()
    expect(fetchJson).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(SUVI_REFRESH_MS)
    expect(fetchJson).toHaveBeenCalledTimes(2)
    sun.stop()
    await vi.advanceTimersByTimeAsync(SUVI_REFRESH_MS * 3)
    expect(fetchJson).toHaveBeenCalledTimes(2)
  })
})
