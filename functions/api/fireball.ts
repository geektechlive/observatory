import type { PagesFunction } from '@cloudflare/workers-types'
import { FireballResponseSchema, type Fireball } from '../../src/schemas/fireball'
import { cachedJson } from './_cache'

const FIREBALL_API = 'https://ssd-api.jpl.nasa.gov/fireball.api'
const CACHE_TTL_SECONDS = 3600 // 1 h

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

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'nasa:fireball:recent30', CACHE_TTL_SECONDS, async () => {
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

    return { body: JSON.stringify(parsed.data) }
  })
