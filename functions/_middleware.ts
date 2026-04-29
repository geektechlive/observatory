import type { PagesFunction } from '@cloudflare/workers-types'

const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute in ms

interface RateLimitEntry {
  count: number
  windowStart: number
}

export const onRequest: PagesFunction = async (context) => {
  const { request, next, env } = context

  // Rate limiting — per-IP token bucket stored in KV
  const ip =
    request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? 'unknown'

  if (request.url.includes('/api/')) {
    const kvKey = `rate:${ip}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (env as unknown as Record<string, any>)['OBSERVATORY_CACHE']

    if (kv) {
      const raw: string | null = await kv.get(kvKey)
      const now = Date.now()
      const entry: RateLimitEntry = raw
        ? (JSON.parse(raw) as RateLimitEntry)
        : { count: 0, windowStart: now }

      if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
        entry.count = 0
        entry.windowStart = now
      }

      entry.count++

      if (entry.count > RATE_LIMIT_MAX) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        })
      }

      await kv.put(kvKey, JSON.stringify(entry), { expirationTtl: 120 })
    }
  }

  const response = await next()

  // Security headers (supplement _headers file for API routes)
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Frame-Options', 'DENY')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
