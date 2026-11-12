import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  cooldownWaitMs,
  HELD_ENV,
  holderAlive,
  loadIsQuiet,
  recordChild,
  releaseLock,
  tryAcquire,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/test-lock.mjs'
import { assertUnderTestLock } from '../../testLockGuard'

// #224: overlapping test runs from separate worktrees failed unrelated e2e specs
// four times on 2026-11-12; each passed alone.

describe('cooldownWaitMs', () => {
  it('waits out the rest of the cool-down after a long run', () => {
    const last = { endedAt: 1_000_000, durationMs: 300_000 }
    expect(cooldownWaitMs(last, 1_000_000 + 10_000)).toBe(20_000)
  })

  it('does not wait once the cool-down has passed', () => {
    const last = { endedAt: 1_000_000, durationMs: 300_000 }
    expect(cooldownWaitMs(last, 1_000_000 + 31_000)).toBe(0)
  })

  it('does not wait after a short run (a single unit file)', () => {
    const last = { endedAt: 1_000_000, durationMs: 4_000 }
    expect(cooldownWaitMs(last, 1_000_001)).toBe(0)
  })

  it('does not wait when there is no previous run', () => {
    expect(cooldownWaitMs(null, 5)).toBe(0)
  })
})

describe('loadIsQuiet', () => {
  it('is quiet below half the cores', () => {
    expect(loadIsQuiet(8.9, 18)).toBe(true)
  })

  it('is busy at or above half the cores', () => {
    expect(loadIsQuiet(9, 18)).toBe(false)
  })
})

describe('tryAcquire / releaseLock', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'obs-lock-'))

  it('takes a free lock and records its owner', () => {
    const lock = join(dir(), 'lock')
    expect(tryAcquire(lock, { pid: 42, cmd: 'vitest' }, () => true)).toEqual({ ok: true })
    const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')) as { pid: number }
    expect(owner.pid).toBe(42)
  })

  it('refuses a lock held by a live process and names the holder', () => {
    const lock = join(dir(), 'lock')
    tryAcquire(lock, { pid: 42, cmd: 'pnpm verify:gate' }, () => true)
    const second = tryAcquire(lock, { pid: 43, cmd: 'vitest' }, () => true)
    expect(second.ok).toBe(false)
    expect(second.holder?.cmd).toBe('pnpm verify:gate')
  })

  it('clears a lock whose holder has died, then takes it', () => {
    const lock = join(dir(), 'lock')
    tryAcquire(lock, { pid: 42, cmd: 'old' }, () => true)
    const alive = (pid: number) => pid !== 42
    expect(tryAcquire(lock, { pid: 43, cmd: 'new' }, alive)).toEqual({ ok: true })
  })

  it('leaves a just-made lock with no owner file yet (another run is creating it)', () => {
    const lock = join(dir(), 'lock')
    mkdirSync(lock)
    expect(tryAcquire(lock, { pid: 43, cmd: 'new' }, () => true).ok).toBe(false)
  })

  it('clears a lock left with no owner file for over 30 s', () => {
    const lock = join(dir(), 'lock')
    mkdirSync(lock)
    const later = Date.now() + 31_000
    expect(tryAcquire(lock, { pid: 43, cmd: 'new' }, () => true, later)).toEqual({ ok: true })
  })

  it('release removes the lock and records the run for the next cool-down', () => {
    const base = dir()
    const lock = join(base, 'lock')
    const last = join(base, 'last.json')
    tryAcquire(lock, { pid: 42, cmd: 'x' }, () => true)
    releaseLock(lock, last, { endedAt: 10, durationMs: 5 })
    expect(existsSync(lock)).toBe(false)
    expect(JSON.parse(readFileSync(last, 'utf8'))).toEqual({ endedAt: 10, durationMs: 5 })
  })

  it('release leaves another owner’s lock alone', () => {
    const base = dir()
    const lock = join(base, 'lock')
    tryAcquire(lock, { pid: 42, cmd: 'x' }, () => true)
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: 99, cmd: 'y' }))
    releaseLock(lock, join(base, 'last.json'), { endedAt: 1, durationMs: 1 }, 42)
    expect(existsSync(lock)).toBe(true)
  })
})

describe('holderAlive', () => {
  const now = 1_000_000_000

  it('counts a holder alive while its test child runs, though the wrapper died', () => {
    const holder = { pid: 1, childPid: 2, startedAt: now }
    expect(holderAlive(holder, (pid: number) => pid === 2, now)).toBe(true)
  })

  it('counts a holder dead when neither process runs', () => {
    expect(holderAlive({ pid: 1, childPid: 2, startedAt: now }, () => false, now)).toBe(false)
  })

  it('treats an owner older than 3 hours as a leftover, whatever its pid now is', () => {
    const holder = { pid: 1, startedAt: now - 3 * 60 * 60_000 - 1 }
    expect(holderAlive(holder, () => true, now)).toBe(false)
  })

  it('never treats pid 0 or a missing pid as alive (kill(0) would hit the group)', () => {
    expect(holderAlive({ pid: 0, startedAt: now }, () => true, now)).toBe(false)
  })
})

describe('recordChild', () => {
  it('adds the child pid to the owner, so a killed wrapper keeps the lock held', () => {
    const lock = join(mkdtempSync(join(tmpdir(), 'obs-lock-')), 'lock')
    tryAcquire(lock, { pid: 42, cmd: 'x' }, () => true)
    recordChild(lock, 77)
    const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')) as { childPid: number }
    expect(owner.childPid).toBe(77)
    expect(tryAcquire(lock, { pid: 43, cmd: 'y' }, (pid: number) => pid === 77).ok).toBe(false)
  })
})

describe('assertUnderTestLock', () => {
  it('passes inside the lock', () => {
    expect(() => {
      assertUnderTestLock({ [HELD_ENV]: '1' }, 'playwright')
    }).not.toThrow()
  })

  it('refuses to start outside the lock and names the command to use', () => {
    expect(() => {
      assertUnderTestLock({}, 'playwright')
    }).toThrow(/pnpm test:e2e/)
    expect(() => {
      assertUnderTestLock({}, 'vitest')
    }).toThrow(/pnpm test:unit/)
  })
})
