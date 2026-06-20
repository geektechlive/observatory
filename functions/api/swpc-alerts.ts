import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'
import { cachedJson } from './_cache'

// NOAA SWPC space-weather alerts/watches/warnings feed. Public, no key.
const SOURCE = 'https://services.swpc.noaa.gov/products/alerts.json'
const CACHE_TTL_SECONDS = 600 // 10 min
const MAX_ALERTS = 10

const RawSchema = z.array(
  z.object({
    product_id: z.string().optional(),
    issue_datetime: z.string().optional(),
    message: z.string().optional(),
  }),
)

// Pull the human-readable headline line out of the teletype message.
function summarize(message: string): string {
  const lines = message.split('\n').map((l) => l.trim())
  const headline = lines.find((l) => /^(ALERT|WATCH|WARNING|SUMMARY|EXTENDED|CONTINUED)/i.test(l))
  if (headline) return headline.replace(/\s+/g, ' ').slice(0, 120)
  return lines.find((l) => l.length > 0)?.slice(0, 120) ?? 'Space weather alert'
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'noaa:swpc-alerts:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetch(SOURCE)
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Upstream SWPC alerts error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const parsed = RawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid upstream response' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const alerts = parsed.data
      .slice(-MAX_ALERTS)
      .reverse()
      .map((a) => ({
        productId: a.product_id ?? '',
        issued: a.issue_datetime ?? '',
        summary: a.message ? summarize(a.message) : 'Space weather alert',
      }))

    return { body: JSON.stringify({ alerts, updatedAt: new Date().toISOString() }) }
  })
