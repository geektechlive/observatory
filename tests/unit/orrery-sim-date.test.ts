/** The orrery time bar's date text (#91): astronomical years reach 3000 BC. */
import { describe, expect, it } from 'vitest'

import {
  DAY_MS,
  formatSimUtc,
  parseSimDate,
  SCRUB_DAYS,
  scrubCentre,
  toDateField,
} from '@/components/orrery/simDate'

describe('scrubCentre (#114)', () => {
  const T0 = Date.parse('2026-11-06T00:00:00Z')

  it('keeps the window while the clock is inside it, edges included', () => {
    expect(scrubCentre(T0, T0 + 200 * DAY_MS)).toBe(T0)
    expect(scrubCentre(T0, T0 - SCRUB_DAYS * DAY_MS)).toBe(T0)
  })

  it('moves the window to the clock once it leaves, either way', () => {
    expect(scrubCentre(T0, T0 + (SCRUB_DAYS + 1) * DAY_MS)).toBe(T0 + (SCRUB_DAYS + 1) * DAY_MS)
    expect(scrubCentre(T0, T0 - 5000 * DAY_MS)).toBe(T0 - 5000 * DAY_MS)
  })
})

describe('simDate (#91)', () => {
  it('formats UTC with a 4-digit year', () => {
    expect(formatSimUtc(Date.parse('2026-11-06T14:05:00Z'))).toBe('2026-11-06 14:05 UTC')
  })

  it('parses and round-trips negative (astronomical) years', () => {
    const ms = parseSimDate('-2999-01-01')
    expect(ms).not.toBeNull()
    expect(toDateField(ms ?? 0)).toBe('-2999-01-01')
  })

  it('rejects dates outside 3000 BC – 3000 AD and impossible days', () => {
    expect(parseSimDate('3001-01-01')).toBeNull()
    expect(parseSimDate('-3000-01-01')).toBeNull()
    expect(parseSimDate('2026-02-31')).toBeNull()
    expect(parseSimDate('not a date')).toBeNull()
  })
})
