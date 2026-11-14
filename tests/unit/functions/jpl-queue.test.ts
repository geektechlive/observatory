import { describe, expect, it, vi } from 'vitest'

import {
  type BudgetStore,
  DailyBudget,
  LOOKUP_DAILY_LIMIT,
  TOTAL_DAILY_LIMIT,
  TRAJECTORY_DAILY_LIMIT,
} from '../../../workers/jpl-queue/src/budget'
import { ClientLimit } from '../../../workers/jpl-queue/src/clientLimit'
import { handleQueueRequest, type QueueDeps } from '../../../workers/jpl-queue/src/handler'
import { fetchJpl, isJplUrl, JplFetchError } from '../../../workers/jpl-queue/src/jplFetch'
import { QueueFullError, SerialQueue } from '../../../workers/jpl-queue/src/queue'

// The jpl-queue Durable Object's parts (#100). JPL's Fair Use: "only one API request at a
// time (no simultaneous requests)", and Horizons answers 503 to overlapping calls (#88).

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('SerialQueue', () => {
  it('runs tasks one at a time, in arrival order, even when callers arrive together', async () => {
    const q = new SerialQueue({ maxPending: 10, minGapMs: 0 })
    let running = 0
    let most = 0
    const order: number[] = []
    const gates = [deferred<undefined>(), deferred<undefined>(), deferred<undefined>()]
    const tasks = gates.map((g, i) =>
      q.run(async () => {
        running += 1
        most = Math.max(most, running)
        order.push(i)
        await g.promise
        running -= 1
        return i
      }),
    )
    await tick()
    expect(order).toEqual([0])
    gates[0]?.resolve(undefined)
    await tick()
    await tick()
    expect(order).toEqual([0, 1])
    gates[1]?.resolve(undefined)
    gates[2]?.resolve(undefined)
    expect(await Promise.all(tasks)).toEqual([0, 1, 2])
    expect(most).toBe(1)
  })

  it('keeps going after a task fails', async () => {
    const q = new SerialQueue({ maxPending: 10, minGapMs: 0 })
    const failed = q.run(() => Promise.reject(new Error('boom')))
    const next = q.run(() => Promise.resolve('ok'))
    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
    expect(q.pending).toBe(0)
  })

  it('spaces task starts by minGapMs', async () => {
    let t = 1000
    const sleeps: number[] = []
    const q = new SerialQueue({
      maxPending: 10,
      minGapMs: 1000,
      now: () => t,
      sleep: (ms) => {
        sleeps.push(ms)
        t += ms
        return Promise.resolve()
      },
    })
    await q.run(() => {
      t += 200
      return Promise.resolve()
    })
    await q.run(() => Promise.resolve())
    expect(sleeps).toEqual([800])
  })

  it('refuses past maxPending, with a retry estimate, and counts the running task', async () => {
    const q = new SerialQueue({ maxPending: 2, minGapMs: 0, taskSeconds: 3 })
    const gate = deferred<undefined>()
    const a = q.run(() => gate.promise)
    const b = q.run(() => Promise.resolve())
    expect(q.isFull()).toBe(true)
    let refused: unknown
    try {
      await q.run(() => Promise.resolve())
    } catch (e) {
      refused = e
    }
    expect(refused).toBeInstanceOf(QueueFullError)
    expect((refused as QueueFullError).retryAfterSeconds).toBe(6)
    gate.resolve(undefined)
    await Promise.all([a, b])
    expect(q.isFull()).toBe(false)
  })
})

describe('isJplUrl', () => {
  it('lets only JPL hosts over https through', () => {
    expect(isJplUrl('https://ssd.jpl.nasa.gov/api/horizons.api?format=json')).toBe(true)
    expect(isJplUrl('https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=eros')).toBe(true)
    expect(isJplUrl('http://ssd-api.jpl.nasa.gov/sbdb.api')).toBe(false)
    expect(isJplUrl('https://ssd-api.jpl.nasa.gov.evil.example/sbdb.api')).toBe(false)
    expect(isJplUrl('https://example.com/?u=https://ssd.jpl.nasa.gov')).toBe(false)
    expect(isJplUrl('https://user@ssd.jpl.nasa.gov/api/horizons.api')).toBe(false)
    expect(isJplUrl('not a url')).toBe(false)
  })
})

