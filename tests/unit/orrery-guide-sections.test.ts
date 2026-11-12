import { describe, expect, it } from 'vitest'

import { DATA_SOURCES, SECTIONS, sectionText } from '@/components/orrery/guide/sections'
import { GLOSSARY_IDS } from '@/lib/orrery/glossary'
import { SOURCES } from '@/lib/orrery/sources'

describe('the guide reference sections (#159)', () => {
  it('covers every topic in the brief, in order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      'getting-around',
      'time',
      'finding',
      'inspector',
      'colours',
      'scale',
      'data',
    ])
  })

  it('writes no em or en dashes', () => {
    // The Earth–Moon button's own name is the one place an en dash belongs.
    for (const s of SECTIONS) {
      expect(sectionText(s).replaceAll('Earth–Moon', ''), s.id).not.toMatch(/[–—]/)
    }
  })

  it('only points at glossary terms that exist', () => {
    for (const s of SECTIONS) {
      for (const b of s.blocks) {
        if (b.kind === 'terms') for (const id of b.ids) expect(GLOSSARY_IDS).toContain(id)
      }
    }
  })

  it('points to the satellite browser (#158) for finding a satellite without its name', () => {
    const finding = SECTIONS.find((s) => s.id === 'finding')
    const text = finding ? sectionText(finding) : ''
    expect(text).toContain('Browse satellites')
    expect(text).toContain('without knowing its name')
  })

  it('gives every data source a link, what it gives and how fresh it is', () => {
    const known = new Set(SOURCES.map((s) => s.id))
    expect(DATA_SOURCES.length).toBeGreaterThanOrEqual(8)
    for (const d of DATA_SOURCES) {
      // Every guide entry is in the Data sources list (#207), so the two agree.
      expect(d.sourceId !== undefined && known.has(d.sourceId), d.name).toBe(true)
      expect(d.url, d.name).toMatch(/^https:\/\//)
      expect(d.fresh.length, d.name).toBeGreaterThan(10)
      expect(d.gives.length, d.name).toBeGreaterThan(10)
    }
    for (const name of [
      'JPL Horizons',
      'JPL Close Approach Data',
      'JPL Scout',
      'ESA NEOCC',
      'CelesTrak',
      'Space-Track.org',
      'ESA DISCOSweb',
      'NOAA GOES SUVI',
    ]) {
      expect(DATA_SOURCES.map((d) => d.name)).toContain(name)
    }
  })

  it('explains every source in the Data sources list, at the same link (#207)', () => {
    for (const s of SOURCES) {
      const d = DATA_SOURCES.find((x) => x.sourceId === s.id)
      expect(d?.url, s.id).toBe(s.docs)
    }
  })

  it('links to the final address, not one that redirects (#207)', () => {
    for (const d of DATA_SOURCES) expect(d.url, d.name).not.toContain('www.swpc.noaa.gov')
  })
})
