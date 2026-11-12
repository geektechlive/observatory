#!/usr/bin/env node
/**
 * One test run at a time on this machine (#224, ADR 0027).
 *
 * Usage: node scripts/test-lock.mjs <command> [args...]
 *
 * Overlapping runs from separate worktrees failed unrelated e2e specs under CPU load
 * (four times on 2026-11-12; each passed alone), and a run started straight after a
 * long one inherits its winding-down Chrome and Vite processes. So every test entry
 * point (`verify`, `test:unit`, `test:coverage`, `test:e2e`) runs through this lock:
 *
 * - The lock is a directory in the git common dir, so every worktree shares it.
 *   mkdir is atomic; a lock whose holder has died is cleared.
 * - After a long run the next one waits out a cool-down, then for the 1-minute load
 *   average to fall below half the cores (capped, so a busy machine can't stall it).
 * - The child gets OBS_TEST_LOCK_HELD=1, so verify's inner test steps re-enter
 *   instead of deadlocking, and playwright/vitest configs refuse to start without it.
 */
import { spawn, execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HELD_ENV = 'OBS_TEST_LOCK_HELD'
const COOLDOWN_MS = 30_000
const LONG_RUN_MS = 60_000
const LOAD_WAIT_CAP_MS = 180_000
const POLL_MS = 5_000
const MAX_WAIT_MS = 90 * 60_000

/** How long to wait after the previous run before starting; short runs need none. */
export function cooldownWaitMs(last, now) {
  if (!last || last.durationMs < LONG_RUN_MS) return 0
  return Math.max(0, last.endedAt + COOLDOWN_MS - now)
}

/** The machine is quiet enough to start when load is below half the cores. */
export function loadIsQuiet(load1, ncpu) {
  return load1 < ncpu / 2
}

function readOwner(lockDir) {
  try {
    return JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf8'))
  } catch {
    return null
  }
}

/** A lock directory with no owner file yet may be one another run is creating right now. */
const ORPHAN_AGE_MS = 30_000

function ageMs(dir, now) {
  try {
    return now - statSync(dir).mtimeMs
  } catch {
    return 0
  }
}

/** No run holds the lock this long; an older owner is a leftover (say, from before a reboot). */
const MAX_HOLD_MS = 3 * 60 * 60_000

/** The holder counts as alive while its wrapper or its test child is (a killed wrapper can orphan the suite). */
export function holderAlive(holder, isAlive, now) {
  if (typeof holder.startedAt === 'number' && now - holder.startedAt > MAX_HOLD_MS) return false
  return [holder.pid, holder.childPid].some(
    (pid) => Number.isInteger(pid) && pid > 0 && isAlive(pid),
  )
}

/**
 * Try once to take the lock. A lock whose holder has died, or a directory left with no
 * owner file for over 30 s, is cleared by renaming it aside first: only one waiter's
 * rename can win, and a waiter that finds it moved someone's fresh lock puts it back.
 */
export function tryAcquire(lockDir, owner, isAlive, now = Date.now(), tries = 3) {
  try {
    mkdirSync(lockDir)
  } catch (err) {
    if (err?.code !== 'EEXIST') throw err
    const holder = readOwner(lockDir)
    if (holder && holderAlive(holder, isAlive, now)) return { ok: false, holder }
    if (!holder && ageMs(lockDir, now) < ORPHAN_AGE_MS) {
      return { ok: false, holder: { pid: 0, cmd: '(starting)', cwd: '' } }
    }
    if (tries <= 0) return { ok: false, holder: holder ?? { pid: 0, cmd: '(clearing)', cwd: '' } }
    const aside = `${lockDir}.stale-${process.pid}-${now}-${tries}`
    try {
      renameSync(lockDir, aside)
    } catch {
      return tryAcquire(lockDir, owner, isAlive, now, tries - 1) // another waiter cleared it
    }
    if (JSON.stringify(readOwner(aside)) !== JSON.stringify(holder)) {
      // We moved a lock someone took after our read: give it back.
      try {
        renameSync(aside, lockDir)
      } catch {
        rmSync(aside, { recursive: true, force: true })
      }
      return { ok: false, holder: readOwner(lockDir) ?? holder ?? { pid: 0, cmd: '?', cwd: '' } }
    }
    rmSync(aside, { recursive: true, force: true })
    return tryAcquire(lockDir, owner, isAlive, now, tries - 1)
  }
  writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ ...owner, startedAt: Date.now() }))
  return { ok: true }
}