describe('fetchJpl', () => {
  const url = 'https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=eros'
  const answer = (status: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ status }), { status, headers })

  it('returns the first answer that is not 503 or 429', async () => {
    const fetch = vi.fn().mockResolvedValue(answer(300, { 'Content-Type': 'application/json' }))
    const out = await fetchJpl(url, { fetch, sleep: () => Promise.resolve() })
    expect(out).toEqual({
      status: 300,
      body: '{"status":300}',
      contentType: 'application/json',
      attempts: 1,
    })
  })

  it('backs off on 503 and 429, honouring a short Retry-After', async () => {
    const sleeps: number[] = []
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(answer(503))
      .mockResolvedValueOnce(answer(429, { 'Retry-After': '4' }))
      .mockResolvedValueOnce(answer(200))
    const out = await fetchJpl(url, {
      fetch,
      sleep: (ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      },
    })
    expect(out.status).toBe(200)
    expect(out.attempts).toBe(3)
    expect(sleeps).toEqual([2000, 4000])
  })

  it('caps a long Retry-After and gives up after its retries', async () => {
    const sleeps: number[] = []
    const fetch = vi.fn().mockResolvedValue(answer(503, { 'Retry-After': '600' }))
    const out = await fetchJpl(url, {
      fetch,
      sleep: (ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      },
    })
    expect(out.status).toBe(503)
    expect(out.attempts).toBe(3)
    expect(sleeps).toEqual([10_000, 10_000])
  })

  it('sends a timeout signal and turns network failures into JplFetchError', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('network down'))
    await expect(fetchJpl(url, { fetch, sleep: () => Promise.resolve() })).rejects.toBeInstanceOf(
      JplFetchError,
    )
    expect(fetch).toHaveBeenCalledTimes(3)
    const init = fetch.mock.calls[0]?.[1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('refuses a URL that is not JPL without fetching', async () => {
    const fetch = vi.fn()
    await expect(
      fetchJpl('https://example.com/', { fetch, sleep: () => Promise.resolve() }),
    ).rejects.toBeInstanceOf(JplFetchError)
    expect(fetch).not.toHaveBeenCalled()
  })
})

function memoryStore(): BudgetStore & { data: Map<string, number> } {
  const data = new Map<string, number>()
  return {
    data,
    get: (key) => Promise.resolve(data.get(key)),
    put: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
    delete: (key) => {
      data.delete(key)
      return Promise.resolve()
    },
    list: (prefix) => Promise.resolve([...data.keys()].filter((k) => k.startsWith(prefix))),
  }
}

