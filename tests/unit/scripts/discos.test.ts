/**
 * The refresh job's DISCOSweb step (#101): the orrery craft by COSPAR id and chosen
 * satellites by NORAD number, a week between asks per object, a few paced requests a
 * run, the token only in the Authorization header. Answers are synthetic.
 */
import { describe, expect, it } from 'vitest'

import {
  buildDiscos,
  discosToken,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/discos.mjs'

const TOKEN = 'tok-not-real-123'
const NOW = Date.UTC(2026, 10, 8, 18, 17)

const CRAFT_NAMES: Record<string, string> = {
  '1977-084A': 'Voyager 1',
  '1977-076A': 'Voyager 2',
  '2021-130A': 'JWST',
}

interface Call {
  url: string
  auth: string | null
}

function fakeDiscos(opts: { status?: number } = {}) {
  const calls: Call[] = []
  const http = (url: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers)
    calls.push({ url, auth: h.get('Authorization') })
    if (opts.status) {
      return Promise.resolve(
        new Response('{}', { status: opts.status, headers: { 'Retry-After': '30' } }),
      )
    }
    const filter = new URL(url).searchParams.get('filter') ?? ''
    const data = filter.startsWith('in(cosparId')
      ? [...filter.matchAll(/'([^']+)'/g)].map((m, i) => ({
          type: 'object',
          id: `c${String(i)}`,
          attributes: {
            cosparId: m[1],
            // One wrong answer: Voyager 2's id comes back named Voyager 1.
            name:
              m[1] === '1977-076A'
                ? 'Voyager 1'
                : (CRAFT_NAMES[m[1] ?? ''] ?? `Craft ${m[1] ?? ''}`),
            mass: 700,
          },
          relationships: { operators: { data: [] } },
        }))
      : [...(/\(([\d,]+)\)/.exec(filter)?.[1]?.split(',') ?? [])].map((n) => ({
          type: 'object',
          id: `s${n}`,
          attributes: { satno: Number(n), name: `SAT ${n}`, mass: 1000 },
          relationships: { operators: { data: [{ type: 'organisation', id: 'o1' }] } },
        }))
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data,
          included: [{ type: 'organisation', id: 'o1', attributes: { name: 'NASA' } }],
        }),
        { headers: { 'X-RateLimit-Limit': '20', 'X-RateLimit-Remaining': '19' } },
      ),
    )
  }
  return { http, calls }
}

describe('discosToken', () => {
  it('reads the token, or null', () => {
    expect(discosToken({ DISCOSWEB_TOKEN: ' x ' })).toBe('x')
    expect(discosToken({})).toBeNull()
  })
})

describe('buildDiscos', () => {
  it('asks for the craft once and the satellites in pages, with the token only as a Bearer header', async () => {
    const st = fakeDiscos()
    const satnos = Array.from({ length: 150 }, (_, i) => String(i + 1))
    const out = await buildDiscos({ now: NOW, token: TOKEN, http: st.http, satnos, pauseMs: 0 })
    expect(st.calls).toHaveLength(3)
    for (const c of st.calls) {
      expect(c.auth).toBe(`Bearer ${TOKEN}`)
      expect(c.url).not.toContain(TOKEN)
    }
    expect(out.payload.craft['-31'].name).toBe('Voyager 1')
    expect(out.payload.craft['-31'].fetchedAt).toBe(new Date(NOW).toISOString())
    expect(out.payload.satellites['25']).toMatchObject({
      name: 'SAT 25',
      massKg: 1000,
      operators: ['NASA'],
    })
    expect(Object.keys(out.payload.satellites)).toHaveLength(150)
    expect(out.changed).toBe(true)
    expect(JSON.stringify(out.payload)).not.toContain(TOKEN)
  })

  it('drops a craft whose answer names another object, and says so', async () => {
    const out = await buildDiscos({
      now: NOW,
      token: TOKEN,
      http: fakeDiscos().http,
      satnos: [],
      pauseMs: 0,
    })
    expect(out.payload.craft['-32']).toBeUndefined()
    expect(out.payload.missing.map((m: { id: string }) => m.id)).toContain('craft:-32')
  })

  it('asks nothing for objects fetched in the last week', async () => {
    const first = await buildDiscos({
      now: NOW,
      token: TOKEN,
      http: fakeDiscos().http,
      satnos: ['5'],
      pauseMs: 0,
    })
    const st = fakeDiscos()
    const out = await buildDiscos({
      now: NOW + 86_400_000,
      token: TOKEN,
      http: st.http,
      satnos: ['5'],
      previous: first.payload,
      pauseMs: 0,
    })
    // Voyager 2 failed its check, so only it is asked again.
    expect(st.calls).toHaveLength(1)
    expect(st.calls[0]?.url).toContain('1977-076A')
    expect(out.payload.satellites['5'].fetchedAt).toBe(first.payload.satellites['5'].fetchedAt)
  })

  it('forgets satellites no longer asked about', async () => {
    const first = await buildDiscos({
      now: NOW,
      token: TOKEN,
      http: fakeDiscos().http,
      satnos: ['5', '6'],
      pauseMs: 0,
    })
    const out = await buildDiscos({
      now: NOW + 1000,
      token: TOKEN,
      http: fakeDiscos().http,
      satnos: ['6'],
      previous: first.payload,
      pauseMs: 0,
    })
    expect(Object.keys(out.payload.satellites)).toEqual(['6'])
  })

  it('stops at a 429 and keeps what it had', async () => {
    const out = await buildDiscos({
      now: NOW,
      token: TOKEN,
      http: fakeDiscos({ status: 429 }).http,
      satnos: ['5'],
      pauseMs: 0,
    })
    expect(out.payload.missing[0].reason).toMatch(/429/)
  })

  it('caps the requests per run', async () => {
    const st = fakeDiscos()
    const satnos = Array.from({ length: 900 }, (_, i) => String(i + 1))
    await buildDiscos({ now: NOW, token: TOKEN, http: st.http, satnos, pauseMs: 0, maxRequests: 4 })
    expect(st.calls).toHaveLength(4)
  })
})
