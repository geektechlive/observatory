import type { PagesFunction } from '@cloudflare/workers-types'
import { parseHorizons } from '../../src/lib/horizons'

// JPL Horizons geocentric ephemerides for the planets, Moon and Sun. Public, no key.
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const CACHE_TTL_SECONDS = 3600 // 1h

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

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
    const res = await fetch(`${HORIZONS}?${params.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'observatory.geektechlive.com' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result?: string }
    if (!json.result) return null
    const obs = parseHorizons(json.result)
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

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const start = ymd(new Date())
  const kvKey = `horizons:planets:${start}`

  const cached: string | null = await env.OBSERVATORY_CACHE.get(kvKey)
  if (cached !== null) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Cache-TTL': String(CACHE_TTL_SECONDS),
      },
    })
  }

  const stop = ymd(new Date(Date.now() + 86_400_000))
  const results = await Promise.all(BODIES.map((b) => fetchBody(b.name, b.id, start, stop)))
  const bodies = results.filter((b): b is NonNullable<typeof b> => b !== null)

  if (bodies.length === 0) {
    return new Response(JSON.stringify({ error: 'Horizons unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = JSON.stringify({ bodies, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
