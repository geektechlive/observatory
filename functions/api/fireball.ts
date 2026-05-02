import type { PagesFunction } from '@cloudflare/workers-types'
import { FireballResponseSchema, type Fireball } from '../../src/schemas/fireball'

const FIREBALL_API = 'https://ssd-api.jpl.nasa.gov/fireball.api'
const CACHE_TTL_SECONDS = 3600 // 1 h

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

// Map columnar API response to named objects
function parseFireballData(fields: string[], rows: (string | null)[][]): Fireball[] {
  const idx = (name: string) => fields.indexOf(name)
  return rows.map((row) => ({
    date: row[idx('date')] ?? '',
    energy: row[idx('energy')] ?? null,
    impactE: row[idx('impact-e')] ?? null,
    lat: row[idx('lat')] ?? null,
    latDir: row[idx('lat-dir')] ?? null,
    lon: row[idx('lon')] ?? null,
    lonDir: row[idx('lon-dir')] ?? null,
    alt: row[idx('alt')] ?? null,
    vel: row[idx('vel')] ?? null,
  }))
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'nasa:fireball:recent30'

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

  const upstream = await fetch(`${FIREBALL_API}?limit=30`)

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream JPL Fireball API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw = (await upstream.json()) as {
    count?: string
    fields?: string[]
    data?: (string | null)[][]
  }

  const fireballs = parseFireballData(raw.fields ?? [], raw.data ?? [])
  const normalized = { count: raw.count ?? String(fireballs.length), data: fireballs }

  const parsed = FireballResponseSchema.safeParse(normalized)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const body = JSON.stringify(parsed.data)
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
