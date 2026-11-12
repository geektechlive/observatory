import type { PagesFunction } from '@cloudflare/workers-types'

import { parseProbabilities, parseRegions } from '../../src/lib/swpcRegions'
import { cachedJson, contractError, type ErrorKind, fetchUpstream, upstreamError } from './_cache'

// NOAA SWPC's numbered active regions and its flare odds (#210). Public domain, no key
// (https://www.weather.gov/disclaimer). Both files are small enough to parse on a request:
// regions is ~104 kB of ~180 rows covering 30 days, and JSON.parse plus the newest-day
// filter measured about 0.1 ms (docs/reference/data-feeds-and-monitoring.md).
const PROBABILITIES_FEED = 'https://services.swpc.noaa.gov/json/solar_probabilities.json'
const REGIONS_FEED = 'https://services.swpc.noaa.gov/json/solar_regions.json'
// SWPC compiles the region summary at 00:30 UTC and the odds at 22:00 UTC, but the regions
// file also changes during the day as observatory reports come in (#213: 06:12 on 12 Nov).
const CACHE_TTL_SECONDS = 30 * 60
const DEGRADED_TTL_SECONDS = 120

type Half<T> = { ok: true; value: T } | { ok: false; kind: ErrorKind; status: number }

async function fetchHalf<T>(url: string, parse: (json: unknown) => T | null): Promise<Half<T>> {
  try {
    const res = await fetchUpstream(url)
    if (!res.ok) return { ok: false, kind: 'upstream', status: res.status }
    const value = parse(await res.json())
    return value === null ? { ok: false, kind: 'contract', status: 200 } : { ok: true, value }
  } catch (err) {
    // An HTML or truncated 200 fails JSON.parse: the shape changed, not an outage.
    if (err instanceof SyntaxError) return { ok: false, kind: 'contract', status: 200 }
    return { ok: false, kind: 'upstream', status: 503 }
  }
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'noaa:solar-regions:v2', CACHE_TTL_SECONDS, async () => {
    const [odds, regions] = await Promise.all([
      fetchHalf(PROBABILITIES_FEED, parseProbabilities),
      fetchHalf(REGIONS_FEED, parseRegions),
    ])
    const kinds: ErrorKind[] = []
    if (!odds.ok) kinds.push(odds.kind)
    if (!regions.ok) kinds.push(regions.kind)
    if (!odds.ok && !regions.ok) {
      // Contract only when both changed shape; any outage is worth a retry.
      return kinds.every((k) => k === 'contract')
        ? contractError('SWPC solar regions and probabilities changed shape')
        : upstreamError(
            // The half that was down, not a 200 from a half that merely changed shape.
            regions.kind === 'upstream' ? regions.status : odds.status,
            'SWPC solar regions and probabilities unavailable',
          )
    }
    const kind: ErrorKind = kinds.includes('contract') ? 'contract' : 'upstream'
    return {
      body: JSON.stringify({
        probabilities: odds.ok ? odds.value : null,
        regions: regions.ok ? regions.value : null,
        updatedAt: new Date().toISOString(),
      }),
      degraded: kinds.length > 0,
      // A half answer is retried in two minutes instead of standing for the half hour.
      ...(kinds.length > 0 ? { ttl: DEGRADED_TTL_SECONDS } : {}),
      // A half answer says which half failed and why, or its outage pages at once.
      ...(kinds.length > 0
        ? { extraHeaders: { 'X-Error-Kind': kind, 'X-Data-Source': 'swpc' } }
        : {}),
    }
  })
