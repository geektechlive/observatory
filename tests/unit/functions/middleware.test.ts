import { describe, expect, it } from 'vitest'

import { onRequest } from '../../../functions/_middleware.ts'

type FakeContext = {
  request: Request
  next: () => Promise<Response>
  env: Record<string, never>
  waitUntil: (promise: Promise<unknown>) => void
}

function makeContext(request: Request, next: () => Promise<Response>): FakeContext {
  return {
    request,
    next,
    env: {},
    waitUntil: () => {
      // no-op for tests
    },
  }
}

function okNext(): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function htmlNext(): Promise<Response> {
  return Promise.resolve(
    new Response('<!DOCTYPE html><html><body>SPA fallback</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  )
}

// The rate limiter's bucket Map is module-scoped, so each test that exercises
// it needs a distinct IP to avoid cross-test contamination.
let ipCounter = 0
function nextTestIp(): string {
  ipCounter += 1
  return `203.0.113.${ipCounter}`
}

describe('functions/_middleware onRequest', () => {
  it('passes through GET /api/x with security headers applied', async () => {
    const request = new Request('https://observatory.example/api/x', {
      method: 'GET',
      headers: { 'CF-Connecting-IP': nextTestIp() },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await onRequest(makeContext(request, okNext) as any)

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('rejects POST /api/x with a 405 and Allow header', async () => {
    const request = new Request('https://observatory.example/api/x', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextTestIp() },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await onRequest(makeContext(request, okNext) as any)

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET, HEAD')
    const body = await response.json()
    expect(body).toEqual({ error: 'Method not allowed' })
  })

  it('rewrites an HTML SPA-fallback response for /api/nope into a JSON 404', async () => {
    const request = new Request('https://observatory.example/api/nope', {
      method: 'GET',
      headers: { 'CF-Connecting-IP': nextTestIp() },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await onRequest(makeContext(request, htmlNext) as any)

    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    const body = await response.json()
    expect(body).toEqual({ error: 'Not found' })
  })

  it('does not treat a query string containing /api/x as an API path', async () => {
    const request = new Request('https://observatory.example/?redirect=/api/x', {
      method: 'GET',
      headers: { 'CF-Connecting-IP': nextTestIp() },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await onRequest(makeContext(request, htmlNext) as any)

    // Not an /api/ path, so the HTML response should pass through unchanged
    // (aside from the security headers applied to every response).
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/html')
  })

  describe('rate limiting', () => {
    it('returns 429 with security headers on the 61st request from one IPv4 within the window', async () => {
      const ip = nextTestIp()
      let response: Response | undefined

      for (let i = 0; i < 61; i += 1) {
        const request = new Request('https://observatory.example/api/x', {
          method: 'GET',
          headers: { 'CF-Connecting-IP': ip },
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response = await onRequest(makeContext(request, okNext) as any)
      }

      expect(response).toBeDefined()
      expect(response?.status).toBe(429)
      expect(response?.headers.get('Retry-After')).toBe('60')
      expect(response?.headers.get('X-Content-Type-Options')).toBe('nosniff')
      const body = await response?.json()
      expect(body).toEqual({ error: 'Rate limit exceeded' })
    })

    it('shares a rate-limit bucket across two IPv6 addresses in the same /64', async () => {
      const ipA = '2001:db8:1234:5678:aaaa:bbbb:cccc:0001'
      const ipB = '2001:db8:1234:5678:ffff:ffff:ffff:ffff'

      // Exhaust the bucket using ipA.
      for (let i = 0; i < 60; i += 1) {
        const request = new Request('https://observatory.example/api/x', {
          method: 'GET',
          headers: { 'CF-Connecting-IP': ipA },
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await onRequest(makeContext(request, okNext) as any)
      }

      // ipB shares the same first 4 hextets, so it should already be over
      // the limit and get a 429 on its very first request.
      const request = new Request('https://observatory.example/api/x', {
        method: 'GET',
        headers: { 'CF-Connecting-IP': ipB },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await onRequest(makeContext(request, okNext) as any)

      expect(response.status).toBe(429)
    })
  })
})