/** Record the test child's pid, so a killed wrapper still counts as holding the lock. */
export function recordChild(lockDir, childPid) {
  const holder = readOwner(lockDir)
  if (holder) writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ ...holder, childPid }))
}

/** Release the lock (only if `pid` still owns it) and record the run for the cool-down. */
export function releaseLock(lockDir, lastFile, run, pid) {
  const holder = readOwner(lockDir)
  if (pid !== undefined && holder && holder.pid !== pid) return
  rmSync(lockDir, { recursive: true, force: true })
  writeFileSync(lastFile, JSON.stringify(run))
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function lockPaths() {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim()
  const dir = resolve(common)
  return {
    lockDir: join(dir, 'observatory-test.lock'),
    lastFile: join(dir, 'observatory-test.last.json'),
  }
}

async function acquire(lockDir, cmd) {
  const started = Date.now()
  let lastNotice = 0
  for (;;) {
    const got = tryAcquire(lockDir, { pid: process.pid, cwd: process.cwd(), cmd }, isAlive)
    if (got.ok) return
    if (Date.now() - started > MAX_WAIT_MS) {
      throw new Error(
        `test-lock: waited ${MAX_WAIT_MS / 60_000} min for pid ${got.holder.pid}; giving up. If no test is running, delete ${lockDir}`,
      )
    }
    if (Date.now() - lastNotice > 60_000) {
      console.error(
        `test-lock: waiting for "${got.holder.cmd}" (pid ${got.holder.pid}) in ${got.holder.cwd}`,
      )
      lastNotice = Date.now()
    }
    await sleep(POLL_MS)
  }
}

function readLast(lastFile) {
  try {
    return existsSync(lastFile) ? JSON.parse(readFileSync(lastFile, 'utf8')) : null
  } catch {
    return null
  }
}

async function settle(lastFile) {
  const last = readLast(lastFile)
  const wait = cooldownWaitMs(last, Date.now())
  if (wait > 0) {
    console.error(`test-lock: cooling down ${Math.ceil(wait / 1000)} s after the last run`)
    await sleep(wait)
  }
  const ncpu = cpus().length
  const until = Date.now() + LOAD_WAIT_CAP_MS
  let said = false
  while (!loadIsQuiet(loadavg()[0], ncpu) && Date.now() < until) {
    if (!said) {
      console.error(
        `test-lock: load ${loadavg()[0].toFixed(1)} on ${ncpu} cores; waiting for it to settle`,
      )
      said = true
    }
    await sleep(POLL_MS)
  }
}

const SIGNALS = { SIGINT: 2, SIGHUP: 1, SIGTERM: 15 }

async function main(argv) {
  if (argv.length === 0) {
    console.error('usage: node scripts/test-lock.mjs <command> [args...]')
    return 2
  }
  const held = process.env[HELD_ENV] === '1'
  let child = null
  let lockDir = null

  // Signals are handled from the start, so a Ctrl-C while waiting still releases the
  // lock (process.exit fires 'exit'). While the child runs, the terminal already sends
  // SIGINT to the whole group, so it is not sent again (a second one force-quits
  // vitest and Playwright and skips their teardown); SIGTERM and SIGHUP are forwarded.
  for (const [sig, n] of Object.entries(SIGNALS)) {
    process.on(sig, () => {
      if (!child) process.exit(128 + n)
      if (sig !== 'SIGINT') child.kill(sig)
    })
  }

  const run = (env) =>
    new Promise((resolveExit) => {
      child = spawn(argv[0], argv.slice(1), { stdio: 'inherit', env, shell: false })
      if (lockDir && child.pid) recordChild(lockDir, child.pid)
      child.on('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)))
      child.on('error', (err) => {
        console.error(`test-lock: ${err.message}`)
        resolveExit(1)
      })
    })

  // Already inside the lock (verify's inner steps): just run.
  if (held) return run(process.env)

  const paths = lockPaths()
  let startedAt = Date.now()
  process.on('exit', () => {
    if (lockDir) {
      releaseLock(
        lockDir,
        paths.lastFile,
        { endedAt: Date.now(), durationMs: Date.now() - startedAt },
        process.pid,
      )
    }
  })
  await acquire(paths.lockDir, argv.join(' '))
  lockDir = paths.lockDir
  await settle(paths.lastFile)
  startedAt = Date.now() // the run's own length decides the next cool-down, not our wait
  return run({ ...process.env, [HELD_ENV]: '1' })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    },
  )
}
