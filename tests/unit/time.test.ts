import { describe, it, expect } from 'vitest'
import { utcTimeString, localTimeString, localTimezoneAbbr, isoDateUtc } from '@/lib/time'

describe('utcTimeString', () => {
  it('returns HH:MM:SS format', () => {
    expect(utcTimeString()).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})

describe('localTimeString', () => {
  it('returns HH:MM:SS format', () => {
    expect(localTimeString()).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})

describe('localTimezoneAbbr', () => {
  it('returns a string', () => {
    expect(typeof localTimezoneAbbr()).toBe('string')
  })
})

describe('isoDateUtc', () => {
  it('returns YYYY-MM-DD format with no offset', () => {
    expect(isoDateUtc(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns YYYY-MM-DD format with positive offset', () => {
    expect(isoDateUtc(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns YYYY-MM-DD format with negative offset', () => {
    expect(isoDateUtc(-1)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('defaults to offset 0', () => {
    expect(isoDateUtc()).toBe(isoDateUtc(0))
  })
})
