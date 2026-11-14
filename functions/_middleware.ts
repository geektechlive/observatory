import type { PagesFunction } from '@cloudflare/workers-types'

import { visitorKey } from './api/_ip'

const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute in ms
/**
 * Any other host (the project's pages.dev one and its preview hosts) sits outside the
 * zone's rate-limit and cache rules, and its name is public in every commit's Pages check
 * run (#235): only this per-isolate limit stands there, so it is tighter.
 */
const OTHER_HOST_RATE_LIMIT_MAX = 10
/** Hosts the zone's rules cover, plus local development. */
const ZONE_HOSTS = new Set(['observatory.geektechlive.com', 'localhost', '127.0.0.1'])
const ALLOWED_METHODS = ['GET', 'HEAD', 'OPTIONS']

interface RateLimitEntry {
  count: number
  windowStart: number
}

// Best-effort in-memory rate limiter, scoped to the current Worker isolate.
// Deliberately NOT backed by KV: a per-request KV write blew the free-tier
// 1,000 writes/day budget (every /api/ hit was a write). This costs zero KV.
// Caveat: state is per-isolate, not global — it throttles a single abuser
// hammering one colo, and Cloudflare's platform DDoS protection covers the rest.
// The real enforcement boundary is a Cloudflare-native Rate Limiting rule
// scoped to /api/* at the zone/account level; this in-memory limiter is
// defense-in-depth only and should not be relied on as the primary control.
const buckets = new Map<string, RateLimitEntry>()

function isRateLimited(key: string, now: number, max: number): boolean {
  const entry = buckets.get(key)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    // Drop entries whose window has lapsed so the Map can't grow unbounded across
    // the isolate's lifetime (the KV version relied on TTL for this).
    if (buckets.size > 1000) {
      for (const [k, e] of buckets) {
        if (now - e.windowStart > RATE_LIMIT_WINDOW) buckets.delete(k)
      }
    }
    buckets.set(key, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  return entry.count > max
}

function withSecurityHeaders(response: Response): Response {
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

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

export const onRequest: PagesFunction = async (context) => {
  const { request, next } = context
  const { pathname, hostname } = new URL(request.url)
  const isApiPath = pathname.startsWith('/api/')
  const zoneHost = ZONE_HOSTS.has(hostname)

  if (isApiPath && !ALLOWED_METHODS.includes(request.method)) {
    return withSecurityHeaders(
      jsonResponse(405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' }),
    )
  }

  if (isApiPath) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    // Separate buckets, so a pages.dev script can't spend a visitor's custom-domain budget.
    const key = `${zoneHost ? 'zone' : 'other'}|${visitorKey(ip)}`
    const max = zoneHost ? RATE_LIMIT_MAX : OTHER_HOST_RATE_LIMIT_MAX
    if (isRateLimited(key, Date.now(), max)) {
      return withSecurityHeaders(
        jsonResponse(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '60' }),
      )
    }
  }

  const response = await next()

  if (isApiPath && (response.headers.get('Content-Type') ?? '').includes('text/html')) {
    // The SPA's catch-all index.html fallback matched an unhandled /api/*
    // path — surface a JSON 404 instead of leaking HTML to an API client.
    return withSecurityHeaders(jsonResponse(404, { error: 'Not found' }))
  }

  return withSecurityHeaders(response)
}
