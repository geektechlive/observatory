import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { parseHorizons } from '../../src/lib/horizons'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

// JPL Horizons wraps its fixed-width ephemeris table in a JSON `result` string.
const HorizonsRawSchema = z.object({ result: z.string().optional() })

// JPL Horizons geocentric ephemerides for the planets, Moon and Sun. Public, no key.
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const CACHE_TTL_SECONDS = 3600 // 1h
const FAN_OUT_TIMEOUT_MS = 12000

const BODIES: { name: string; id: string }[] = [
  { name: 'Sun', id: '10' },
  { name: 'Moon', id: '301' },
  { name: 'Mercury', id: '199' },
  { name: 'Venus', id: '299' },
  { name: 'Mars', id: '499' },
  { name: 'Jupiter', id: '599' },
  { name: 'Saturn', id: '699' },
  { name: 'Uranus', id: '799' },
  { name: 'Neptune', id: '899' },
]

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

async function fetchBody(
  name: string,
  id: string,
  start: string,
  stop: string,
): Promise<{
  name: string
  raHours: number
  decDeg: number
  mag: number | null
  elongation: number
} | null> {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: id,
    EPHEM_TYPE: 'OBSERVER',
    CENTER: '500@399',
    START_TIME: start,
    STOP_TIME: stop,
    STEP_SIZE: '1d',
    QUANTITIES: "'1,9,23'",
  })
  try {
    const res = await fetchUpstream(
      `${HORIZONS}?${params.toString()}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'observatory.geektechlive.com' } },
      { timeoutMs: FAN_OUT_TIMEOUT_MS },
    )
    if (!res.ok) return null
    const parsedJson = HorizonsRawSchema.safeParse(await res.json())
    if (!parsedJson.success || !parsedJson.data.result) return null
    const obs = parseHorizons(parsedJson.data.result)
    if (!obs) return null
    return {
      name,
      raHours: obs.raHours,
      decDeg: obs.decDeg,
      mag: Number.isFinite(obs.mag) ? obs.mag : null,
      elongation: obs.elongation,
    }
  } catch {
    return null
  }
}

export const onRequest: PagesFunction = (ctx) => {
  const start = ymd(new Date())
  return cachedJson(ctx, `horizons:planets:${start}`, CACHE_TTL_SECONDS, async () => {
    const stop = ymd(new Date(Date.now() + 86_400_000))
    const results = await Promise.all(BODIES.map((b) => fetchBody(b.name, b.id, start, stop)))
    const bodies = results.filter((b): b is NonNullable<typeof b> => b !== null)
    const degraded = bodies.length < BODIES.length

    if (bodies.length === 0) return upstreamError(502, 'JPL Horizons unavailable')

    return {
      body: JSON.stringify({ bodies, updatedAt: new Date().toISOString() }),
      degraded,
    }
  })
}
