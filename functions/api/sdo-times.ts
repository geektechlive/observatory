import type { PagesFunction } from '@cloudflare/workers-types'

import { SDO_TIME_FILES, type SdoChannel, sdoStamp, type SdoTimes } from '../../src/lib/sdoTimes'
import { cachedJson, contractError, fetchUpstream, upstreamError } from './_cache'

// SDO's per-channel observation times (#73). The files send no CORS header, so the
// browser can't read them directly. Each is ~25 bytes; SDO updates them every few minutes.
const BASE = 'https://sdo.gsfc.nasa.gov/assets/img/latest/'
const CACHE_TTL_SECONDS = 300

async function readStamp(file: string): Promise<{ fetched: boolean; stamp: string | null }> {
  try {
    const res = await fetchUpstream(BASE + file)
    if (!res.ok) return { fetched: false, stamp: null }
    return { fetched: true, stamp: sdoStamp(await res.text()) }
  } catch {
    return { fetched: false, stamp: null }
  }
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'sdo:times:v1', CACHE_TTL_SECONDS, async () => {
    const channels = Object.keys(SDO_TIME_FILES) as SdoChannel[]
    const results = await Promise.all(channels.map((c) => readStamp(SDO_TIME_FILES[c])))

    if (results.every((r) => !r.fetched)) return upstreamError(0, 'SDO times unavailable')
    if (results.every((r) => r.stamp === null)) return contractError('No SDO time stamps parsed')

    const times = Object.fromEntries(channels.map((c, i) => [c, results[i]?.stamp ?? null]))
    return {
      body: JSON.stringify({ times: times as SdoTimes, updatedAt: new Date().toISOString() }),
      degraded: results.some((r) => r.stamp === null),
    }
  })
