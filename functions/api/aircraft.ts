import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// OpenSky Network live aircraft states (anonymous). Public, no key.
// Broad bbox (Americas + Atlantic + Europe) to keep one request reasonable.
const SOURCE = 'https://opensky-network.org/api/states/all?lamin=18&lomin=-130&lamax=62&lomax=40'
const CACHE_TTL_SECONDS = 60 // 1 min — anonymous OpenSky is rate-limited
const MAX_AIRCRAFT = 600

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

const RawSchema = z.object({
  states: z.array(z.array(z.unknown())).nullable(),
})

function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'opensky:aircraft:v1'

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

  const upstream = await fetch(SOURCE)
  if (!upstream.ok) {
    // OpenSky 429s easily — degrade to empty rather than erroring the layer.
    const empty = JSON.stringify({ aircraft: [], updatedAt: new Date().toISOString() })
    await env.OBSERVATORY_CACHE.put(kvKey, empty, { expirationTtl: CACHE_TTL_SECONDS })
    return new Response(empty, {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
        'X-Cache-TTL': String(CACHE_TTL_SECONDS),
      },
    })
  }

  const parsed = RawSchema.safeParse(await upstream.json())
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid upstream response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // OpenSky state vector: [icao,callsign,country,timePos,lastContact,lon,lat,
  //   baroAlt,onGround,vel,track,vrate,sensors,geoAlt,squawk,spi,posSource]
  const aircraft = (parsed.data.states ?? [])
    .flatMap((s) => {
      const lon = num(s[5])
      const lat = num(s[6])
      const onGround = s[8] === true
      if (lon === null || lat === null || onGround) return []
      return [
        {
          lat,
          lon,
          track: num(s[10]) ?? 0,
          altM: num(s[13]) ?? num(s[7]),
          callsign: typeof s[1] === 'string' ? s[1].trim() : '',
        },
      ]
    })
    .slice(0, MAX_AIRCRAFT)

  const body = JSON.stringify({ aircraft, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
