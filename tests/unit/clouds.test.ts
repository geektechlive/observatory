/**
 * Cloud cover for the Tonight panel (#79), from Open-Meteo. The fixture is a real
 * answer for Kansas City (39.1, -94.6), fetched 2026-10-28.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { cloudsUrl, fetchClouds } from '@/lib/api/clouds'
import { evaluateSource } from '@/lib/health'
import { cloudCoverAt } from '@/lib/tonight'

import FIXTURE from './fixtures/open-meteo-clouds.json'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cloudsUrl', () => {
  it('sends only the rounded location and asks for hourly cloud cover in UTC', () => {
    const url = new URL(cloudsUrl(39.0997, -94.5786))
    expect(url.origin).toBe('https://api.open-meteo.com')
    expect(url.searchParams.get('latitude')).toBe('39.1')
    expect(url.searchParams.get('longitude')).toBe('-94.6')
    expect(url.searchParams.get('hourly')).toBe('cloud_cover')
    expect(url.searchParams.get('timeformat')).toBe('unixtime')
  })
})

describe('fetchClouds', () => {
  it('parses the hourly series', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(FIXTURE))),
    )
    const { data } = await fetchClouds(39.1, -94.6)
    expect(data.hourly.time).toHaveLength(48)
    expect(data.hourly.cloud_cover[0]).toBe(45)
  })
})

describe('cloudCoverAt', () => {
  const series = FIXTURE.hourly

  it('gives the forecast for the hour a slot falls in', () => {
    const t0 = series.time[0] ?? 0
    expect(cloudCoverAt(series, new Date(t0 * 1000))).toBe(45)
    expect(cloudCoverAt(series, new Date((t0 + 4 * 3600 + 1200) * 1000))).toBe(93)
  })

  it('is null outside the forecast, or where a value is missing', () => {
    expect(cloudCoverAt(series, new Date(0))).toBeNull()
    expect(cloudCoverAt({ time: [1000], cloud_cover: [null] }, new Date(1_000_000))).toBeNull()
  })
})

describe('weather contract', () => {
  it('needs a non-empty hourly series', () => {
    const fresh = { degraded: false, dataAgeSeconds: null }
    expect(evaluateSource('weather', FIXTURE, fresh)).toBe('ok')
    expect(evaluateSource('weather', { hourly: { time: [], cloud_cover: [] } }, fresh)).toBe(
      'error',
    )
  })
})

describe('content security policy (#79)', () => {
  it('lets the browser reach Open-Meteo: dev ignores _headers, so only production would break', () => {
    const headers = readFileSync(resolve(__dirname, '../../public/_headers'), 'utf8')
    const connect = /connect-src ([^;]+);/.exec(headers)?.[1] ?? ''
    expect(connect.split(/\s+/)).toContain('https://api.open-meteo.com')
  })
})
