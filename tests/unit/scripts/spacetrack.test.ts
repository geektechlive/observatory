/**
 * The refresh job's Space-Track step (#101): log in once, then TIP every run, the daily
 * classes after 17:00 UTC, and a few GP_HISTORY months, paced, inside a budget, and
 * never with the credentials anywhere but the login form. Space-Track's answers here
 * are synthetic (no live call was made while building this; see spacetrack.test.ts).
 */
import { describe, expect, it } from 'vitest'

import {
  buildSpaceTrack,
  spaceTrackCredentials,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/spacetrack.mjs'

const SECRET_USER = 'someone@example.invalid'
const SECRET_PASS = 'hunter2-not-real'
const CREDS = { identity: SECRET_USER, password: SECRET_PASS }

const tipRow = (id: string, decay: string) => ({
  NORAD_CAT_ID: id,
  MSG_EPOCH: '2026-11-08 12:00:00',
  INSERT_EPOCH: '2026-11-08 12:05:00',
  DECAY_EPOCH: decay,
  WINDOW: '1440',
  LAT: '10',
  LON: '20',
  HIGH_INTEREST: 'N',
})

const decayRow = (id: string, name: string, type: string, decay: string) => ({
  NORAD_CAT_ID: id,
  OBJECT_NAME: name,
  COUNTRY: 'US',
  MSG_EPOCH: '2026-11-08 17:30:00',
  DECAY_EPOCH: decay,
  MSG_TYPE: type,
})

const boxRow = {
  COUNTRY: 'ALL',
  ORBITAL_TBA: '677',
  ORBITAL_PAYLOAD_COUNT: '19870',
  ORBITAL_ROCKET_BODY_COUNT: '2434',
  ORBITAL_DEBRIS_COUNT: '12545',
  ORBITAL_TOTAL_COUNT: '35526',
  DECAYED_PAYLOAD_COUNT: '8415',
  DECAYED_ROCKET_BODY_COUNT: '4494',
  DECAYED_DEBRIS_COUNT: '22858',
  DECAYED_TOTAL_COUNT: '35767',
  COUNTRY_TOTAL: '71293',
}

const gpRow = (epoch: string) => ({
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  NORAD_CAT_ID: '25544',
  EPOCH: epoch,
  MEAN_MOTION: '15.5',
  ECCENTRICITY: '0.0005',
  INCLINATION: '51.64',
  RA_OF_ASC_NODE: '100',
  ARG_OF_PERICENTER: '90',
  MEAN_ANOMALY: '270',
  BSTAR: '0.0001',
  MEAN_MOTION_DOT: '0.0001',
  MEAN_MOTION_DDOT: '0',
})

interface Call {
  url: string
  method: string
  body: string
  cookie: string | null
  at: number
}

/** A fake Space-Track: one login, a session cookie, JSON answers per class. */
function fakeSpaceTrack(
  opts: { loginFails?: boolean; failClass?: string; clock?: () => number } = {},
) {
  const calls: Call[] = []
  const clock = opts.clock ?? (() => 0)
  const http = async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    calls.push({
      url,
      method: init.method ?? 'GET',
      body:
        init.body instanceof URLSearchParams
          ? init.body.toString()
          : typeof init.body === 'string'
            ? init.body
            : '',
      cookie: headers.get('Cookie'),
      at: clock(),
    })
    if (url.endsWith('/ajaxauth/login')) {
      if (opts.loginFails) return new Response('{"Login":"Failed"}', { status: 200 })
      return new Response('""', {
        status: 200,
        headers: { 'Set-Cookie': 'chocolatechip=abc123; path=/; secure; HttpOnly' },
      })
    }
    if (url.endsWith('/ajaxauth/logout')) return new Response('"Successfully logged out"')
    if (headers.get('Cookie') !== 'chocolatechip=abc123') return new Response('', { status: 401 })
    const cls = /\/class\/([a-z_]+)\//.exec(url)?.[1] ?? ''
    if (cls === opts.failClass) return new Response('busy', { status: 500 })
    const answers: Record<string, unknown> = {
      tip: [tipRow('45700', '2026-11-11 20:32:00'), tipRow('53740', '2026-11-09 18:29:00')],
      decay: [
        decayRow('45700', 'STARLINK-1400', 'Prediction', '2026-11-11 20:32:00'),
        decayRow('46563', 'STARLINK-1730', 'Historical', '2026-11-07 0:00:00'),
      ],
      boxscore: [boxRow],
      satcat: [
        { NORAD_CAT_ID: '25544', INTLDES: '1998-067A', OBJECT_TYPE: 'PAYLOAD', COUNTRY: 'ISS' },
        { NORAD_CAT_ID: '20580', INTLDES: '1990-037B', OBJECT_TYPE: 'PAYLOAD', COUNTRY: 'US' },
      ],
      gp_history: [gpRow('2026-10-01T06:00:00.000000'), gpRow('2026-10-02T06:00:00.000000')],
    }
    return new Response(JSON.stringify(answers[cls] ?? []), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { http, calls }
}

const AFTER_17 = Date.UTC(2026, 10, 8, 18, 17)
const BEFORE_17 = Date.UTC(2026, 10, 8, 6, 17)

describe('spaceTrackCredentials', () => {
  it('reads both, or none', () => {
    expect(spaceTrackCredentials({ SPACETRACK_USER: 'a', SPACETRACK_PASS: 'b' })).toEqual({
      identity: 'a',
      password: 'b',
    })
    expect(spaceTrackCredentials({ SPACETRACK_USER: 'a' })).toBeNull()
    expect(spaceTrackCredentials({ SPACETRACK_USER: ' ', SPACETRACK_PASS: 'b' })).toBeNull()
    expect(spaceTrackCredentials({})).toBeNull()
  })
})

describe('buildSpaceTrack', () => {
  it('after 17:00 UTC: logs in once, asks TIP, the three daily classes and history, then logs out', async () => {
    const st = fakeSpaceTrack()
    const out = await buildSpaceTrack({
      now: AFTER_17,
      credentials: CREDS,
      http: st.http,
      previous: { catalog: null, history: null },
      pauseMs: 0,
      minSatcatRows: 1,
    })
    const kinds = st.calls.map((c) =>
      /ajaxauth\/(\w+)|class\/(\w+)/.exec(c.url)?.slice(1).find(Boolean),
    )
    expect(kinds[0]).toBe('login')
    expect(kinds.at(-1)).toBe('logout')
    expect(kinds.filter((k) => k === 'login')).toHaveLength(1)
    expect(kinds).toEqual(
      expect.arrayContaining(['tip', 'satcat', 'boxscore', 'decay', 'gp_history']),
    )

    expect(out.catalog.tip.reentries.map((r: { noradId: string }) => r.noradId)).toEqual([
      '53740',
      '45700',
    ])
    expect(out.catalog.names['45700']).toBe('STARLINK-1400')
    expect(out.catalog.decays.recent.map((d: { noradId: string }) => d.noradId)).toEqual(['46563'])
    expect(out.catalog.boxscore.inOrbit.total).toBe(35526)
    expect(out.catalog.satcatAt).toBe(new Date(AFTER_17).toISOString())
    expect(out.satcat).toHaveLength(2)
    expect(
      out.history.objects.find((o: { noradId: string }) => o.noradId === '25544').months,
    ).toContain('2026-10')
    expect(out.catalog.missing).toEqual([])
  })

  it('before 17:00 UTC: only TIP, and the daily parts carry over from the last copy', async () => {
    const st = fakeSpaceTrack()
    const first = await buildSpaceTrack({
      now: AFTER_17,
      credentials: CREDS,
      http: fakeSpaceTrack().http,
      previous: { catalog: null, history: null },
      pauseMs: 0,
      historyPerRun: 0,
    })
    const out = await buildSpaceTrack({
      now: BEFORE_17 + 86_400_000,
      credentials: CREDS,
      http: st.http,
      previous: { catalog: first.catalog, history: null },
      pauseMs: 0,
      historyPerRun: 0,
    })
    const classes = st.calls.map((c) => /class\/(\w+)/.exec(c.url)?.[1]).filter(Boolean)
    expect(classes).toEqual(['tip'])
    expect(out.catalog.boxscore).toEqual(first.catalog.boxscore)
    expect(out.catalog.decays).toEqual(first.catalog.decays)
    expect(out.satcat).toBeNull()
    expect(out.history).toBeNull()
  })

  it('sends the credentials only in the login form, never in a URL or a later request', async () => {
    const st = fakeSpaceTrack()
    await buildSpaceTrack({
      now: AFTER_17,
      credentials: CREDS,
      http: st.http,
      previous: { catalog: null, history: null },
      pauseMs: 0,
    })
    const [login, ...rest] = st.calls
    expect(login?.method).toBe('POST')
    expect(login?.body).toContain('identity=')
    for (const c of st.calls) {
      expect(c.url).not.toContain(SECRET_PASS)
      expect(c.url).not.toContain('example.invalid')
    }
    for (const c of rest) {
      expect(c.body).not.toContain(SECRET_PASS)
      expect(c.cookie).toBe('chocolatechip=abc123')
    }
  })

  it('a failed login fails the step without saying the credentials', async () => {
    const st = fakeSpaceTrack({ loginFails: true })
    const err = await buildSpaceTrack({
      now: AFTER_17,
      credentials: CREDS,
      http: st.http,
      previous: { catalog: null, history: null },
      pauseMs: 0,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/login/i)
    expect((err as Error).message).not.toContain(SECRET_PASS)
    expect((err as Error).message).not.toContain(SECRET_USER)
  })

  it('one class failing ships the rest, lists it as missing and keeps its last copy', async () => {
    const first = await buildSpaceTrack({
      now: AFTER_17,
      credentials: CREDS,
      http: fakeSpaceTrack().http,
      previous: { catalog: null, history: null },
      pauseMs: 0,
      historyPerRun: 0,
    })
    const st = fakeSpaceTrack({ failClass: 'tip' })
    const out = await buildSpaceTrack({
      now: AFTER_17 + 6 * 3_600_000,
      credentials: CREDS,
      http: st.http,
      previous: { catalog: first.catalog, history: null },
      pauseMs: 0,
      historyPerRun: 0,
    })
    expect(out.catalog.missing.map((m: { id: string }) => m.id)).toEqual(['tip'])
    expect(out.catalog.tip).toEqual(first.catalog.tip)
  })

  it('paces its requests, well under 30 a minute', async () => {
    let t = 0
    const clock = () => t
    const st = fakeSpaceTrack({ clock })
    await buildSpaceTrack({
      now: AFTER_17,
      credentials: CREDS,
      http: st.http,
      previous: { catalog: null, history: null },
      pauseMs: 3000,
      sleep: (ms: number) => {
        t += ms
        return Promise.resolve()
      },
      clock,
    })
    const times = st.calls.map((c) => c.at)
    for (let i = 1; i < times.length; i += 1)
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(3000)
  })

  it('stops starting requests once its budget is spent, and still logs out', async () => {
    let t = 0
    const clock = () => t
    const st = fakeSpaceTrack({ clock })
    const out = await buildSpaceTrack({
      now: AFTER_17,
      credentials: CREDS,
      http: st.http,
      previous: { catalog: null, history: null },
      pauseMs: 3000,
      budgetMs: 7000,
      sleep: (ms: number) => {
        t += ms
        return Promise.resolve()
      },
      clock,
    })
    const kinds = st.calls.map((c) =>
      /ajaxauth\/(\w+)|class\/(\w+)/.exec(c.url)?.slice(1).find(Boolean),
    )
    expect(kinds.slice(0, 3)).toEqual(['login', 'tip', 'satcat'])
    expect(kinds.at(-1)).toBe('logout')
    expect(kinds).not.toContain('gp_history')
    // The daily classes it never reached stay due for the next run.
    expect(out.catalog.boxscore).toBeNull()
  })

  it('keeps the history it has and adds new months, each month asked once', async () => {
    const first = await buildSpaceTrack({
      now: AFTER_17,
      credentials: CREDS,
      http: fakeSpaceTrack().http,
      previous: { catalog: null, history: null },
      pauseMs: 0,
      historyPerRun: 1,
    })
    expect(first.history.objects[0].months).toEqual(['2026-10'])
    const st = fakeSpaceTrack()
    const second = await buildSpaceTrack({
      now: AFTER_17 + 6 * 3_600_000,
      credentials: CREDS,
      http: st.http,
      previous: { catalog: first.catalog, history: first.history },
      pauseMs: 0,
      historyPerRun: 1,
    })
    const asked = st.calls.filter((c) => c.url.includes('gp_history')).map((c) => c.url)
    expect(asked).toHaveLength(1)
    expect(asked[0]).not.toContain('2026-10-01--')
    const total = second.history.objects.reduce(
      (n: number, o: { months: string[] }) => n + o.months.length,
      0,
    )
    expect(total).toBe(2)
  })
})
