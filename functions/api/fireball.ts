import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { type Fireball, FireballResponseSchema } from '../../src/schemas/fireball'
import { cachedJson, contractError, upstreamError } from './_cache'
import { askJplFeed, type JplEnv } from './_jpl'

const FIREBALL_API = 'https://ssd-api.jpl.nasa.gov/fireball.api'
const CACHE_TTL_SECONDS = 3600 // 1 h

// Map columnar API response to named objects
// JPL returns a column-oriented table: `fields` names the columns, `data` holds the rows.
const FireballRawSchema = z.object({
  count: z.string().optional(),
  fields: z.array(z.string()).optional(),
  data: z.array(z.array(z.string().nullable())).optional(),
})

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

export const onRequest: PagesFunction<JplEnv> = (ctx) =>
  cachedJson(ctx, 'nasa:fireball:recent30', CACHE_TTL_SECONDS, async () => {
    // Only a cache miss reaches JPL, through the jpl-queue when it is bound (#146).
    const reply = await askJplFeed(ctx.env.JPL_QUEUE, `${FIREBALL_API}?limit=30`)
    if (!reply.ok) return reply.response
    if (reply.status !== 200) return upstreamError(reply.status, 'JPL Fireball upstream error')

    const rawParsed = FireballRawSchema.safeParse(JSON.parse(reply.text))
    if (!rawParsed.success) {
      console.warn('[fireball] invalid upstream response', rawParsed.error.issues)
      return contractError('Invalid JPL Fireball response')
    }
    const raw = rawParsed.data

    const fireballs = parseFireballData(raw.fields ?? [], raw.data ?? [])
    const normalized = { count: raw.count ?? String(fireballs.length), data: fireballs }

    const parsed = FireballResponseSchema.safeParse(normalized)
    if (!parsed.success) {
      console.warn('[fireball] invalid upstream response', parsed.error.issues)
      return contractError('Invalid Fireball response')
    }

    const body = { ...parsed.data, updatedAt: new Date().toISOString() }
    return { body: JSON.stringify(body) }
  })
