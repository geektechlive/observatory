import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Every handler failure says what kind it is (`X-Error-Kind`).
 *
 * A literal 502 is how a handler reports a payload it could not use: that is a
 * contract failure and must go through `contractError()`. Reported as a plain
 * `upstreamError(502, …)` it reads as an outage, so the health check retries the
 * shape drift and accepts a STALE fallback for it, which is the silent-drift failure
 * the check exists to catch. Availability failures pass the upstream status instead.
 */

const API_DIR = join(__dirname, '..', '..', 'functions', 'api')

describe('error kind contract', () => {
  it('no handler reports its own 502 through upstreamError', () => {
    const offenders = readdirSync(API_DIR)
      .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
      .filter((f) => /upstreamError\(\s*502\b/.test(readFileSync(join(API_DIR, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
