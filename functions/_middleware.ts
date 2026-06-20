import type { PagesFunction } from '@cloudflare/workers-types'

const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute in ms

interface RateLimitEntry {
  count: number
  windowStart: number
}

// Best-effort in-memory rate limiter, scoped to the current Worker isolate.
// Deliberately NOT backed by KV: a per-request KV write blew the free-tier
// 1,000 writes/day budget (every /api/ hit was a write). This costs zero KV.
// Caveat: state is per-isolate, not global — it throttles a single abuser
// hammering one colo, and Cloudflare's platform DDoS protection covers the rest.
const buckets = new Map<string, RateLimitEntry>()

function isRateLimited(ip: string, now: number): boolean {
  const entry = buckets.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    // Drop entries whose window has lapsed so the Map can't grow unbounded across
    // the isolate's lifetime (the KV version relied on TTL for this).
    if (buckets.size > 1000) {
      for (const [key, e] of buckets) {
        if (now - e.windowStart > RATE_LIMIT_WINDOW) buckets.delete(key)
      }
    }
    buckets.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT_MAX
}

export const onRequest: PagesFunction = async (context) => {
  const { request, next } = context

  if (request.url.includes('/api/')) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (isRateLimited(ip, Date.now())) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      })
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