describe('DailyBudget', () => {
  const at = (iso: string) => () => Date.parse(iso)

  it('allows up to the limit per UTC day, then refuses until midnight', async () => {
    const store = memoryStore()
    const budget = new DailyBudget(store, 2, at('2026-11-07T23:00:00Z'))
    expect(await budget.take()).toEqual({ ok: true })
    expect(await budget.take()).toEqual({ ok: true })
    expect(await budget.take()).toEqual({ ok: false, retryAfterSeconds: 3600 })
    expect(store.data.get('budget:2026-11-07')).toBe(2)
  })

  it('remembers the count across a restart, and drops yesterday on a new day', async () => {
    const store = memoryStore()
    store.data.set('budget:2026-11-06', 7)
    store.data.set('budget:2026-11-07', 1)
    let now = Date.parse('2026-11-07T12:00:00Z')
    const budget = new DailyBudget(store, 2, () => now)
    expect(await budget.take()).toEqual({ ok: true })
    expect((await budget.take()).ok).toBe(false)
    now = Date.parse('2026-11-08T00:00:01Z')
    expect(await budget.take()).toEqual({ ok: true })
    expect(store.data.has('budget:2026-11-07')).toBe(false)
    expect(store.data.get('budget:2026-11-08')).toBe(1)
  })

  it('drops every earlier day on the first take after a restart, for both shares (#225)', async () => {
    const store = memoryStore()
    store.data.set('budget:2026-11-05', 3)
    store.data.set('budget:2026-11-07', 9)
    store.data.set('budget:trajectory:2026-11-05', 4)
    store.data.set('budget:trajectory:2026-11-07', 6)
    const now = () => Date.parse('2026-11-08T00:00:01Z')
    // Fresh instances over the same storage: what a Durable Object eviction leaves.
    await new DailyBudget(store, 5, now).take()
    await new DailyBudget(store, 5, now, 'budget:trajectory').take()
    expect([...store.data.keys()].sort()).toEqual([
      'budget:2026-11-08',
      'budget:trajectory:2026-11-08',
    ])
  })

  it('does not touch the other share, today, or later rows when pruning', async () => {
    const store = memoryStore()
    store.data.set('budget:trajectory:2026-11-08', 2)
    store.data.set('budget:trajectory:2026-11-09', 1)
    store.data.set('budget:2026-11-08', 5)
    const now = () => Date.parse('2026-11-08T12:00:00Z')
    await new DailyBudget(store, 9, now).take()
    expect(store.data.get('budget:trajectory:2026-11-08')).toBe(2)
    expect(store.data.get('budget:trajectory:2026-11-09')).toBe(1)
    expect(store.data.get('budget:2026-11-08')).toBe(6)
  })

  it('lists storage once per instance, not per call', async () => {
    const store = memoryStore()
    const list = vi.spyOn(store, 'list')
    const budget = new DailyBudget(store, 9, () => Date.parse('2026-11-08T12:00:00Z'))
    await budget.take()
    await budget.take()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('still answers when pruning fails, and does not retry it on every call', async () => {
    const store = memoryStore()
    const list = vi.spyOn(store, 'list').mockRejectedValue(new Error('storage unavailable'))
    const budget = new DailyBudget(store, 9, () => Date.parse('2026-11-08T12:00:00Z'))
    expect(await budget.take()).toEqual({ ok: true })
    expect(await budget.take()).toEqual({ ok: true })
    expect(list).toHaveBeenCalledTimes(1)
    expect(store.data.get('budget:2026-11-08')).toBe(2)
  })
})

function budgetsOf(
  store: BudgetStore,
  lookup: number,
  trajectory: number,
  at = '2026-11-07T12:00:00Z',
) {
  const now = () => Date.parse(at)
  return {
    lookup: new DailyBudget(store, lookup, now),
    trajectory: new DailyBudget(store, trajectory, now, 'budget:trajectory'),
  }
}

describe('handleQueueRequest', () => {
  const ask = (body: unknown, method = 'POST') =>
    new Request('https://jpl-queue/ask', {
      method,
      body: method === 'POST' ? JSON.stringify(body) : null,
    })
  const jplUrl = 'https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=eros'

  function deps(over: Partial<QueueDeps> = {}): QueueDeps {
    return {
      queue: new SerialQueue({ maxPending: 4, minGapMs: 0 }),
      budgets: budgetsOf(memoryStore(), 100, 100),
      fetchJpl: vi.fn().mockResolvedValue({
        status: 300,
        body: '{"list":[]}',
        contentType: 'application/json',
        attempts: 1,
      }),
      ...over,
    }
  }

  it("passes JPL's answer through with its status in X-Jpl-Status", async () => {
    const d = deps()
    const res = await handleQueueRequest(ask({ url: jplUrl }), d)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Jpl-Status')).toBe('300')
    expect(await res.text()).toBe('{"list":[]}')
    expect(d.fetchJpl).toHaveBeenCalledWith(jplUrl)
  })

  it('refuses anything but a POST of a JPL URL', async () => {
    const d = deps()
    expect((await handleQueueRequest(ask(null, 'GET'), d)).status).toBe(405)
    expect((await handleQueueRequest(ask({ url: 'https://example.com/' }), d)).status).toBe(400)
    expect((await handleQueueRequest(ask({ nope: 1 }), d)).status).toBe(400)
    const junk = new Request('https://jpl-queue/ask', { method: 'POST', body: 'not json' })
    expect((await handleQueueRequest(junk, d)).status).toBe(400)
    expect(d.fetchJpl).not.toHaveBeenCalled()
  })

  it('answers 503 with Retry-After when the queue is full, without spending budget', async () => {
    const gate = deferred<{ status: number; body: string; contentType: null; attempts: number }>()
    const store = memoryStore()
    const d = deps({
      queue: new SerialQueue({ maxPending: 1, minGapMs: 0, taskSeconds: 5 }),
      budgets: budgetsOf(store, 100, 100),
      fetchJpl: vi.fn().mockReturnValue(gate.promise),
    })
    const first = handleQueueRequest(ask({ url: jplUrl }), d)
    await tick()
    const second = await handleQueueRequest(ask({ url: jplUrl }), d)
    expect(second.status).toBe(503)
    expect(second.headers.get('Retry-After')).toBe('5')
    expect(second.headers.get('X-Queue')).toBe('full')
    expect(store.data.get('budget:2026-11-07')).toBe(1)
    gate.resolve({ status: 200, body: '{}', contentType: null, attempts: 1 })
    expect((await first).status).toBe(200)
  })

  it('answers 503 until midnight once the day budget is spent', async () => {
    const d = deps({
      budgets: budgetsOf(memoryStore(), 0, 0, '2026-11-07T22:00:00Z'),
    })
    const res = await handleQueueRequest(ask({ url: jplUrl }), d)
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('7200')
    expect(res.headers.get('X-Queue')).toBe('budget')
    expect(d.fetchJpl).not.toHaveBeenCalled()
  })

  it('counts a trajectory request against its own share, apart from lookups (#223)', async () => {
    const store = memoryStore()
    const d = deps({ budgets: budgetsOf(store, 5, 1) })
    expect((await handleQueueRequest(ask({ url: jplUrl, share: 'trajectory' }), d)).status).toBe(
      200,
    )
    expect(store.data.get('budget:trajectory:2026-11-07')).toBe(1)
    expect(store.data.has('budget:2026-11-07')).toBe(false)
    expect((await handleQueueRequest(ask({ url: jplUrl, share: 'lookup' }), d)).status).toBe(200)
    expect(store.data.get('budget:2026-11-07')).toBe(1)
  })

  it('refuses a spent trajectory share the way a spent day is refused, and lookups go on', async () => {
    const d = deps({ budgets: budgetsOf(memoryStore(), 5, 1, '2026-11-07T22:00:00Z') })
    await handleQueueRequest(ask({ url: jplUrl, share: 'trajectory' }), d)
    const spent = await handleQueueRequest(ask({ url: jplUrl, share: 'trajectory' }), d)
    expect(spent.status).toBe(503)
    expect(spent.headers.get('X-Queue')).toBe('budget')
    expect(spent.headers.get('X-Queue-Share')).toBe('trajectory')
    expect(spent.headers.get('Retry-After')).toBe('7200')
    expect(d.fetchJpl).toHaveBeenCalledTimes(1)
    const lookup = await handleQueueRequest(ask({ url: jplUrl, share: 'lookup' }), d)
    expect(lookup.status).toBe(200)
  })

  it('counts a request with no share as a lookup, and refuses an unknown share', async () => {
    const store = memoryStore()
    const d = deps({ budgets: budgetsOf(store, 5, 5) })
    expect((await handleQueueRequest(ask({ url: jplUrl }), d)).status).toBe(200)
    expect(store.data.get('budget:2026-11-07')).toBe(1)
    const odd = await handleQueueRequest(ask({ url: jplUrl, share: 'everything' }), d)
    expect(odd.status).toBe(400)
    expect(d.fetchJpl).toHaveBeenCalledTimes(1)
  })

  it("splits 2,000 a day so trajectories can never take the lookups' remainder", () => {
    expect(TOTAL_DAILY_LIMIT).toBe(2000)
    expect(LOOKUP_DAILY_LIMIT + TRAJECTORY_DAILY_LIMIT).toBe(TOTAL_DAILY_LIMIT)
  })

  it('refuses a spent lookup share, and trajectories go on', async () => {
    const d = deps({ budgets: budgetsOf(memoryStore(), 1, 5) })
    await handleQueueRequest(ask({ url: jplUrl, share: 'lookup' }), d)
    const spent = await handleQueueRequest(ask({ url: jplUrl, share: 'lookup' }), d)
    expect(spent.status).toBe(503)
    expect(spent.headers.get('X-Queue-Share')).toBe('lookup')
    const trajectory = await handleQueueRequest(ask({ url: jplUrl, share: 'trajectory' }), d)
    expect(trajectory.status).toBe(200)
  })

  it.each([null, 1, true, ['trajectory']])('refuses a share of %j with 400', async (share) => {
    const d = deps()
    const res = await handleQueueRequest(ask({ url: jplUrl, share }), d)
    expect(res.status).toBe(400)
    expect(d.fetchJpl).not.toHaveBeenCalled()
  })

  it('answers 503 when JPL cannot be reached', async () => {
    const d = deps({ fetchJpl: vi.fn().mockRejectedValue(new JplFetchError('timeout')) })
    const res = await handleQueueRequest(ask({ url: jplUrl }), d)
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Jpl-Status')).toBe('0')
  })
})

describe('ClientLimit: one visitor cannot spend the day (#236)', () => {
  const ask = (body: unknown) =>
    new Request('https://jpl-queue/ask', { method: 'POST', body: JSON.stringify(body) })
  const jplUrl = 'https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=eros'
  const client = 'a'.repeat(64)
  const other = 'b'.repeat(64)

  function deps(now: () => number, limit = 3) {
    const store = memoryStore()
    return {
      store,
      d: {
        queue: new SerialQueue({ maxPending: 4, minGapMs: 0 }),
        budgets: budgetsOf(store, 100, 100),
        fetchJpl: vi.fn().mockResolvedValue({
          status: 200,
          body: '{}',
          contentType: 'application/json',
          attempts: 1,
        }),
        clients: new ClientLimit(limit, 3_600_000, now),
      } satisfies QueueDeps,
    }
  }

  it('refuses a visitor past the cap with 503, X-Queue: client and the wait, before spending budget', async () => {
    let t = 0
    const { d, store } = deps(() => t)
    for (let i = 0; i < 3; i += 1) {
      expect((await handleQueueRequest(ask({ url: jplUrl, client }), d)).status).toBe(200)
    }
    const spentBefore = [...store.data.values()].reduce((a, b) => a + b, 0)
    t = 600_000
    const refused = await handleQueueRequest(ask({ url: jplUrl, client }), d)
    expect(refused.status).toBe(503)
    expect(refused.headers.get('X-Queue')).toBe('client')
    expect(Number(refused.headers.get('Retry-After'))).toBe(3000)
    expect([...store.data.values()].reduce((a, b) => a + b, 0)).toBe(spentBefore)
    expect(d.fetchJpl).toHaveBeenCalledTimes(3)
  })

  it('counts each visitor apart, and lets one back in when the hour has passed', async () => {
    let t = 0
    const { d } = deps(() => t)
    for (let i = 0; i < 3; i += 1) await handleQueueRequest(ask({ url: jplUrl, client }), d)
    expect((await handleQueueRequest(ask({ url: jplUrl, client: other }), d)).status).toBe(200)
    t = 3_600_001
    expect((await handleQueueRequest(ask({ url: jplUrl, client }), d)).status).toBe(200)
  })

  it('caps nothing for a caller that names no client (a Function deployed before #236)', async () => {
    const { d } = deps(() => 0)
    for (let i = 0; i < 5; i += 1) {
      expect((await handleQueueRequest(ask({ url: jplUrl }), d)).status).toBe(200)
    }
  })

  it('refuses a malformed client id as a bad request', async () => {
    const { d } = deps(() => 0)
    expect((await handleQueueRequest(ask({ url: jplUrl, client: 'not-hex!' }), d)).status).toBe(400)
  })

  it('keeps its memory bounded: entries whose hour has passed are dropped', () => {
    let t = 0
    const limit = new ClientLimit(3, 1000, () => t)
    for (let i = 0; i < 50; i += 1) limit.take(i.toString(16).padStart(64, '0'))
    // Swept at most once a minute (#236 review): past that, the stale entries go.
    t = 61_000
    limit.take(client)
    expect(limit.size).toBe(1)
  })
})
