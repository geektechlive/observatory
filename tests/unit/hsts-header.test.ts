/**
 * HSTS (#248): the zone's own setting is what visitors get (180 days, no subdomains, no
 * preload); public/_headers claimed a year, includeSubDomains and preload, which the site
 * never sent. The owner chose (2026-11-14) to make the file match the live header rather than
 * raise the zone: includeSubDomains and preload would bind every geektechlive.com host and
 * are hard to undo.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const headers = readFileSync(join(import.meta.dirname, '..', '..', 'public', '_headers'), 'utf8')
const hsts = /Strict-Transport-Security:\s*(.+)/.exec(headers)?.[1]?.trim()

describe('HSTS in public/_headers (#248)', () => {
  it('matches what the zone sends: 180 days, no subdomains, no preload', () => {
    expect(hsts).toBe('max-age=15552000')
  })
})
