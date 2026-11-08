import { describe, expect, it } from 'vitest'

import {
  BROWSE_SATELLITES_SENTENCE,
  DATA_SOURCES,
  GUIDE_FLAGS,
  SECTIONS,
  sectionText,
} from '@/components/orrery/guide/sections'
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

  it('names the browse-satellites panel only once it ships', () => {
    // Off until #158 lands: flip GUIDE_FLAGS.browseSatellites to true to add the sentence.
    const finding = SECTIONS.find((s) => s.id === 'finding')
    const text = finding ? sectionText(finding) : ''
    expect(text.includes(BROWSE_SATELLITES_SENTENCE)).toBe(GUIDE_FLAGS.browseSatellites)
  })

  it('gives every data source a link, what it gives and how fresh it is', () => {
    const known = new Set(SOURCES.map((s) => s.id))
    expect(DATA_SOURCES.length).toBeGreaterThanOrEqual(8)
    for (const d of DATA_SOURCES) {
      // A registry id where the registry has one, so the guide and the Data sources list agree.
      expect(d.sourceId === undefined || known.has(d.sourceId), d.name).toBe(true)
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
})
