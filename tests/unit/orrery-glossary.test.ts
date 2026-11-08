import { describe, expect, it } from 'vitest'

import { GLOSSARY, GLOSSARY_IDS, glossaryEntry } from '@/lib/orrery/glossary'

describe('the orrery glossary (#159)', () => {
  it('has the terms the guide and the inspector use', () => {
    for (const id of [
      'au',
      'ecliptic',
      'perihelion',
      'aphelion',
      'l1',
      'l2',
      'pha',
      'light-time',
      'range-rate',
      'epoch',
      'tle-omm',
      'heliopause',
      'opposition',
      'retrograde',
      'earth-radius',
      'geostationary',
      'ephemeris',
      'coarse',
      'dsn',
    ]) {
      expect(GLOSSARY_IDS).toContain(id)
    }
  })

  it('keeps ids unique', () => {
    expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length)
  })

  it('gives every entry a plain short definition and a source', () => {
    for (const e of GLOSSARY) {
      expect(e.term.length, e.id).toBeGreaterThan(0)
      expect(e.short.length, e.id).toBeGreaterThan(30)
      // Small enough for a popover on a phone.
      expect(e.short.length, e.id).toBeLessThanOrEqual(260)
      expect(e.source.length, e.id).toBeGreaterThan(8)
    }
  })

  it('has no em or en dashes in any text', () => {
    for (const e of GLOSSARY) {
      expect(`${e.term} ${e.short} ${e.more ?? ''}`, e.id).not.toMatch(/[–—]/)
    }
  })

  it('looks an entry up by id', () => {
    expect(glossaryEntry('au').term).toBe('Astronomical unit (au)')
    expect(glossaryEntry('au').short).toContain('149.6 million km')
  })

  it('defines a potentially hazardous asteroid as NASA does, without alarm', () => {
    const pha = glossaryEntry('pha').short
    expect(pha).toContain('0.05 au')
    expect(pha).toContain('140 m')
    expect(pha.toLowerCase()).toContain('not')
  })
})
