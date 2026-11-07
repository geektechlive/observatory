/** The orrery time bar's date text (#91): astronomical years reach 3000 BC. */
import { describe, expect, it } from 'vitest'

import { formatSimUtc, parseSimDate, toDateField } from '@/components/orrery/simDate'

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
