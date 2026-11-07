import { describe, expect, it } from 'vitest'

import {
  beforeDeadline,
  createDeadline,
  refreshOrreryBodies,
  stepBudget,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/refresh-data.mjs'

const MIN = 60_000
const HOUR = 3_600_000

/** A clock the test moves by hand. */
function manualClock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('the refresh job deadline (#128)', () => {
  it('counts down from the job start', () => {
    const clock = manualClock(1_000)
    const deadline = createDeadline({ budgetMs: 7 * MIN, clock: clock.now })
    expect(deadline.remaining()).toBe(7 * MIN)
    clock.advance(2 * MIN)
    expect(deadline.remaining()).toBe(5 * MIN)
    expect(deadline.passed()).toBe(false)
    clock.advance(6 * MIN)
    expect(deadline.passed()).toBe(true)
  })

  it("gives a step its own budget or what's left of the job's, whichever is less", () => {
    const clock = manualClock()
    const deadline = createDeadline({ budgetMs: 7 * MIN, clock: clock.now })
    expect(stepBudget(4 * MIN, deadline)).toBe(4 * MIN)
    clock.advance(5 * MIN)
    expect(stepBudget(4 * MIN, deadline)).toBe(2 * MIN)
  })

  it('gives a step past the deadline a budget that allows no request at all', () => {
    const clock = manualClock()
    const deadline = createDeadline({ budgetMs: MIN, clock: clock.now })
    clock.advance(2 * MIN)
    // The steps check `elapsed > budget` before each request; elapsed starts at 0.
    expect(stepBudget(4 * MIN, deadline)).toBeLessThan(0)
  })

  it('refuses a fetch once the deadline has passed, so the source is judged by its age', async () => {
    const clock = manualClock()
    const deadline = createDeadline({ budgetMs: MIN, clock: clock.now })
    let calls = 0
    const fetch = beforeDeadline(async () => {
      calls += 1
      return 'ok'
    }, deadline)
    await expect(fetch()).resolves.toBe('ok')
    clock.advance(2 * MIN)
    await expect(fetch()).rejects.toThrow(/deadline/)
    expect(calls).toBe(1)
  })
})

describe('JPL steps under the job deadline (#128)', () => {
  const NOW = Date.UTC(2026, 10, 7, 12)

  it('asks Horizons nothing once the job is out of time, and judges the copy by age', async () => {
    const clock = manualClock()
    const deadline = createDeadline({ budgetMs: MIN, clock: clock.now })
    clock.advance(2 * MIN)
    let asked = 0
    const young = JSON.stringify({
      generatedAt: new Date(NOW - 10 * HOUR).toISOString(),
      bodies: [],
    })
    const { entry, write } = await refreshOrreryBodies(null, {
      now: NOW,
      fetchText: async () => {
        asked += 1
        return ''
      },
      previousText: young,
      pauseMs: 0,
      budgetMs: stepBudget(4 * MIN, deadline),
    })
    expect(asked).toBe(0)
    expect(entry.ok).toBe(true)
    expect(write).toBeUndefined()
  })

  it('ships what it fetched before the budget ran out, the rest listed as missing', async () => {
    const clock = manualClock()
    // Each Horizons answer takes 30 s; the step may spend 90 s.
    const fetchText = async (url: string) => {
      clock.advance(30_000)
      const p = new URL(url).searchParams
      const id = (p.get('COMMAND') ?? '').replace(/'/g, '')
      const start = Number((p.get('START_TIME') ?? '').replace(/'|JD/g, ''))
      return `Target body name: X (${id})\n$$SOE\n${String(start)}, A.D. x, 1, 0.5, 0, 0, 0.017, 0,\n${String(start + 1)}, A.D. x, 1, 0.5, 0, 0, 0.017, 0,\n$$EOE\n`
    }
    const { entry, write } = await refreshOrreryBodies(null, {
      now: NOW,
      fetchText,
      previousText: null,
      pauseMs: 0,
      budgetMs: 90_000,
      clock: clock.now,
    })
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(true)
    expect(entry.detail).toMatch(/time budget spent/)
    const payload = JSON.parse(write.value)
    expect(payload.bodies.length).toBeGreaterThan(0)
    expect(payload.missing.length).toBeGreaterThan(0)
  })
})
